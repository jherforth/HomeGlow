// Mirror of server/utils/deviceName.js. The server 400 is a backstop —
// this file makes the client show the rule up-front so users see the
// constraint the moment they type an invalid character in the rename
// dialog, not after they submit.
//
// Rules must match server exactly:
//   - allow-list of \p{L} \p{N} space _ - . ' ( )  (Unicode letters/digits
//     plus a small set of URL-safe punctuation)
//   - 1..64 characters after NFC-normalising and trimming
//   - must contain at least one letter or digit (no pure-punctuation names)
//   - must not contain '..'  (path-traversal shaped)
//   - non-string inputs return false (matches server typeof guard)
//
// getDeviceName still returns exactly what is stored in localStorage —
// no rewriting, no normalising on read. The validator runs only where a
// human chooses a new name (rename dialog in AdminPanel).

const DEVICE_NAME_STORAGE_KEY = 'homeglow_device_name';

const DEVICE_NAME_ALLOWED = /^[\p{L}\p{N} _\-.'()]+$/u;
const DEVICE_NAME_HAS_ALNUM = /[\p{L}\p{N}]/u;
const DEVICE_NAME_MAX_LENGTH = 64;

export const normalizeDeviceName = (raw) => {
    if (typeof raw !== 'string') return '';
    return raw.normalize('NFC').trim();
};

export const isValidDeviceName = (name) => {
    if (typeof name !== 'string') return false;
    const normalized = normalizeDeviceName(name);
    if (normalized.length < 1 || normalized.length > DEVICE_NAME_MAX_LENGTH) return false;
    if (normalized.includes('..')) return false;
    if (!DEVICE_NAME_ALLOWED.test(normalized)) return false;
    if (!DEVICE_NAME_HAS_ALNUM.test(normalized)) return false;
    return true;
};

const generateDeviceName = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const getDeviceName = () => {
    let deviceName = localStorage.getItem(DEVICE_NAME_STORAGE_KEY);

    if (!deviceName) {
        deviceName = generateDeviceName();
        localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
    }

    return deviceName;
};

export const setDeviceName = (deviceName) => {
    localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
};

export const getDeviceApiBase = (apiBaseUrl) => {
    const deviceName = getDeviceName();
    return `${apiBaseUrl}/api/devices/${encodeURIComponent(deviceName)}`;
};
