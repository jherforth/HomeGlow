// Backup to a file and restore from one, without Google (issue #305).
//
// The same archive and restore as the Google Drive backup (#304): export
// downloads what a Drive backup holds (database, the encryption key in use,
// uploads, manifest.json); import uploads such a file and stages it through
// stageRestoreArchive, which verifies it, saves the current data for
// rollback and applies it at the next start. Restart, cancel and roll back
// are the shared /api/backup/drive/restore/* and /api/backup/drive/restart
// routes, which are not Google-specific.
//
//   POST /api/backup/local/export   { pin? }  -> the .tar.gz, as a download
//   POST /api/backup/local/import   multipart, pin? then one file -> { staged }
//
// An export holds the key that unlocks every stored credential, and an import
// replaces the household's data, so both ask for the admin PIN when one is
// set. An import's `pin` field must come before its file. Neither is
// available in the demo.
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const driveBackup = require('../services/googleDriveBackup');
const driveRestore = require('../services/driveRestore');
const { checkAdminPin, refusePin } = require('../utils/adminPin');

// The largest backup file an import takes. Photos can make a backup large;
// the bundled nginx allows the same (client/nginx.conf).
const MAX_IMPORT_BYTES = 4 * 1024 * 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');
// homeglow-backup-2026-10-22-1430.tar.gz, in the household's time.
function exportFilename(now = new Date()) {
  return `homeglow-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.tar.gz`;
}

// The name a staged restore shows: the uploaded file's own, tidied.
const displayName = (filename) => path.basename(String(filename || 'backup.tar.gz')).replace(/[^\w.\- ()]/g, '_').slice(0, 120);

function registerLocalBackupRoutes(fastify, { db, dbPath, uploadsDir = null, demoMode = false }) {
  const notInDemo = (reply) => {
    if (!demoMode) return false;
    reply.code(403).send({ error: 'Not available in the demo.' });
    return true;
  };

  fastify.post('/api/backup/local/export', async (request, reply) => {
    if (notInDemo(reply)) return undefined;
    const pinCheck = await checkAdminPin(db, request.body?.pin);
    if (!pinCheck.ok) return refusePin(reply, pinCheck, 'The admin PIN is needed to download a backup.');
    const workDir = fs.mkdtempSync(path.join(path.dirname(dbPath), 'export-'));
    const cleanUp = () => fs.rm(workDir, { recursive: true, force: true }, () => {});
    try {
      const name = exportFilename();
      const archive = path.join(workDir, name);
      driveBackup.createBackupArchive(db, dbPath, archive, uploadsDir);
      const stream = fs.createReadStream(archive);
      stream.on('close', cleanUp);
      return reply
        .header('Content-Type', 'application/gzip')
        .header('Content-Length', String(fs.statSync(archive).size))
        .header('Content-Disposition', `attachment; filename="${name}"`)
        // The panel names the saved file from this header; a browser lets a
        // page on another origin (a split frontend and API) read it only
        // when the response says so.
        .header('Access-Control-Expose-Headers', 'Content-Disposition')
        .send(stream);
    } catch (error) {
      cleanUp();
      fastify.log.error(`[LocalBackup] Export failed: ${error.message}`);
      return reply.code(500).send({ error: `The backup could not be made: ${error.message}` });
    }
  });

  fastify.post('/api/backup/local/import', async (request, reply) => {
    if (notInDemo(reply)) return undefined;
    let part;
    try {
      part = await request.file({ limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } });
    } catch (error) {
      return reply.code(400).send({ error: 'Send the backup file as a form upload.' });
    }
    if (!part) return reply.code(400).send({ error: 'Choose a backup file to import.' });
    // Checked before the file is written: a refused upload is drained, not kept.
    const pinCheck = await checkAdminPin(db, part.fields?.pin?.value);
    if (!pinCheck.ok) {
      part.file.resume();
      return refusePin(reply, pinCheck, 'The admin PIN is needed to restore a backup.');
    }

    // Kept beside the database, on the data volume, rather than in the
    // container's temp folder: a backup can be large.
    const upload = path.join(path.dirname(dbPath), `import-${process.pid}-${Date.now()}.tar.gz`);
    try {
      await pipeline(part.file, fs.createWriteStream(upload));
      if (part.file.truncated) {
        return reply.code(413).send({ error: `That file is larger than the ${MAX_IMPORT_BYTES / 1024 ** 3} GB a backup may be.` });
      }
      const staged = driveRestore.stageRestoreArchive(db, dbPath, {
        archivePath: upload,
        source: 'upload',
        name: displayName(part.filename),
        uploadsDir,
      });
      return { success: true, staged };
    } catch (error) {
      fastify.log.error(`[LocalBackup] Import failed: ${error.message}`);
      const code = /already staged|already in progress/.test(error.message) ? 409 : 400;
      return reply.code(code).send({ error: error.message });
    } finally {
      fs.rm(upload, { force: true }, () => {});
    }
  });
}

module.exports = { registerLocalBackupRoutes, exportFilename, MAX_IMPORT_BYTES };
