const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { describe, it } = require('node:test');
const Database = require('better-sqlite3');

const driveBackup = require('../services/googleDriveBackup');
const driveRestore = require('../services/driveRestore');
const encryption = require('../utils/encryption');

const FILE_KEY = Buffer.alloc(32, 3).toString('base64');
const ENV_KEY_A = Buffer.alloc(32, 11).toString('base64');
const ENV_KEY_B = Buffer.alloc(32, 22).toString('base64');

// Build a throwaway "install": data/tasks.db (+ settings schema row and a
// marker row), data/.encryption-key, and uploads/ next to the data dir —
// the same layout resolveUploadsDir expects.
function makeInstall(schemaVersion, marker) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-restore-test-'));
  const dataDir = path.join(root, 'data');
  const uploadsDir = path.join(root, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, 'note.txt'), marker);
  fs.writeFileSync(path.join(dataDir, '.encryption-key'), FILE_KEY);

  const dbPath = path.join(dataDir, 'tasks.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE app_state (id INTEGER PRIMARY KEY, note TEXT);
  `);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
    .run(driveBackup.SCHEMA_ID_KEY, String(schemaVersion));
  db.prepare('INSERT INTO app_state (id, note) VALUES (1, ?)').run(marker);
  db.close();
  return { root, dataDir, uploadsDir, dbPath };
}

// The backup/restore services resolve the encryption key through
// ENCRYPTION_KEY_FILE (as the encryption module does); point it at the
// install under test for the duration of fn.
function withKeyFile(inst, fn) {
  const prevFile = process.env.ENCRYPTION_KEY_FILE;
  const prevEnv = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY_FILE = path.join(inst.dataDir, '.encryption-key');
  delete process.env.ENCRYPTION_KEY;
  encryption.resetEncryptionKeyCache();
  try {
    return fn();
  } finally {
    if (prevFile === undefined) delete process.env.ENCRYPTION_KEY_FILE;
    else process.env.ENCRYPTION_KEY_FILE = prevFile;
    if (prevEnv === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prevEnv;
    encryption.resetEncryptionKeyCache();
  }
}

// Run fn with ENCRYPTION_KEY set (as the Proxmox installers set it) over
// the install's key file — the environment key must win.
function withEnvKey(inst, envKey, fn) {
  const prevFile = process.env.ENCRYPTION_KEY_FILE;
  const prevEnv = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY_FILE = path.join(inst.dataDir, '.encryption-key');
  process.env.ENCRYPTION_KEY = envKey;
  encryption.resetEncryptionKeyCache();
  try {
    return fn();
  } finally {
    if (prevFile === undefined) delete process.env.ENCRYPTION_KEY_FILE;
    else process.env.ENCRYPTION_KEY_FILE = prevFile;
    if (prevEnv === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prevEnv;
    encryption.resetEncryptionKeyCache();
  }
}

function readMarker(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT note FROM app_state WHERE id = 1').get().note;
  } finally {
    db.close();
  }
}

function extractTo(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', destDir]);
}

describe('Drive restore (staged, boot-applied)', () => {
  it('createBackupArchive writes a manifest with schema version and hashes', () => {
    const inst = makeInstall(5, 'v1');
    try {
      withKeyFile(inst, () => {
        const archivePath = path.join(inst.root, 'backup.tar.gz');
        const db = new Database(inst.dbPath);
        const manifest = driveBackup.createBackupArchive(db, inst.dbPath, archivePath, inst.uploadsDir);
        db.close();

        assert.strictEqual(manifest.backupFormat, 1);
        assert.strictEqual(manifest.schemaVersion, 5);
        assert.strictEqual(manifest.encryptionKeySource, 'file');
        assert.ok(manifest.files['tasks.db'].sha256);
        assert.ok(manifest.files['.encryption-key'].sha256);
        assert.strictEqual(manifest.files.uploads.fileCount, 1);

        const checkDir = path.join(inst.root, 'extracted');
        extractTo(archivePath, checkDir);
        const onDisk = JSON.parse(fs.readFileSync(path.join(checkDir, 'manifest.json'), 'utf8'));
        assert.strictEqual(onDisk.schemaVersion, 5);
        assert.strictEqual(readMarker(path.join(checkDir, 'tasks.db')), 'v1');
      });
    } finally {
      fs.rmSync(inst.root, { recursive: true, force: true });
    }
  });

  it('round-trips: stage, apply at boot, then roll back to the pre-restore state', () => {
    const inst = makeInstall(5, 'v1');
    try {
      withKeyFile(inst, () => {
        // Back up v1, then move the live install on to v2.
        let db = new Database(inst.dbPath);
        const archiveA = path.join(inst.root, 'backup-a.tar.gz');
        driveBackup.createBackupArchive(db, inst.dbPath, archiveA, inst.uploadsDir);
        db.prepare('UPDATE app_state SET note = ? WHERE id = 1').run('v2');
        fs.writeFileSync(path.join(inst.uploadsDir, 'note.txt'), 'v2');
        fs.writeFileSync(path.join(inst.uploadsDir, 'extra.txt'), 'only-in-v2');

        // Stage the v1 restore while v2 keeps running.
        const staged = driveRestore.stageRestoreArchive(db, inst.dbPath, {
          archivePath: archiveA, source: 'drive', name: 'backup-a', fileId: 'file-a', uploadsDir: inst.uploadsDir,
        });
        db.close();
        assert.strictEqual(staged.schemaVersion, 5);
        assert.strictEqual(staged.legacy, false);
        assert.strictEqual(driveRestore.isRestoreStaged(inst.dbPath), true);
        assert.strictEqual(driveRestore.getRestoreStatus(inst.dbPath).rollbackAvailable, false);

        // "Reboot": the staged restore is applied before the DB opens.
        const applied = driveRestore.applyPendingRestore(inst.dbPath, inst.uploadsDir);
        assert.strictEqual(applied.applied, true);
        assert.strictEqual(readMarker(inst.dbPath), 'v1');
        assert.strictEqual(fs.readFileSync(path.join(inst.uploadsDir, 'note.txt'), 'utf8'), 'v1');
        assert.strictEqual(fs.existsSync(path.join(inst.uploadsDir, 'extra.txt')), false);
        let status = driveRestore.getRestoreStatus(inst.dbPath);
        assert.strictEqual(status.lastRestore.name, 'backup-a');
        assert.strictEqual(status.rollbackAvailable, true);

        // Roll back to the pre-restore (v2) state.
        db = new Database(inst.dbPath);
        const rollback = driveRestore.stageRollback(db, inst.dbPath, inst.uploadsDir);
        db.close();
        assert.strictEqual(rollback.source, 'pre-restore');
        const rolledBack = driveRestore.applyPendingRestore(inst.dbPath, inst.uploadsDir);
        assert.strictEqual(rolledBack.applied, true);
        assert.strictEqual(readMarker(inst.dbPath), 'v2');
        assert.strictEqual(fs.readFileSync(path.join(inst.uploadsDir, 'note.txt'), 'utf8'), 'v2');
        assert.strictEqual(fs.existsSync(path.join(inst.uploadsDir, 'extra.txt')), true);
        status = driveRestore.getRestoreStatus(inst.dbPath);
        assert.strictEqual(status.rollbackAvailable, false);
      });
    } finally {
      fs.rmSync(inst.root, { recursive: true, force: true });
    }
  });

  it('rejects a backup made by a newer HomeGlow schema', () => {
    const live = makeInstall(5, 'live');
    const newer = makeInstall(99, 'from-the-future');
    try {
      const archivePath = path.join(newer.root, 'future.tar.gz');
      withKeyFile(newer, () => {
        const db = new Database(newer.dbPath);
        driveBackup.createBackupArchive(db, newer.dbPath, archivePath, newer.uploadsDir);
        db.close();
      });

      withKeyFile(live, () => {
        const liveDb = new Database(live.dbPath);
        assert.throws(
          () => driveRestore.stageRestoreArchive(liveDb, live.dbPath, {
            archivePath, source: 'drive', name: 'future', fileId: 'f', uploadsDir: live.uploadsDir,
          }),
          /newer version of HomeGlow/,
        );
        liveDb.close();
        assert.strictEqual(driveRestore.isRestoreStaged(live.dbPath), false);
      });
    } finally {
      fs.rmSync(live.root, { recursive: true, force: true });
      fs.rmSync(newer.root, { recursive: true, force: true });
    }
  });

  it('rejects a backup whose database does not match its manifest hash', () => {
    const inst = makeInstall(5, 'v1');
    try {
      withKeyFile(inst, () => {
        const db = new Database(inst.dbPath);
        const archivePath = path.join(inst.root, 'good.tar.gz');
        driveBackup.createBackupArchive(db, inst.dbPath, archivePath, inst.uploadsDir);

        const tamperDir = path.join(inst.root, 'tampered');
        extractTo(archivePath, tamperDir);
        const manifestPath = path.join(tamperDir, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.files['tasks.db'].sha256 = '0'.repeat(64);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        const badArchive = path.join(inst.root, 'tampered.tar.gz');
        execFileSync('tar', ['-czf', badArchive, '-C', tamperDir, '.']);

        assert.throws(
          () => driveRestore.stageRestoreArchive(db, inst.dbPath, {
            archivePath: badArchive, source: 'drive', name: 'tampered', fileId: 't', uploadsDir: inst.uploadsDir,
          }),
          /integrity check/,
        );
        db.close();
      });
    } finally {
      fs.rmSync(inst.root, { recursive: true, force: true });
    }
  });

  it('rejects archives that are not valid HomeGlow backups', () => {
    const inst = makeInstall(5, 'v1');
    try {
      withKeyFile(inst, () => {
        const db = new Database(inst.dbPath);

        // A database with no encryption key alongside it.
        const noKeyDir = path.join(inst.root, 'nokey');
        fs.mkdirSync(noKeyDir, { recursive: true });
        fs.copyFileSync(inst.dbPath, path.join(noKeyDir, 'tasks.db'));
        const noKeyArchive = path.join(inst.root, 'nokey.tar.gz');
        execFileSync('tar', ['-czf', noKeyArchive, '-C', noKeyDir, '.']);
        assert.throws(
          () => driveRestore.stageRestoreArchive(db, inst.dbPath, {
            archivePath: noKeyArchive, source: 'drive', name: 'nokey', fileId: 'k', uploadsDir: inst.uploadsDir,
          }),
          /encryption key/,
        );

        // Not a tarball at all.
        const garbage = path.join(inst.root, 'garbage.tar.gz');
        fs.writeFileSync(garbage, 'this is not a gzip archive');
        assert.throws(
          () => driveRestore.stageRestoreArchive(db, inst.dbPath, {
            archivePath: garbage, source: 'drive', name: 'garbage', fileId: 'g', uploadsDir: inst.uploadsDir,
          }),
          /could not be read as a backup archive/,
        );
        db.close();
      });
    } finally {
      fs.rmSync(inst.root, { recursive: true, force: true });
    }
  });

  it('accepts legacy backups without a manifest and refuses double-staging until cancelled', () => {
    const inst = makeInstall(5, 'v1');
    try {
      withKeyFile(inst, () => {
        // Hand-build a pre-manifest backup: db + key + uploads, no manifest.
        const legacyDir = path.join(inst.root, 'legacy');
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.copyFileSync(inst.dbPath, path.join(legacyDir, 'tasks.db'));
        fs.copyFileSync(path.join(inst.dataDir, '.encryption-key'), path.join(legacyDir, '.encryption-key'));
        fs.cpSync(inst.uploadsDir, path.join(legacyDir, 'uploads'), { recursive: true });
        const legacyArchive = path.join(inst.root, 'legacy.tar.gz');
        execFileSync('tar', ['-czf', legacyArchive, '-C', legacyDir, '.']);

        const db = new Database(inst.dbPath);
        const staged = driveRestore.stageRestoreArchive(db, inst.dbPath, {
          archivePath: legacyArchive, source: 'drive', name: 'legacy', fileId: 'l', uploadsDir: inst.uploadsDir,
        });
        assert.strictEqual(staged.legacy, true);
        assert.strictEqual(staged.schemaVersion, 5);

        assert.throws(
          () => driveRestore.stageRestoreArchive(db, inst.dbPath, {
            archivePath: legacyArchive, source: 'drive', name: 'again', fileId: 'l2', uploadsDir: inst.uploadsDir,
          }),
          /already staged/,
        );

        driveRestore.cancelStagedRestore(inst.dbPath);
        assert.strictEqual(driveRestore.isRestoreStaged(inst.dbPath), false);
        const restaged = driveRestore.stageRestoreArchive(db, inst.dbPath, {
          archivePath: legacyArchive, source: 'drive', name: 'legacy', fileId: 'l', uploadsDir: inst.uploadsDir,
        });
        assert.strictEqual(restaged.name, 'legacy');
        db.close();
      });
    } finally {
      fs.rmSync(inst.root, { recursive: true, force: true });
    }
  });

  it('applies a restore when the uploads directory itself cannot be renamed (mount point)', () => {
    const inst = makeInstall(5, 'v1');
    try {
      withKeyFile(inst, () => {
        let db = new Database(inst.dbPath);
        const archiveA = path.join(inst.root, 'backup-a.tar.gz');
        driveBackup.createBackupArchive(db, inst.dbPath, archiveA, inst.uploadsDir);
        db.prepare('UPDATE app_state SET note = ? WHERE id = 1').run('v2');
        fs.writeFileSync(path.join(inst.uploadsDir, 'note.txt'), 'v2');
        driveRestore.stageRestoreArchive(db, inst.dbPath, {
          archivePath: archiveA, source: 'drive', name: 'backup-a', fileId: 'file-a', uploadsDir: inst.uploadsDir,
        });
        db.close();

        // Simulate the standard Docker install, where uploads is a mount
        // point: renaming the directory itself fails with EBUSY. The apply
        // must swap the contents instead and still succeed.
        const originalRenameSync = fs.renameSync;
        fs.renameSync = (src, dest, ...rest) => {
          if (String(src) === inst.uploadsDir || String(dest) === inst.uploadsDir) {
            const err = new Error('Device or resource busy');
            err.code = 'EBUSY';
            throw err;
          }
          return originalRenameSync(src, dest, ...rest);
        };
        let applied;
        try {
          applied = driveRestore.applyPendingRestore(inst.dbPath, inst.uploadsDir);
        } finally {
          fs.renameSync = originalRenameSync;
        }
        assert.strictEqual(applied.applied, true);
        assert.strictEqual(readMarker(inst.dbPath), 'v1');
        assert.strictEqual(fs.readFileSync(path.join(inst.uploadsDir, 'note.txt'), 'utf8'), 'v1');
      });
    } finally {
      fs.rmSync(inst.root, { recursive: true, force: true });
    }
  });

  it('backs up the ENCRYPTION_KEY in use and refuses to stage it under a different one', () => {
    const source = makeInstall(5, 'from-source');
    const dest = makeInstall(5, 'on-dest');
    try {
      const archivePath = path.join(source.root, 'env-key-backup.tar.gz');
      // The backup is made on an install whose environment key (ENV_KEY_A)
      // wins over its key file (FILE_KEY): the archive must carry ENV_KEY_A
      // and say so in the manifest.
      withEnvKey(source, ENV_KEY_A, () => {
        const db = new Database(source.dbPath);
        const manifest = driveBackup.createBackupArchive(db, source.dbPath, archivePath, source.uploadsDir);
        db.close();
        assert.strictEqual(manifest.encryptionKeySource, 'env');
      });
      const checkDir = path.join(source.root, 'extracted');
      extractTo(archivePath, checkDir);
      assert.strictEqual(fs.readFileSync(path.join(checkDir, '.encryption-key'), 'utf8').trim(), ENV_KEY_A);

      // Staging it on a server running under a DIFFERENT environment key
      // is refused — the restored secrets would be unreadable there.
      withEnvKey(dest, ENV_KEY_B, () => {
        const db = new Database(dest.dbPath);
        assert.throws(
          () => driveRestore.stageRestoreArchive(db, dest.dbPath, {
            archivePath, source: 'drive', name: 'env-key-backup', fileId: 'e', uploadsDir: dest.uploadsDir,
          }),
          /ENCRYPTION_KEY/,
        );
        db.close();
        assert.strictEqual(driveRestore.isRestoreStaged(dest.dbPath), false);
      });

      // Under the SAME environment key it stages and applies.
      withEnvKey(dest, ENV_KEY_A, () => {
        const db = new Database(dest.dbPath);
        const staged = driveRestore.stageRestoreArchive(db, dest.dbPath, {
          archivePath, source: 'drive', name: 'env-key-backup', fileId: 'e', uploadsDir: dest.uploadsDir,
        });
        db.close();
        assert.strictEqual(staged.name, 'env-key-backup');
        const applied = driveRestore.applyPendingRestore(dest.dbPath, dest.uploadsDir);
        assert.strictEqual(applied.applied, true);
        assert.strictEqual(readMarker(dest.dbPath), 'from-source');
      });
    } finally {
      fs.rmSync(source.root, { recursive: true, force: true });
      fs.rmSync(dest.root, { recursive: true, force: true });
    }
  });
});
