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
const { createArchive } = require('../utils/tarArchive');
const googleConnection = require('./googleConnection');
const { getEffectiveKeyForBackup } = require('../utils/encryption');

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';
const KEEP_BACKUPS = 14;
const SCHEMA_ID_KEY = 'SYSTEM_SCHEMA_ID';

let backupIntervalTimer = null;

// The uploads directory the server itself uses. index.js passes its
// UPLOADS_ROOT down through the routes; the fallback is the same location
// derived from this file's place in the tree (server/uploads), so it stays
// correct wherever DB_PATH points — never a guess relative to the DB.
function resolveUploadsDir(uploadsDir) {
  if (uploadsDir && fs.existsSync(uploadsDir)) {
    return uploadsDir;
  }
  const serverUploads = path.resolve(__dirname, '..', 'uploads');
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
function createBackupArchive(db, dbPath, archivePath, uploadsDir) {
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

    // Back up the key that is actually in use, which is NOT always the
    // key file: ENCRYPTION_KEY — set by the Proxmox installers into
    // /opt/homeglow/.env — wins over the file, so archiving the file
    // could archive a key nothing was encrypted with, and the restored
    // database's secrets would be unreadable. The effective key is
    // written into the archive AS the key file, so a file-based install
    // restoring this backup ends up with the right key; the manifest
    // records where the key came from.
    const effectiveKey = getEffectiveKeyForBackup();
    manifest.encryptionKeySource = effectiveKey ? effectiveKey.source : 'none';
    if (effectiveKey) {
      const stagedKey = path.join(tmpStaging, '.encryption-key');
      fs.writeFileSync(stagedKey, effectiveKey.key, { mode: 0o600 });
      manifest.files['.encryption-key'] = { sha256: sha256File(stagedKey) };
    }

    const uploadsSource = resolveUploadsDir(uploadsDir);
    if (uploadsSource) {
      const stagedUploads = path.join(tmpStaging, 'uploads');
      fs.cpSync(uploadsSource, stagedUploads, { recursive: true });
      manifest.files.uploads = { fileCount: countFiles(stagedUploads) };
    }

    fs.writeFileSync(path.join(tmpStaging, 'manifest.json'), JSON.stringify(manifest, null, 2));
    createArchive(archivePath, tmpStaging);
    return manifest;
  } finally {
    try {
      if (fs.existsSync(tmpStaging)) fs.rmSync(tmpStaging, { recursive: true, force: true });
    } catch (_) {}
  }
}

// --- Resumable, streamed upload -----------------------------------------
// A household that uploads photos to HomeGlow can have backups of
// hundreds of MB. The multipart upload is documented for files up to
// 5 MB, and reading the whole archive into memory risks OOM on the small
// machines HomeGlow runs on — so the archive is streamed from disk in
// chunks over a resumable session, hashing as it goes. Positional reads
// mean a failed chunk can be resent from the offset Drive acknowledges.

const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024; // multiple of Drive's 256 KiB quantum
const UPLOAD_MAX_ATTEMPTS_PER_CHUNK = 4;

async function initiateResumableUpload(accessToken, filename, size) {
  const res = await fetch(`${UPLOAD_API_BASE}/files?uploadType=resumable&fields=id,name,md5Checksum`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'application/gzip',
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify({ name: filename, mimeType: 'application/gzip' }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive backup upload failed to start (${res.status}): ${errText}`);
  }
  const sessionUri = res.headers.get('location');
  if (!sessionUri) throw new Error('Google Drive did not return a resumable upload session.');
  return sessionUri;
}

// Ask a resumable session how much it holds. Returns { complete, file } or
// { complete: false, offset } — the offset is the first byte Drive lacks.
async function queryUploadSession(sessionUri, size) {
  const res = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${size}`, 'Content-Length': '0' },
  });
  if (res.status === 200 || res.status === 201) {
    return { complete: true, file: await res.json().catch(() => null) };
  }
  const range = res.headers.get('range'); // "bytes=0-12345"
  const match = range && range.match(/bytes=0-(\d+)/);
  return { complete: false, offset: match ? Number(match[1]) + 1 : 0 };
}

async function uploadArchiveResumable(accessToken, archivePath, filename) {
  const size = fs.statSync(archivePath).size;
  const sessionUri = await initiateResumableUpload(accessToken, filename, size);
  const fd = fs.openSync(archivePath, 'r');
  const md5 = crypto.createHash('md5');
  try {
    // Bytes [0, hashedUpTo) have been fed to the MD5 exactly once.
    let hashedUpTo = 0;
    let offset = 0;
    while (offset < size) {
      const length = Math.min(UPLOAD_CHUNK_BYTES, size - offset);
      const chunk = Buffer.alloc(length);
      fs.readSync(fd, chunk, 0, length, offset);
      if (offset + length > hashedUpTo) {
        md5.update(chunk.subarray(Math.max(0, hashedUpTo - offset)));
        hashedUpTo = offset + length;
      }
      let attempts = 0;
      let resendFrom = null;
      while (resendFrom === null) {
        attempts += 1;
        let res = null;
        let transportError = null;
        try {
          res = await fetch(sessionUri, {
            method: 'PUT',
            headers: {
              'Content-Length': String(chunk.length),
              'Content-Range': `bytes ${offset}-${offset + chunk.length - 1}/${size}`,
            },
            body: chunk,
          });
        } catch (err) {
          transportError = err;
        }
        if (res && (res.status === 200 || res.status === 201)) {
          return { file: await res.json(), md5Hex: md5.digest('hex') };
        }
        if (res && res.status === 308) {
          const range = res.headers.get('range');
          const match = range && range.match(/bytes=0-(\d+)/);
          let acknowledged = match ? Number(match[1]) + 1 : null;
          if (acknowledged === null) {
            const queried = await queryUploadSession(sessionUri, size);
            if (queried.complete && queried.file) return { file: queried.file, md5Hex: md5.digest('hex') };
            acknowledged = queried.offset;
          }
          if (acknowledged >= size) {
            const status = await queryUploadSession(sessionUri, size);
            if (status.complete && status.file) return { file: status.file, md5Hex: md5.digest('hex') };
          }
          if (acknowledged > offset) {
            resendFrom = acknowledged; // partial or full chunk accepted; move on
            break;
          }
          // No progress acknowledged: fall through to the retry path below
          // (bounded by the per-chunk attempt cap).
          if (attempts >= UPLOAD_MAX_ATTEMPTS_PER_CHUNK) {
            throw new Error(`Google Drive backup upload stalled at byte ${offset} of ${size} after ${attempts} attempts.`);
          }
          continue;
        }
        const retryable = Boolean(transportError) || (res && res.status >= 500);
        if (!retryable) {
          const errText = res ? await res.text() : '';
          throw new Error(`Google Drive backup upload failed (${res ? res.status : 'network error'}): ${errText}`);
        }
        if (attempts >= UPLOAD_MAX_ATTEMPTS_PER_CHUNK) {
          throw new Error(`Google Drive backup upload stalled at byte ${offset} of ${size} after ${attempts} attempts.`);
        }
        const status = await queryUploadSession(sessionUri, size);
        if (status.complete && status.file) {
          return { file: status.file, md5Hex: md5.digest('hex') };
        }
        if (status.offset !== offset) {
          resendFrom = status.offset; // re-read from what Drive actually holds
        }
        // Otherwise retry the same chunk as-is.
      }
      offset = resendFrom;
    }
    const status = await queryUploadSession(sessionUri, size);
    if (status.complete && status.file) {
      return { file: status.file, md5Hex: md5.digest('hex') };
    }
    throw new Error('Google Drive upload ended without a completed file.');
  } finally {
    fs.closeSync(fd);
  }
}

async function uploadBackupToDrive(db, accountId, dbPath, uploadsDir) {
  const accessToken = await googleConnection.getValidAccessToken(db, accountId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `homeglow-backup-${timestamp}.tar.gz`;
  const archivePath = path.join(os.tmpdir(), filename);

  try {
    createBackupArchive(db, dbPath, archivePath, uploadsDir);

    const { file: result, md5Hex } = await uploadArchiveResumable(accessToken, archivePath, filename);

    // Verify the stored file matches what was sent; a truncated upload
    // should fail loudly tonight, not on the night it is needed.
    if (result.md5Checksum && result.md5Checksum !== md5Hex) {
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

function initAutomatedBackupScheduler(db, dbPath, uploadsDir) {
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
          await uploadBackupToDrive(db, account.id, dbPath, uploadsDir);
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
  uploadArchiveResumable,
  initiateResumableUpload,
  SCHEMA_ID_KEY,
};
