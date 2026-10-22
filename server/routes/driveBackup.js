const path = require('path');
const googleConnection = require('../services/googleConnection');
const driveBackup = require('../services/googleDriveBackup');
const driveRestore = require('../services/driveRestore');

module.exports = async function (fastify, opts) {
  const db = opts.db;
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(__dirname, '../data/tasks.db');

  driveBackup.initAutomatedBackupScheduler(db, dbPath);

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
      const result = await driveBackup.uploadBackupToDrive(db, account.id, dbPath);
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
      const staged = await driveRestore.stageRestoreFromDrive(db, dbPath, account.id, fileId);
      return { success: true, staged };
    } catch (err) {
      fastify.log.error(`[DriveRestore] Stage failed: ${err.message}`);
      const code = /already staged/.test(err.message) ? 409 : 400;
      return reply.code(code).send({ error: err.message });
    }
  });

  fastify.post('/api/backup/drive/restore/rollback', async (request, reply) => {
    try {
      const staged = driveRestore.stageRollback(db, dbPath);
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
