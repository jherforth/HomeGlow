// Device names live in URL paths (`/api/devices/<name>`) and are echoed back
// into localStorage on the client. The rule here is an allow-list applied at
// WRITE time only: rename endpoints and any endpoint that takes a
// user-supplied new name go through this. Reads must not validate — an
// existing row's name is a fact about the world, and rejecting a name we
// already accepted would brick displays that work fine today.
//
// The charset is narrower than what our current nginx tolerates. It stays
// correct if HomeGlow is fronted by Caddy or Apache, or by nginx with
// different merge_slashes settings. Characters like / \ % ? # & + : @ are
// deliberately excluded even though a few of them happen to work today.
//
// The client mirrors this rule in client/src/utils/deviceName.js so the
// server 400 is a backstop, not the user's first experience of the
// constraint.

const DEVICE_NAME_ALLOWED = /^[\p{L}\p{N} _\-.'()]+$/u;
const DEVICE_NAME_HAS_ALNUM = /[\p{L}\p{N}]/u;
const DEVICE_NAME_MAX_LENGTH = 64;
const DEVICE_NAME_RULE_MESSAGE =
    'Device name must be 1–64 characters, contain at least one letter or digit, must not contain "..", and may only include letters, digits, spaces, and _ - . \' ( ).';

// NFC so two visually identical accented names do not create two devices —
// e.g. "café" typed as U+00E9 vs "café" (e + combining acute).
function normalizeDeviceName(raw) {
    if (typeof raw !== 'string') return '';
    return raw.normalize('NFC').trim();
}

function isValidDeviceName(name) {
    if (typeof name !== 'string') return false;
    const normalized = normalizeDeviceName(name);
    if (normalized.length < 1 || normalized.length > DEVICE_NAME_MAX_LENGTH) return false;
    if (normalized.includes('..')) return false;
    if (!DEVICE_NAME_ALLOWED.test(normalized)) return false;
    if (!DEVICE_NAME_HAS_ALNUM.test(normalized)) return false;
    return true;
}

module.exports = {
    DEVICE_NAME_ALLOWED,
    DEVICE_NAME_MAX_LENGTH,
    DEVICE_NAME_RULE_MESSAGE,
    isValidDeviceName,
    normalizeDeviceName,
};
