// Staged, boot-applied restore for Google Drive backups.
//
// A restore never overwrites the live database under the running server.
// Instead it is staged: the chosen backup is downloaded, extracted into
// <dataDir>/restore-staging, and fully validated while the current system
// keeps running untouched (archive integrity, SQLite integrity_check, and
// a schema-version gate — a backup written by a newer HomeGlow than this
// build is rejected, never half-applied). Staging also snapshots the
// current data set to <dataDir>/pre-restore/, so every restore is
// reversible via the rollback path, which is just a staged restore of that
// snapshot.
//
// The swap itself happens in applyPendingRestore(), called from index.js
// before the database is opened: current files move aside to
// <dataDir>/replaced-data/ (one generation kept), staged files move in,
// and the app then boots and migrates normally.
//
// All restore bookkeeping lives in <dataDir>/restore-state.json, outside
// the database, because the database is the thing being replaced.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const Database = require('better-sqlite3');
const googleConnection = require('./googleConnection');
const driveBackup = require('./googleDriveBackup');
const { getEncryptionKeyFilePath, encryptionKeysEqual } = require('../utils/encryption');

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

let stagingInProgress = false;

function getRestorePaths(dbPath, uploadsDir) {
  const dataDir = path.dirname(dbPath);
  const stagingDir = path.join(dataDir, 'restore-staging');
  return {
    dataDir,
    // The key file the encryption module actually reads — the staged key
    // must land exactly there, which is not necessarily beside the
    // database (DB_PATH can relocate the DB on its own).
    keyPath: getEncryptionKeyFilePath(),
    // The uploads directory the server itself uses (index.js passes its
    // UPLOADS_ROOT down); the fallback derives the same location from
    // this file's place in the tree.
    uploadsTarget: uploadsDir || path.resolve(__dirname, '..', 'uploads'),
    stagingDir,
    contentsDir: path.join(stagingDir, 'contents'),
    stateFile: path.join(dataDir, 'restore-state.json'),
    preRestoreDir: path.join(dataDir, 'pre-restore'),
    preRestoreArchive: path.join(dataDir, 'pre-restore', 'pre-restore.tar.gz'),
    replacedDir: path.join(dataDir, 'replaced-data'),
  };
}

function readState(dbPath) {
  const { stateFile } = getRestorePaths(dbPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return { staged: null, lastRestore: null, preRestore: null, ...parsed };
  } catch (_) {
    return { staged: null, lastRestore: null, preRestore: null };
  }
}

function writeState(dbPath, state) {
  const { stateFile } = getRestorePaths(dbPath);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function isRestoreStaged(dbPath) {
  if (!dbPath || dbPath === ':memory:') return false;
  return Boolean(readState(dbPath).staged);
}

function movePath(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}

// Swap a directory's CONTENTS entry by entry, never the directory
// itself. The standard docker-compose install mounts uploads on its own
// volume (./homeglow/uploads:/app/uploads), and renaming a mount point
// fails with EBUSY — but moving entries inside it is fine. Entries can
// still straddle filesystems (replaced-data/ lives on the data mount),
// which movePath's EXDEV copy fallback covers per entry.
function moveDirContents(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    movePath(path.join(srcDir, entry), path.join(destDir, entry));
  }
}

function clearDirContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

// The ENCRYPTION_KEY environment variable wins over the key file (see
// utils/encryption.js), and the Proxmox installers generate one into
// /opt/homeglow/.env. Restoring a backup made under a DIFFERENT key onto
// such an install would swap in a new key file the server ignores, and
// every secret in the restored database (the Google connection itself,
// Home Assistant tokens, calendar passwords) would be unreadable. Refuse
// unless the backup's key matches the environment's key exactly.
function assertBackupKeyCompatible(contentsDir) {
  const envKey = (process.env.ENCRYPTION_KEY || '').trim();
  if (!envKey) return;
  const keyPath = path.join(contentsDir, '.encryption-key');
  const backupKey = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8').trim() : null;
  if (!backupKey || !encryptionKeysEqual(backupKey, envKey)) {
    throw new Error('This server\'s ENCRYPTION_KEY (set in its environment — on Proxmox installs, /opt/homeglow/.env) is different from the key this backup was made with, so the restored data would be unreadable. Download this backup\'s encryption key (in the restore dialog), set ENCRYPTION_KEY to it on this server, restart, and then restore. The restore was not staged.');
  }
}

// Validate an extracted backup directory. Returns { schemaVersion, legacy,
// manifest }. Throws an Error with a user-facing message on any problem.
function validateExtractedBackup(contentsDir, maxSchemaVersion) {
  const stagedDb = path.join(contentsDir, 'tasks.db');
  if (!fs.existsSync(stagedDb)) {
    throw new Error('This archive is not a HomeGlow backup: it does not contain a database (tasks.db).');
  }

  let manifest = null;
  const manifestPath = path.join(contentsDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {
      throw new Error('This backup\'s manifest is unreadable, so its contents cannot be verified. The restore was not staged.');
    }
  }

  // A backup made on an install with no key configured has nothing
  // encrypted, so it legitimately carries no key file; its manifest says
  // so. Any other keyless backup is unsafe to restore.
  if (!fs.existsSync(path.join(contentsDir, '.encryption-key'))
    && (!manifest || manifest.encryptionKeySource !== 'none')) {
    throw new Error('This backup does not contain an encryption key (.encryption-key). Without it the restored data would be unreadable, so the restore was not staged.');
  }
  assertBackupKeyCompatible(contentsDir);

  if (manifest) {
    const expected = manifest.files && manifest.files['tasks.db'] && manifest.files['tasks.db'].sha256;
    if (expected) {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(stagedDb)).digest('hex');
      if (actual !== expected) {
        throw new Error('This backup failed its integrity check: the database does not match the hash recorded when the backup was made (the download may be truncated or corrupt). The restore was not staged.');
      }
    }
  }

  let schemaVersion = manifest && typeof manifest.schemaVersion === 'number'
    ? manifest.schemaVersion
    : null;
  let probe = null;
  try {
    probe = new Database(stagedDb, { readonly: true });
    const integrity = probe.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error(`This backup's database failed its integrity check (${integrity}). The restore was not staged.`);
    }
    const hasSettings = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
      .get();
    if (!hasSettings) {
      throw new Error('This archive does not contain a HomeGlow database (no settings table). The restore was not staged.');
    }
    if (schemaVersion === null) {
      schemaVersion = driveBackup.getSchemaVersion(probe);
    }
  } catch (err) {
    if (err.message && err.message.includes('restore was not staged')) throw err;
    throw new Error(`This backup could not be validated as a readable HomeGlow database: ${err.message}`);
  } finally {
    if (probe) probe.close();
  }

  if (schemaVersion !== null && maxSchemaVersion !== null && schemaVersion > maxSchemaVersion) {
    throw new Error(`This backup was made by a newer version of HomeGlow (data schema ${schemaVersion}; this install supports up to ${maxSchemaVersion}). Update HomeGlow first, then restore. The restore was not staged.`);
  }

  return { schemaVersion, legacy: !manifest, manifest };
}

// Shared staging core: extract archivePath into the staging area, validate
// it against the live database's schema, snapshot the current data set for
// rollback (unless snapshotCurrent is false), and record the staged state.
function stageRestoreArchive(db, dbPath, { archivePath, source, name, backupCreatedAt = null, fileId = null, snapshotCurrent = true, uploadsDir = null }) {
  if (stagingInProgress) {
    throw new Error('Another restore operation is already in progress. Please wait for it to finish.');
  }
  const paths = getRestorePaths(dbPath, uploadsDir);
  const state = readState(dbPath);
  if (state.staged) {
    throw new Error(`A restore of "${state.staged.name}" is already staged and waiting for a restart. Cancel it before staging a different backup.`);
  }

  stagingInProgress = true;
  try {
    fs.rmSync(paths.stagingDir, { recursive: true, force: true });
    fs.mkdirSync(paths.contentsDir, { recursive: true });
    try {
      execFileSync('tar', ['-xzf', archivePath, '-C', paths.contentsDir]);
    } catch (_) {
      throw new Error('This file could not be read as a backup archive (.tar.gz). The restore was not staged.');
    }

    const { schemaVersion, legacy } = validateExtractedBackup(
      paths.contentsDir,
      driveBackup.getSchemaVersion(db),
    );

    if (snapshotCurrent) {
      fs.mkdirSync(paths.preRestoreDir, { recursive: true });
      const tmpSnapshot = `${paths.preRestoreArchive}.tmp`;
      driveBackup.createBackupArchive(db, dbPath, tmpSnapshot, uploadsDir);
      fs.renameSync(tmpSnapshot, paths.preRestoreArchive);
      state.preRestore = { createdAt: new Date().toISOString(), stagedFor: name };
    }

    state.staged = {
      source,
      fileId,
      name,
      backupCreatedAt,
      schemaVersion,
      legacy,
      stagedAt: new Date().toISOString(),
    };
    writeState(dbPath, state);
    return state.staged;
  } catch (err) {
    try { fs.rmSync(paths.stagingDir, { recursive: true, force: true }); } catch (_) {}
    throw err;
  } finally {
    stagingInProgress = false;
  }
}

// Download a Drive file to destPath, streaming it to disk (backups can be
// hundreds of MB — never buffer one in memory) and verifying its MD5
// against Drive's record as it streams. Returns the file metadata.
async function downloadDriveFileToPath(db, accountId, fileId, destPath) {
  const accessToken = await googleConnection.getValidAccessToken(db, accountId);

  const metaRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,createdTime,md5Checksum`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Could not read that backup's details from Google Drive (${metaRes.status}).`);
  }
  const meta = await metaRes.json();

  const downloadRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!downloadRes.ok) {
    throw new Error(`Could not download that backup from Google Drive (${downloadRes.status}).`);
  }
  const hash = crypto.createHash('md5');
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(downloadRes.body), meter, fs.createWriteStream(destPath));

  if (meta.md5Checksum && hash.digest('hex') !== meta.md5Checksum) {
    throw new Error('The downloaded backup does not match the checksum Google Drive has on record (the download may be truncated or corrupt). The restore was not staged.');
  }
  return meta;
}

async function stageRestoreFromDrive(db, dbPath, accountId, fileId, uploadsDir) {
  const tmpArchive = path.join(os.tmpdir(), `homeglow-restore-${Date.now()}.tar.gz`);
  try {
    const meta = await downloadDriveFileToPath(db, accountId, fileId, tmpArchive);
    return stageRestoreArchive(db, dbPath, {
      archivePath: tmpArchive,
      source: 'drive',
      name: meta.name || fileId,
      backupCreatedAt: meta.createdTime || null,
      fileId,
      uploadsDir,
    });
  } finally {
    try { if (fs.existsSync(tmpArchive)) fs.unlinkSync(tmpArchive); } catch (_) {}
  }
}

// Read the encryption key bundled in a Drive backup, without staging a
// restore. Used when moving to a new device whose ENCRYPTION_KEY (from its
// environment) differs: the panel offers this key for download so it can
// be set as that server's ENCRYPTION_KEY before restoring. Returns the key
// text, or null when the backup carries no key.
async function extractBackupKey(db, accountId, fileId) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-key-'));
  const tmpArchive = path.join(tmpDir, 'backup.tar.gz');
  try {
    await downloadDriveFileToPath(db, accountId, fileId, tmpArchive);
    try {
      execFileSync('tar', ['-xzf', tmpArchive, '-C', tmpDir, './.encryption-key']);
    } catch (_) {
      return null; // no key member in the archive
    }
    const keyPath = path.join(tmpDir, '.encryption-key');
    if (!fs.existsSync(keyPath)) return null;
    const key = fs.readFileSync(keyPath, 'utf8').trim();
    return key || null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function stageRollback(db, dbPath, uploadsDir) {
  const paths = getRestorePaths(dbPath, uploadsDir);
  if (!fs.existsSync(paths.preRestoreArchive)) {
    throw new Error('No pre-restore snapshot is available to roll back to.');
  }
  const state = readState(dbPath);
  return stageRestoreArchive(db, dbPath, {
    archivePath: paths.preRestoreArchive,
    source: 'pre-restore',
    name: state.preRestore && state.preRestore.stagedFor
      ? `Saved state from before restoring "${state.preRestore.stagedFor}"`
      : 'Pre-restore snapshot',
    // The snapshot being staged IS the safety copy; the data it replaces
    // is still preserved by the boot-time swap in replaced-data/.
    snapshotCurrent: false,
    uploadsDir,
  });
}

function cancelStagedRestore(dbPath) {
  const paths = getRestorePaths(dbPath);
  const state = readState(dbPath);
  state.staged = null;
  writeState(dbPath, state);
  fs.rmSync(paths.stagingDir, { recursive: true, force: true });
}

function getRestoreStatus(dbPath) {
  const paths = getRestorePaths(dbPath);
  const state = readState(dbPath);
  return {
    staged: state.staged,
    lastRestore: state.lastRestore,
    rollbackAvailable: Boolean(
      state.lastRestore && state.preRestore && fs.existsSync(paths.preRestoreArchive),
    ),
    preRestoreCreatedAt: state.preRestore ? state.preRestore.createdAt : null,
  };
}

// Boot-time application of a staged restore. Runs before the database is
// opened; purely synchronous file moves. Returns { applied, name?, error? }.
function applyPendingRestore(dbPath, uploadsDir) {
  if (!dbPath || dbPath === ':memory:') return { applied: false };
  const paths = getRestorePaths(dbPath, uploadsDir);
  const state = readState(dbPath);
  if (!state.staged) return { applied: false };

  const staged = state.staged;
  const abort = (message) => {
    console.error(`[DriveRestore] Staged restore of "${staged.name}" aborted: ${message}`);
    state.staged = null;
    try { writeState(dbPath, state); } catch (_) {}
    try { fs.rmSync(paths.stagingDir, { recursive: true, force: true }); } catch (_) {}
    return { applied: false, error: message };
  };

  // Re-validate the staged payload before touching live data: it has been
  // sitting on disk since staging, possibly across an unclean shutdown.
  try {
    validateExtractedBackup(paths.contentsDir, null);
  } catch (err) {
    return abort(err.message);
  }

  const movedAside = [];
  const uploadsTarget = paths.uploadsTarget;
  const uploadsReplacedDir = path.join(paths.replacedDir, 'uploads');
  let uploadsMovedAside = false;
  try {
    fs.rmSync(paths.replacedDir, { recursive: true, force: true });
    fs.mkdirSync(paths.replacedDir, { recursive: true });

    const aside = (src, destName) => {
      if (!fs.existsSync(src)) return;
      movePath(src, path.join(paths.replacedDir, destName));
      movedAside.push({ destName, target: src });
    };

    aside(dbPath, 'tasks.db');
    aside(`${dbPath}-wal`, 'tasks.db-wal');
    aside(`${dbPath}-shm`, 'tasks.db-shm');
    aside(paths.keyPath, '.encryption-key');
    // Uploads are swapped by contents, never by renaming the directory
    // itself: on the standard Docker install it is a mount point and a
    // rename fails with EBUSY.
    if (fs.existsSync(uploadsTarget)) {
      moveDirContents(uploadsTarget, uploadsReplacedDir);
      uploadsMovedAside = true;
    }

    movePath(path.join(paths.contentsDir, 'tasks.db'), dbPath);
    const stagedKey = path.join(paths.contentsDir, '.encryption-key');
    if (fs.existsSync(stagedKey)) {
      movePath(stagedKey, paths.keyPath);
    }
    const stagedUploads = path.join(paths.contentsDir, 'uploads');
    if (fs.existsSync(stagedUploads)) {
      moveDirContents(stagedUploads, uploadsTarget);
    }
  } catch (err) {
    // Best effort: put everything back exactly where it was.
    try {
      for (const { destName, target } of movedAside.reverse()) {
        const from = path.join(paths.replacedDir, destName);
        if (fs.existsSync(from)) {
          if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
          movePath(from, target);
        }
      }
      if (uploadsMovedAside) {
        clearDirContents(uploadsTarget);
        moveDirContents(uploadsReplacedDir, uploadsTarget);
      }
    } catch (rollbackErr) {
      throw new Error(`Restore failed (${err.message}) and the previous data could not be put back automatically (${rollbackErr.message}). Previous data is preserved in ${paths.replacedDir}.`);
    }
    return abort(`applying the restore failed and was rolled back: ${err.message}`);
  }

  state.lastRestore = {
    appliedAt: new Date().toISOString(),
    name: staged.name,
    source: staged.source,
  };
  if (staged.source === 'pre-restore') {
    // The snapshot has been consumed by applying it.
    state.preRestore = null;
  }
  state.staged = null;
  writeState(dbPath, state);
  fs.rmSync(paths.stagingDir, { recursive: true, force: true });
  console.log(`[DriveRestore] Applied staged restore "${staged.name}". Previous data preserved in ${paths.replacedDir}.`);
  return { applied: true, name: staged.name };
}

module.exports = {
  getRestorePaths,
  readState,
  isRestoreStaged,
  validateExtractedBackup,
  assertBackupKeyCompatible,
  stageRestoreArchive,
  stageRestoreFromDrive,
  stageRollback,
  cancelStagedRestore,
  getRestoreStatus,
  applyPendingRestore,
  downloadDriveFileToPath,
  extractBackupKey,
  moveDirContents,
  clearDirContents,
};
