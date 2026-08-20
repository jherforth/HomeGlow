const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const ORIGINAL_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

// Point the key file at a scratch path so these tests never touch (or create)
// the real server/data/.encryption-key.
const TEST_KEY_FILE = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-enc-')),
    '.encryption-key'
);
process.env.ENCRYPTION_KEY_FILE = TEST_KEY_FILE;

const encryption = require('../utils/encryption');

// Reproduces the pre-unification scheme, so the legacy tests run against real
// old-format ciphertext rather than a stand-in.
function legacyEncrypt(plain, keyMaterial = process.env.ENCRYPTION_KEY) {
    const key = crypto.scryptSync(keyMaterial, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plain, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

test.beforeEach(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    if (fs.existsSync(TEST_KEY_FILE)) fs.unlinkSync(TEST_KEY_FILE);
    encryption.resetEncryptionKeyCache();
});

test.after(() => {
    if (ORIGINAL_ENCRYPTION_KEY === undefined) {
        delete process.env.ENCRYPTION_KEY;
    } else {
        process.env.ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
    }
    if (fs.existsSync(TEST_KEY_FILE)) fs.unlinkSync(TEST_KEY_FILE);
    encryption.resetEncryptionKeyCache();
});

test('an env-provided key is persisted so removing the variable is safe', () => {
    // Without this, an operator who drops ENCRYPTION_KEY after the docs call it
    // optional would get a freshly generated key and lose access to everything
    // already encrypted.
    assert.equal(fs.existsSync(TEST_KEY_FILE), false);

    const encrypted = encryption.encrypt('secret');
    assert.equal(fs.existsSync(TEST_KEY_FILE), true, 'env key was not persisted');
    assert.equal(fs.readFileSync(TEST_KEY_FILE, 'utf8').trim(), process.env.ENCRYPTION_KEY);

    // Dropping the variable now resolves to the same key, so old data reads.
    delete process.env.ENCRYPTION_KEY;
    encryption.resetEncryptionKeyCache();
    assert.equal(encryption.decrypt(encrypted), 'secret');
    assert.equal(encryption.getEncryptionSource(), 'file');
});

test('an existing key file is never overwritten by the env var', () => {
    const existing = Buffer.alloc(32, 9).toString('base64');
    fs.writeFileSync(TEST_KEY_FILE, `${existing}\n`);

    // env wins for this process, but must not clobber what is on disk.
    encryption.resetEncryptionKeyCache();
    encryption.encrypt('secret');
    assert.equal(fs.readFileSync(TEST_KEY_FILE, 'utf8').trim(), existing);
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

// --- legacy credential format ------------------------------------------------

test('legacy and current ciphertext are told apart unambiguously', () => {
    // Legacy: `<32 hex>:<hex>`. Current: base64, which cannot contain a colon.
    const current = encryption.encrypt('hello');
    assert.equal(encryption.isLegacyCiphertext(current), false);

    const legacy = legacyEncrypt('hello');
    assert.equal(encryption.isLegacyCiphertext(legacy), true);

    // Near misses must not be mistaken for legacy.
    assert.equal(encryption.isLegacyCiphertext(''), false);
    assert.equal(encryption.isLegacyCiphertext(null), false);
    assert.equal(encryption.isLegacyCiphertext('not:hex'), false);
    assert.equal(encryption.isLegacyCiphertext('abc:123'), false, 'IV must be 32 hex chars');
});

test('decryptLegacy reads a value written by the old scheme', () => {
    // With ENCRYPTION_KEY set, the legacy derivation used that value.
    const plain = 'apple-app-specific-password';
    assert.equal(encryption.decryptLegacy(legacyEncrypt(plain)), plain);
    assert.equal(encryption.decryptLegacy(''), '');
    assert.throws(() => encryption.decryptLegacy('nonsense'), /malformed/i);
});

test('decryptLegacy falls back to the published key when no env key is set', () => {
    // This is what every stock install was actually using, and the reason the
    // fallback path has to keep working.
    delete process.env.ENCRYPTION_KEY;
    encryption.resetEncryptionKeyCache();

    const plain = 'immich-api-key';
    const written = legacyEncrypt(plain, encryption.LEGACY_FALLBACK_KEY);
    assert.equal(encryption.decryptLegacy(written), plain);
});
