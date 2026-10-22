const path = require('path');
const googleConnection = require('../services/googleConnection');
const driveBackup = require('../services/googleDriveBackup');
const driveRestore = require('../services/driveRestore');
const { adminPinMatches } = require('../utils/adminPin');

module.exports = async function (fastify, opts) {
  const db = opts.db;
  // The uploads directory the server itself uses (index.js's UPLOADS_ROOT),
  // threaded into the backup/restore services — no guessing from DB_PATH.
  const uploadsDir = opts.uploadsDir || null;
  const demoMode = opts.demoMode === true;
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(__dirname, '../data/tasks.db');

  driveBackup.initAutomatedBackupScheduler(db, dbPath, uploadsDir);

  fastify.get('/api/backup/drive/status', async (request, reply) => {
    try {
      const getSetting = (key) => {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : null;
      };

      return {
        autoEnabled: getSetting('DRIVE_BACKUP_AUTO_ENABLED') === 'true',
        backupTime: getSetting('DRIVE_BACKUP_TIME') || '02:00',
        serverTimezone: process.env.TZ || 'America/Los_Angeles',
        restore: driveRestore.getRestoreStatus(dbPath),
      };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/api/backup/drive/config', async (request, reply) => {
    const { autoEnabled, backupTime } = request.body || {};
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    try {
      db.transaction(() => {
        if (typeof autoEnabled !== 'undefined') {
          upsert.run('DRIVE_BACKUP_AUTO_ENABLED', autoEnabled ? 'true' : 'false');
        }
        if (typeof backupTime !== 'undefined') {
          upsert.run('DRIVE_BACKUP_TIME', String(backupTime).trim());
        }
      })();
      return { success: true };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.get('/api/backup/drive/list', async (request, reply) => {
    try {
      const account = googleConnection.getConnectedAccount(db);
      if (!account) return reply.status(404).send({ error: 'No Google account connected.' });
      const files = await driveBackup.listDriveBackups(db, account.id);
      return { files };
    } catch (err) {
      fastify.log.error(`[DriveBackup] List failed: ${err.message}`);
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/api/backup/drive/upload', async (request, reply) => {
    try {
      const account = googleConnection.getConnectedAccount(db);
      if (!account) return reply.status(404).send({ error: 'No Google account connected.' });
      const result = await driveBackup.uploadBackupToDrive(db, account.id, dbPath, uploadsDir);
      return { success: true, file: result };
    } catch (err) {
      fastify.log.error(`[DriveBackup] Upload failed: ${err.message}`);
      return reply.code(500).send({ error: err.message });
    }
  });

  // --- Restore -------------------------------------------------------------
  // Restores are staged, never applied to the running server. The swap
  // happens at the next start, before the database is opened (see
  // services/driveRestore.js). Staging validates the backup end-to-end and
  // snapshots the current data set so the restore can be rolled back.

  fastify.post('/api/backup/drive/restore/stage', async (request, reply) => {
    const { fileId } = request.body || {};
    if (!fileId || typeof fileId !== 'string') {
      return reply.code(400).send({ error: 'A backup fileId is required.' });
    }
    try {
      const account = googleConnection.getConnectedAccount(db);
      if (!account) return reply.status(404).send({ error: 'No Google account connected.' });
      const staged = await driveRestore.stageRestoreFromDrive(db, dbPath, account.id, fileId, uploadsDir);
      return { success: true, staged };
    } catch (err) {
      fastify.log.error(`[DriveRestore] Stage failed: ${err.message}`);
      const code = /already staged/.test(err.message) ? 409 : 400;
      return reply.code(code).send({ error: err.message });
    }
  });

  // Download the encryption key bundled in one backup. Needed when moving
  // to a new device whose ENCRYPTION_KEY (from its environment — e.g. a
  // Proxmox install's /opt/homeglow/.env) differs from the backup's key:
  // staging refuses in that case, and this key is what the new server's
  // ENCRYPTION_KEY must be set to before the restore can proceed.
  //
  // The one route that hands out a secret: the key that unlocks every stored
  // credential. The Admin Panel's PIN only guards the panel, not the API, so
  // this route checks the PIN itself when one is set (the body's `pin`), and
  // the public demo never serves it.
  fastify.post('/api/backup/drive/backup-key', async (request, reply) => {
    if (demoMode) {
      return reply.code(403).send({ error: 'Not available in the demo.' });
    }
    const { fileId, pin } = request.body || {};
    if (!fileId || typeof fileId !== 'string') {
      return reply.code(400).send({ error: 'A backup fileId is required.' });
    }
    if (!adminPinMatches(db, pin)) {
      return reply.code(403).send({ error: 'The admin PIN is needed to download an encryption key.' });
    }
    try {
      const account = googleConnection.getConnectedAccount(db);
      if (!account) return reply.status(404).send({ error: 'No Google account connected.' });
      const key = await driveRestore.extractBackupKey(db, account.id, fileId);
      if (!key) {
        return reply.code(404).send({ error: 'That backup does not contain an encryption key (it was made on an install with no key configured).' });
      }
      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="homeglow-encryption-key.txt"')
        .send(key);
    } catch (err) {
      fastify.log.error(`[DriveBackup] Key download failed: ${err.message}`);
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/api/backup/drive/restore/rollback', async (request, reply) => {
    try {
      const staged = driveRestore.stageRollback(db, dbPath, uploadsDir);
      return { success: true, staged };
    } catch (err) {
      fastify.log.error(`[DriveRestore] Rollback stage failed: ${err.message}`);
      const code = /already staged/.test(err.message) ? 409 : 400;
      return reply.code(code).send({ error: err.message });
    }
  });

  fastify.post('/api/backup/drive/restore/cancel', async (request, reply) => {
    try {
      driveRestore.cancelStagedRestore(dbPath);
      return { success: true };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Exit the process so the staged restore is applied on the way back up.
  // Under Docker/systemd a supervisor restarts the service; without one,
  // the staged restore simply applies at the next manual start.
  fastify.post('/api/backup/drive/restart', async (request, reply) => {
    if (!driveRestore.isRestoreStaged(dbPath)) {
      return reply.code(400).send({ error: 'No restore is staged.' });
    }
    reply.send({ success: true, message: 'Restarting to apply the staged restore.' });
    setTimeout(() => {
      fastify.log.info('[DriveRestore] Exiting so the staged restore is applied on restart.');
      process.exit(0);
    }, 750);
  });
};
