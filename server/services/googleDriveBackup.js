// Google Drive backup & transfer for the HomeGlow data set. Each backup is
// a .tar.gz containing tasks.db, the .encryption-key (without it the DB's
// encrypted tokens are unrecoverable), the uploads directory, and a
// manifest.json describing the bundle (schema version + file hashes, used
// to validate the backup before a restore). Backups are uploaded to the
// connected Google account's Drive (drive.file scope: the app can only see
// files it created). Retention: newest 14 backups are kept.
//
// The same mechanism doubles as device transfer: install HomeGlow on a new
// device, connect the same Google account, and restore a backup there.
//
// Restores are staged and applied at boot (see services/driveRestore.js) —
// the live database is never overwritten under a running server. A manual
// fallback remains: download a backup from Drive, stop the stack, extract
// it into the data directory, and start the stack again.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const googleConnection = require('./googleConnection');
const { getEncryptionKeyFilePath } = require('../utils/encryption');

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';
const KEEP_BACKUPS = 14;
const SCHEMA_ID_KEY = 'SYSTEM_SCHEMA_ID';

let backupIntervalTimer = null;

function resolveUploadsDir(dbPath) {
  if (fs.existsSync('/app/uploads')) {
    return '/app/uploads';
  }
  const serverUploads = path.resolve(path.dirname(dbPath), '..', 'uploads');
  if (fs.existsSync(serverUploads)) {
    return serverUploads;
  }
  return null;
}

// The schema version recorded in a database's settings table. The running
// (fully migrated) database's version is the newest schema this build can
// open, which is what restore validation compares against.
function getSchemaVersion(db) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SCHEMA_ID_KEY);
    if (!row) return null;
    const parsed = Number.parseInt(row.value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch (_) {
    return null;
  }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else if (entry.isFile()) count += 1;
  }
  return count;
}

// Assemble a backup archive at archivePath from the live data set and
// return its manifest. The database is WAL-checkpointed first so the copy
// is consistent. Callers own the resulting file.
function createBackupArchive(db, dbPath, archivePath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file not found for backup.');
  }

  // Flush the WAL into the main database file so the copy is consistent.
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (ckptErr) {
    console.warn('[DriveBackup] WAL checkpoint warning:', ckptErr.message);
  }

  const tmpStaging = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-backup-'));
  try {
    const stagedDb = path.join(tmpStaging, 'tasks.db');
    fs.copyFileSync(dbPath, stagedDb);

    const manifest = {
      app: 'homeglow',
      backupFormat: 1,
      createdAt: new Date().toISOString(),
      schemaVersion: getSchemaVersion(db),
      files: {
        'tasks.db': { sha256: sha256File(stagedDb), size: fs.statSync(stagedDb).size },
      },
    };

    // Back up the key file the encryption module actually reads, which is
    // not necessarily beside the database (DB_PATH can relocate the DB).
    const keyPath = getEncryptionKeyFilePath();
    if (fs.existsSync(keyPath)) {
      const stagedKey = path.join(tmpStaging, '.encryption-key');
      fs.copyFileSync(keyPath, stagedKey);
      manifest.files['.encryption-key'] = { sha256: sha256File(stagedKey) };
    }

    const uploadsDir = resolveUploadsDir(dbPath);
    if (uploadsDir) {
      const stagedUploads = path.join(tmpStaging, 'uploads');
      fs.cpSync(uploadsDir, stagedUploads, { recursive: true });
      manifest.files.uploads = { fileCount: countFiles(stagedUploads) };
    }

    fs.writeFileSync(path.join(tmpStaging, 'manifest.json'), JSON.stringify(manifest, null, 2));
    execFileSync('tar', ['-czf', archivePath, '-C', tmpStaging, '.']);
    return manifest;
  } finally {
    try {
      if (fs.existsSync(tmpStaging)) fs.rmSync(tmpStaging, { recursive: true, force: true });
    } catch (_) {}
  }
}

async function uploadBackupToDrive(db, accountId, dbPath) {
  const accessToken = await googleConnection.getValidAccessToken(db, accountId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `homeglow-backup-${timestamp}.tar.gz`;
  const archivePath = path.join(os.tmpdir(), filename);

  try {
    createBackupArchive(db, dbPath, archivePath);

    const fileBuffer = fs.readFileSync(archivePath);
    const localMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const metadata = { name: filename, mimeType: 'application/gzip' };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileBuffer], { type: 'application/gzip' }));

    const res = await fetch(`${UPLOAD_API_BASE}/files?uploadType=multipart&fields=id,name,md5Checksum`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive backup upload failed (${res.status}): ${errText}`);
    }

    const result = await res.json();

    // Verify the stored file matches what was sent; a truncated upload
    // should fail loudly tonight, not on the night it is needed.
    if (result.md5Checksum && result.md5Checksum !== localMd5) {
      try {
        await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(result.id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (_) {}
      throw new Error('Google Drive backup upload verification failed: checksum mismatch. The corrupt upload was deleted; please retry.');
    }

    // Prune old backups beyond the retention count (list is newest-first).
    try {
      const files = await listDriveBackups(db, accountId);
      if (files.length > KEEP_BACKUPS) {
        for (const f of files.slice(KEEP_BACKUPS)) {
          await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(f.id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
      }
    } catch (pruneErr) {
      console.warn('[DriveBackup] Prune warning:', pruneErr.message);
    }

    return result;
  } finally {
    try {
      if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    } catch (_) {}
  }
}

async function listDriveBackups(db, accountId) {
  const accessToken = await googleConnection.getValidAccessToken(db, accountId);
  const query = encodeURIComponent("name contains 'homeglow-backup-' and trashed = false");
  const res = await fetch(`${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,createdTime,size,md5Checksum)&orderBy=createdTime desc&pageSize=20`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to list Google Drive backups: ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

function initAutomatedBackupScheduler(db, dbPath) {
  if (backupIntervalTimer) clearInterval(backupIntervalTimer);

  let lastRunDate = null;

  backupIntervalTimer = setInterval(async () => {
    try {
      // Opt-in: automated backups run only when explicitly enabled.
      const enabledRow = db.prepare("SELECT value FROM settings WHERE key = 'DRIVE_BACKUP_AUTO_ENABLED'").get();
      if (!enabledRow || enabledRow.value !== 'true') return;

      // Never back up over a staged restore: the staged snapshot is the
      // state the user asked to return to, and the pre-restore snapshot
      // must stay the newest word on what current state was.
      try {
        const { isRestoreStaged } = require('./driveRestore');
        if (isRestoreStaged(dbPath)) return;
      } catch (_) {}

      const timeRow = db.prepare("SELECT value FROM settings WHERE key = 'DRIVE_BACKUP_TIME'").get();
      const targetTime = timeRow?.value || '02:00';
      const [targetH, targetM] = targetTime.split(':').map(Number);

      const tz = process.env.TZ || 'America/Los_Angeles';
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = formatter.formatToParts(new Date());
      const getPart = (type) => parts.find((p) => p.type === type)?.value;
      const currentH = Number(getPart('hour'));
      const currentM = Number(getPart('minute'));
      const todayStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;

      if (currentH === targetH && currentM === targetM && lastRunDate !== todayStr) {
        const account = googleConnection.getConnectedAccount(db);
        if (account) {
          console.log(`[DriveBackup] Starting scheduled backup for ${todayStr} at ${targetTime} (${tz})...`);
          await uploadBackupToDrive(db, account.id, dbPath);
          lastRunDate = todayStr;
          console.log('[DriveBackup] Scheduled backup finished successfully.');
        }
      }
    } catch (err) {
      console.error('[DriveBackup:Scheduler] Scheduled backup error:', err.message);
    }
  }, 45000);
}

module.exports = {
  uploadBackupToDrive,
  listDriveBackups,
  initAutomatedBackupScheduler,
  createBackupArchive,
  getSchemaVersion,
  resolveUploadsDir,
  SCHEMA_ID_KEY,
};
