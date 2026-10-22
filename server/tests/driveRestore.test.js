const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { describe, it } = require('node:test');
const Database = require('better-sqlite3');

const driveBackup = require('../services/googleDriveBackup');
const driveRestore = require('../services/driveRestore');

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
  fs.writeFileSync(path.join(dataDir, '.encryption-key'), 'test-key-material');

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
  const prev = process.env.ENCRYPTION_KEY_FILE;
  process.env.ENCRYPTION_KEY_FILE = path.join(inst.dataDir, '.encryption-key');
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ENCRYPTION_KEY_FILE;
    else process.env.ENCRYPTION_KEY_FILE = prev;
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
        const manifest = driveBackup.createBackupArchive(db, inst.dbPath, archivePath);
        db.close();

        assert.strictEqual(manifest.backupFormat, 1);
        assert.strictEqual(manifest.schemaVersion, 5);
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
        driveBackup.createBackupArchive(db, inst.dbPath, archiveA);
        db.prepare('UPDATE app_state SET note = ? WHERE id = 1').run('v2');
        fs.writeFileSync(path.join(inst.uploadsDir, 'note.txt'), 'v2');
        fs.writeFileSync(path.join(inst.uploadsDir, 'extra.txt'), 'only-in-v2');

        // Stage the v1 restore while v2 keeps running.
        const staged = driveRestore.stageRestoreArchive(db, inst.dbPath, {
          archivePath: archiveA, source: 'drive', name: 'backup-a', fileId: 'file-a',
        });
        db.close();
        assert.strictEqual(staged.schemaVersion, 5);
        assert.strictEqual(staged.legacy, false);
        assert.strictEqual(driveRestore.isRestoreStaged(inst.dbPath), true);
        assert.strictEqual(driveRestore.getRestoreStatus(inst.dbPath).rollbackAvailable, false);

        // "Reboot": the staged restore is applied before the DB opens.
        const applied = driveRestore.applyPendingRestore(inst.dbPath);
        assert.strictEqual(applied.applied, true);
        assert.strictEqual(readMarker(inst.dbPath), 'v1');
        assert.strictEqual(fs.readFileSync(path.join(inst.uploadsDir, 'note.txt'), 'utf8'), 'v1');
        assert.strictEqual(fs.existsSync(path.join(inst.uploadsDir, 'extra.txt')), false);
        let status = driveRestore.getRestoreStatus(inst.dbPath);
        assert.strictEqual(status.lastRestore.name, 'backup-a');
        assert.strictEqual(status.rollbackAvailable, true);

        // Roll back to the pre-restore (v2) state.
        db = new Database(inst.dbPath);
        const rollback = driveRestore.stageRollback(db, inst.dbPath);
        db.close();
        assert.strictEqual(rollback.source, 'pre-restore');
        const rolledBack = driveRestore.applyPendingRestore(inst.dbPath);
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
        driveBackup.createBackupArchive(db, newer.dbPath, archivePath);
        db.close();
      });

      withKeyFile(live, () => {
        const liveDb = new Database(live.dbPath);
        assert.throws(
          () => driveRestore.stageRestoreArchive(liveDb, live.dbPath, {
            archivePath, source: 'drive', name: 'future', fileId: 'f',
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
        driveBackup.createBackupArchive(db, inst.dbPath, archivePath);

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
            archivePath: badArchive, source: 'drive', name: 'tampered', fileId: 't',
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
            archivePath: noKeyArchive, source: 'drive', name: 'nokey', fileId: 'k',
          }),
          /encryption key/,
        );

        // Not a tarball at all.
        const garbage = path.join(inst.root, 'garbage.tar.gz');
        fs.writeFileSync(garbage, 'this is not a gzip archive');
        assert.throws(
          () => driveRestore.stageRestoreArchive(db, inst.dbPath, {
            archivePath: garbage, source: 'drive', name: 'garbage', fileId: 'g',
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
          archivePath: legacyArchive, source: 'drive', name: 'legacy', fileId: 'l',
        });
        assert.strictEqual(staged.legacy, true);
        assert.strictEqual(staged.schemaVersion, 5);

        assert.throws(
          () => driveRestore.stageRestoreArchive(db, inst.dbPath, {
            archivePath: legacyArchive, source: 'drive', name: 'again', fileId: 'l2',
          }),
          /already staged/,
        );

        driveRestore.cancelStagedRestore(inst.dbPath);
        assert.strictEqual(driveRestore.isRestoreStaged(inst.dbPath), false);
        const restaged = driveRestore.stageRestoreArchive(db, inst.dbPath, {
          archivePath: legacyArchive, source: 'drive', name: 'legacy', fileId: 'l',
        });
        assert.strictEqual(restaged.name, 'legacy');
        db.close();
      });
    } finally {
      fs.rmSync(inst.root, { recursive: true, force: true });
    }
  });
});
