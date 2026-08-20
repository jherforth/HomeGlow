const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const DEFAULT_KEY_FILE = path.join(__dirname, '..', 'data', '.encryption-key');
const KEY_FILE = process.env.ENCRYPTION_KEY_FILE || DEFAULT_KEY_FILE;

let cachedKey = null;
let cachedKeyStatus = null;
let cachedKeySource = null;

function resetEncryptionKeyCache() {
    cachedKey = null;
    cachedKeyStatus = null;
    cachedKeySource = null;
}

function readKeyFromFile() {
    try {
        if (!fs.existsSync(KEY_FILE)) return null;
        const contents = fs.readFileSync(KEY_FILE, 'utf8').trim();
        return contents || null;
    } catch (_) {
        return null;
    }
}

function writeKeyToFile(value) {
    try {
        fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
        fs.writeFileSync(KEY_FILE, value + '\n', { mode: 0o600 });
        try { fs.chmodSync(KEY_FILE, 0o600); } catch (_) {}
        return true;
    } catch (err) {
        console.error('Failed to persist encryption key:', err.message);
        return false;
    }
}

function loadKey() {
    if (cachedKey !== null) return cachedKey;
    if (cachedKeyStatus === 'missing' || cachedKeyStatus === 'invalid') return null;

    let raw = process.env.ENCRYPTION_KEY;
    let source = 'env';
    if (!raw || !raw.trim()) {
        raw = readKeyFromFile();
        source = raw ? 'file' : null;
    }
    if (!raw || !raw.trim()) {
        const generated = crypto.randomBytes(32).toString('base64');
        if (writeKeyToFile(generated)) {
            raw = generated;
            source = 'auto';
            console.log(`Generated new encryption key at ${KEY_FILE}. Back this file up to keep stored secrets recoverable.`);
        } else {
            cachedKeyStatus = 'missing';
            return null;
        }
    }

    let buf;
    const trimmed = raw.trim();
    try {
        if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length >= 43) {
            buf = Buffer.from(trimmed, 'base64');
        } else if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
            buf = Buffer.from(trimmed, 'hex');
        } else {
            buf = Buffer.from(trimmed, 'utf8');
        }
    } catch (err) {
        cachedKeyStatus = 'invalid';
        return null;
    }

    if (buf.length !== 32) {
        cachedKeyStatus = 'invalid';
        return null;
    }

    cachedKey = buf;
    cachedKeyStatus = 'ok';
    cachedKeySource = source;

    // An operator who supplies ENCRYPTION_KEY today and later removes it —
    // reasonable, now that it is documented as optional — would otherwise get a
    // freshly generated key and silently lose access to everything already
    // stored. Persisting the supplied key the first time we see it makes
    // removing the variable a no-op instead of a trap. Only written when the
    // file is absent, so it never overwrites an existing key, and only after
    // validation, so a malformed value is never persisted.
    if (source === 'env' && !fs.existsSync(KEY_FILE)) {
        if (writeKeyToFile(trimmed)) {
            console.log(`Persisted ENCRYPTION_KEY to ${KEY_FILE} so the variable is safe to remove later.`);
        }
    }

    return cachedKey;
}

// --- legacy credential encryption -------------------------------------------
//
// Calendar and photo credentials used to be encrypted separately from the rest,
// with AES-256-CBC and a key derived from `ENCRYPTION_KEY || <a string hardcoded
// in this repository>`. Anything stored before that was unified is still in the
// old format, so it has to stay readable.
//
// This path is deliberately permanent rather than a one-release shim: it is what
// makes the re-encryption migration skippable. If the migration cannot run —
// most plausibly because an operator supplied a malformed ENCRYPTION_KEY —
// nothing breaks, and it simply runs on a later boot.

const LEGACY_ALGO = 'aes-256-cbc';
const LEGACY_FALLBACK_KEY = 'homeglow-default-key-change-in-production-32bytes';
// Legacy ciphertext is `<iv hex>:<payload hex>` with a 16-byte IV. The current
// format is base64, which cannot contain a colon, so the two are unambiguous.
const LEGACY_CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;

function isLegacyCiphertext(value) {
    return typeof value === 'string' && LEGACY_CIPHERTEXT_PATTERN.test(value.trim());
}

function legacyKeyMaterial() {
    const raw = process.env.ENCRYPTION_KEY;
    return raw && raw.trim() ? raw.trim() : LEGACY_FALLBACK_KEY;
}

function decryptLegacy(cipherText) {
    if (cipherText === null || cipherText === undefined || cipherText === '') return '';

    const parts = String(cipherText).trim().split(':');
    if (parts.length !== 2) {
        throw new Error('Legacy ciphertext is malformed.');
    }

    // The salt was a literal 'salt' in the original implementation; it has to
    // stay that way to read what was written.
    const key = crypto.scryptSync(legacyKeyMaterial(), 'salt', 32);
    const decipher = crypto.createDecipheriv(LEGACY_ALGO, key, Buffer.from(parts[0], 'hex'));
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function isEncryptionConfigured() {
    loadKey();
    return cachedKeyStatus === 'ok';
}

function getEncryptionStatus() {
    loadKey();
    return cachedKeyStatus || 'missing';
}

function getEncryptionSource() {
    loadKey();
    return cachedKeySource;
}

function encrypt(plainText) {
    if (plainText === null || plainText === undefined || plainText === '') return '';
    const key = loadKey();
    if (!key) {
        throw new Error('ENCRYPTION_KEY is not configured. Set a 32-byte key (base64 or hex) in the server environment.');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(cipherText) {
    if (cipherText === null || cipherText === undefined || cipherText === '') return '';
    const key = loadKey();
    if (!key) {
        throw new Error('ENCRYPTION_KEY is not configured. Cannot decrypt stored secrets.');
    }
    const data = Buffer.from(String(cipherText), 'base64');
    if (data.length < IV_LENGTH + TAG_LENGTH + 1) {
        throw new Error('Ciphertext is malformed.');
    }
    const iv = data.slice(0, IV_LENGTH);
    const tag = data.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const enc = data.slice(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
}

module.exports = {
    encrypt,
    decrypt,
    isEncryptionConfigured,
    getEncryptionStatus,
    getEncryptionSource,
    resetEncryptionKeyCache,
    isLegacyCiphertext,
    decryptLegacy,
    LEGACY_FALLBACK_KEY,
};
