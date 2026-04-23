const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey = null;
let cachedKeyStatus = null;

function resetEncryptionKeyCache() {
    cachedKey = null;
    cachedKeyStatus = null;
}

function loadKey() {
    if (cachedKey !== null) return cachedKey;
    if (cachedKeyStatus === 'missing') return null;

    const raw = process.env.ENCRYPTION_KEY;
    if (!raw || !raw.trim()) {
        cachedKeyStatus = 'missing';
        return null;
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
    return cachedKey;
}

function isEncryptionConfigured() {
    loadKey();
    return cachedKeyStatus === 'ok';
}

function getEncryptionStatus() {
    loadKey();
    return cachedKeyStatus || 'missing';
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
    resetEncryptionKeyCache,
};
