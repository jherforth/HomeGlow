// Allow-list rule for device names. The bug is that '/' in a
// name splits the URL path at nginx, so the fix is to constrain the charset
// when a human picks a name. The rule allows Unicode letters and digits plus
// a small set of punctuation ( _ - . ' ( ) ) that carries no URL meaning.
// The client mirrors this rule so the server 400 is a backstop rather than
// the user's first experience of the constraint.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isValidDeviceName,
    normalizeDeviceName,
    DEVICE_NAME_MAX_LENGTH,
} = require('../utils/deviceName');

test('isValidDeviceName accepts common human-picked names', () => {
    assert.equal(isValidDeviceName('Kitchen Display'), true);
    assert.equal(isValidDeviceName("Nan's iPad"), true);
    assert.equal(isValidDeviceName('Playroom (up)'), true);
    assert.equal(isValidDeviceName('José'), true);
    assert.equal(isValidDeviceName('Kitchen_Hub-2'), true);
    assert.equal(isValidDeviceName('a'), true);
    assert.equal(isValidDeviceName('a'.repeat(DEVICE_NAME_MAX_LENGTH)), true);
});

test('isValidDeviceName rejects URL-meaningful characters', () => {
    assert.equal(isValidDeviceName('a/b'), false);
    assert.equal(isValidDeviceName('a\\b'), false);
    assert.equal(isValidDeviceName('a?b'), false);
    assert.equal(isValidDeviceName('a#b'), false);
    assert.equal(isValidDeviceName('a%b'), false);
    assert.equal(isValidDeviceName('a&b'), false);
    assert.equal(isValidDeviceName('a+b'), false);
    assert.equal(isValidDeviceName('a:b'), false);
    assert.equal(isValidDeviceName('a@b'), false);
});

test('isValidDeviceName rejects path-traversal-shaped inputs', () => {
    assert.equal(isValidDeviceName('../etc'), false);
    assert.equal(isValidDeviceName('a..b'), false);
    assert.equal(isValidDeviceName('..'), false);
});

test('isValidDeviceName rejects whitespace-only, empty, and oversized inputs', () => {
    assert.equal(isValidDeviceName(''), false);
    assert.equal(isValidDeviceName('   '), false);
    assert.equal(isValidDeviceName('a'.repeat(DEVICE_NAME_MAX_LENGTH + 1)), false);
});

test('isValidDeviceName rejects names with no letter or digit', () => {
    assert.equal(isValidDeviceName('...'), false);
    assert.equal(isValidDeviceName('---'), false);
    assert.equal(isValidDeviceName("()'"), false);
});

test('isValidDeviceName rejects non-string inputs', () => {
    assert.equal(isValidDeviceName(null), false);
    assert.equal(isValidDeviceName(undefined), false);
    assert.equal(isValidDeviceName(123), false);
});

test('isValidDeviceName trims leading and trailing whitespace before validating', () => {
    // A caller passing a raw form value with padding is still valid — the
    // route stores the trimmed form via normalizeDeviceName.
    assert.equal(isValidDeviceName('  Kitchen  '), true);
});

test('normalizeDeviceName collapses NFD and NFC forms of the same accented name', () => {
    const composed = 'café';         // é as a single precomposed code point (NFC)
    const decomposed = 'café';      // e + combining acute (NFD)
    assert.notEqual(composed, decomposed);
    assert.equal(normalizeDeviceName(composed), normalizeDeviceName(decomposed));
    assert.equal(normalizeDeviceName(decomposed), composed);
});

test('normalizeDeviceName trims whitespace', () => {
    assert.equal(normalizeDeviceName('  Kitchen Display  '), 'Kitchen Display');
});

test('normalizeDeviceName returns empty string for non-strings', () => {
    assert.equal(normalizeDeviceName(null), '');
    assert.equal(normalizeDeviceName(undefined), '');
    assert.equal(normalizeDeviceName(123), '');
});

test('accepts scripts whose vowel signs are combining marks', () => {
    // Devanagari, Thai and friends carry matras/viramas in the Unicode Mark
    // category, so an allow-list of \p{L}\p{N} alone silently excludes them.
    assert.equal(isValidDeviceName('रसोई'), true, 'Hindi');
    assert.equal(isValidDeviceName('ครัว'), true, 'Thai');
    assert.equal(isValidDeviceName('ਰਸੋਈ'), true, 'Punjabi');
});

test('allowing marks does not let invisible or bidi controls through', () => {
    // Format characters are \p{Cf}, not \p{M}, so they stay rejected.
    assert.equal(isValidDeviceName('Kitchen \u200D Display'), false, 'zero-width joiner');
    assert.equal(isValidDeviceName('Kitchen \u202E Display'), false, 'RTL override');
    assert.equal(isValidDeviceName('\u0301\u0301'), false, 'marks alone are not a name');
});
