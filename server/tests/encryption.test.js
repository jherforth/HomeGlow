const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const encryption = require('../utils/encryption');

test.beforeEach(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    encryption.resetEncryptionKeyCache();
});

test.after(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
    encryption.resetEncryptionKeyCache();
});

test('encrypt/decrypt roundtrip works with valid key', () => {
    const plain = 'hello-homeglow';
    const encrypted = encryption.encrypt(plain);
    const decrypted = encryption.decrypt(encrypted);

    assert.notEqual(encrypted, plain);
    assert.equal(decrypted, plain);
    assert.equal(encryption.isEncryptionConfigured(), true);
    assert.equal(encryption.getEncryptionStatus(), 'ok');
    assert.equal(encryption.getEncryptionSource(), 'env');
});

test('empty values are handled as passthrough empty string', () => {
    assert.equal(encryption.encrypt(''), '');
    assert.equal(encryption.decrypt(''), '');
    assert.equal(encryption.encrypt(null), '');
    assert.equal(encryption.decrypt(undefined), '');
});

test('decrypt throws for malformed ciphertext', () => {
    assert.throws(() => encryption.decrypt('abcd'), /Ciphertext is malformed/);
});

test('invalid ENCRYPTION_KEY marks status invalid and blocks encrypt', () => {
    process.env.ENCRYPTION_KEY = 'short-key';
    encryption.resetEncryptionKeyCache();

    assert.equal(encryption.isEncryptionConfigured(), false);
    assert.equal(encryption.getEncryptionStatus(), 'invalid');
    assert.throws(
        () => encryption.encrypt('secret'),
        /ENCRYPTION_KEY is not configured/
    );
});
