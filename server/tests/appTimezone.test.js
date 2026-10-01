const test = require('node:test');
const assert = require('node:assert');

const {
    DEFAULT_TIMEZONE,
    canonicalTimeZone,
    resolveAppTimezone,
} = require('../utils/appTimezone');

test('accepts IANA names and UTC', () => {
    assert.strictEqual(canonicalTimeZone('America/Chicago'), 'America/Chicago');
    assert.strictEqual(canonicalTimeZone('  Europe/Berlin '), 'Europe/Berlin');
    assert.strictEqual(canonicalTimeZone('UTC'), 'UTC');
});

test('rejects what Node would silently turn into UTC', () => {
    for (const bad of ['Not/AZone', 'America/Chicag', '', '   ', null, undefined, 42, {}, 'x'.repeat(80)]) {
        assert.strictEqual(canonicalTimeZone(bad), null, String(bad));
    }
});

test('a zone saved from the UI wins over TZ', () => {
    assert.deepStrictEqual(
        resolveAppTimezone({ saved: 'America/Denver', env: 'America/New_York' }),
        { timezone: 'America/Denver', source: 'setting', envTimezone: 'America/New_York' },
    );
});

test('with nothing saved, TZ from the environment applies', () => {
    assert.deepStrictEqual(
        resolveAppTimezone({ saved: null, env: 'Europe/London' }),
        { timezone: 'Europe/London', source: 'env', envTimezone: 'Europe/London' },
    );
});

test('an invalid saved value is skipped, not trusted', () => {
    assert.strictEqual(resolveAppTimezone({ saved: 'Mars/Olympus', env: 'Asia/Tokyo' }).timezone, 'Asia/Tokyo');
});

test('falls back to the long-standing default when neither is usable', () => {
    assert.deepStrictEqual(
        resolveAppTimezone({ saved: '', env: 'garbage' }),
        { timezone: DEFAULT_TIMEZONE, source: 'default', envTimezone: null },
    );
    assert.strictEqual(resolveAppTimezone().timezone, 'America/New_York');
});
