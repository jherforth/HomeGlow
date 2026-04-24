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
};
