const assert = require('assert');
const { describe, it } = require('node:test');

describe('Google Drive Backup Service', () => {
  it('should export required backup methods', () => {
    const service = require('../services/googleDriveBackup');
    assert.strictEqual(typeof service.uploadBackupToDrive, 'function');
    assert.strictEqual(typeof service.listDriveBackups, 'function');
    assert.strictEqual(typeof service.initAutomatedBackupScheduler, 'function');
    assert.strictEqual(typeof service.createBackupArchive, 'function');
    assert.strictEqual(typeof service.getSchemaVersion, 'function');
  });
});
