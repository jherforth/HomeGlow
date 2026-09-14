// SQLite writes CURRENT_TIMESTAMP as UTC with no zone marker, and V8 reads such
// a string as local time. The bug is invisible in a UTC process, which is where
// CI runs — so these tests set a non-UTC zone and assert the naive parse is
// wrong there before asserting the helper is right. Without that control the
// suite would pass in UTC no matter what the helper did.

const test = require('node:test');
const assert = require('node:assert/strict');

const { sqliteUtcToIso, sqliteUtcToMs } = require('../utils/sqliteTime');

const STORED = '2026-09-02 04:50:32';
const INSTANT_MS = Date.UTC(2026, 8, 2, 4, 50, 32);

function withTimeZone(tz, fn) {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
        fn();
    } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
    }
}

test('a stored timestamp reads as the same instant in any zone', () => {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland']) {
        withTimeZone(tz, () => {
            assert.equal(sqliteUtcToMs(STORED), INSTANT_MS, `wrong instant under ${tz}`);
        });
    }
});

test('the naive parse this replaces is demonstrably wrong west of UTC', () => {
    withTimeZone('America/Los_Angeles', () => {
        // Positive control: if this ever equals INSTANT_MS the platform has
        // changed and the test above no longer proves anything.
        assert.notEqual(Date.parse(STORED), INSTANT_MS);
        assert.equal(sqliteUtcToMs(STORED), INSTANT_MS);
    });
});

test('sqliteUtcToIso marks the zone explicitly', () => {
    assert.equal(sqliteUtcToIso(STORED), '2026-09-02T04:50:32.000Z');
});

test('fractional seconds are preserved', () => {
    assert.equal(sqliteUtcToIso('2026-09-02 04:50:32.250'), '2026-09-02T04:50:32.250Z');
});

test('an ISO value that already carries a zone is passed through unchanged', () => {
    assert.equal(sqliteUtcToIso('2026-09-02T04:50:32Z'), '2026-09-02T04:50:32.000Z');
    assert.equal(sqliteUtcToMs('2026-09-02T04:50:32+00:00'), INSTANT_MS);
    assert.equal(sqliteUtcToMs('2026-09-01T21:50:32-07:00'), INSTANT_MS);
});

test('unusable values return null rather than a plausible wrong time', () => {
    for (const bad of [null, undefined, '', '   ', 'garbage', 42, {}, '2026-09-02', '2026-99-99 04:50:32']) {
        assert.equal(sqliteUtcToMs(bad), null, `expected null for ${JSON.stringify(bad)}`);
        assert.equal(sqliteUtcToIso(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
});
