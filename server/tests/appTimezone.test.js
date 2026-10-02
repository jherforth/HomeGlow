const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    DEFAULT_TIMEZONE,
    canonicalTimeZone,
    zoneFromLocaltimeFile,
    detectHostTimezone,
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

test('precedence: saved zone, then TZ, then the host, then New York', () => {
    const all = { saved: 'America/Denver', env: 'Europe/London', host: 'Asia/Tokyo' };
    assert.strictEqual(resolveAppTimezone(all).timezone, 'America/Denver');
    assert.strictEqual(resolveAppTimezone({ ...all, saved: null }).timezone, 'Europe/London');
    assert.strictEqual(resolveAppTimezone({ host: 'Asia/Tokyo' }).timezone, 'Asia/Tokyo');
    assert.strictEqual(resolveAppTimezone({}).timezone, DEFAULT_TIMEZONE);
});

test('reports where the zone came from and what a reset would go back to', () => {
    assert.deepStrictEqual(
        resolveAppTimezone({ saved: 'America/Denver', env: '', host: 'Asia/Tokyo' }),
        {
            timezone: 'America/Denver',
            source: 'setting',
            envTimezone: null,
            fallbackTimezone: 'Asia/Tokyo',
            fallbackSource: 'host',
        },
    );
    assert.deepStrictEqual(
        resolveAppTimezone({ env: 'Europe/London', host: 'Asia/Tokyo' }),
        {
            timezone: 'Europe/London',
            source: 'env',
            envTimezone: 'Europe/London',
            fallbackTimezone: 'Europe/London',
            fallbackSource: 'env',
        },
    );
    assert.strictEqual(resolveAppTimezone({}).source, 'default');
});

test('invalid values are skipped at every level, not trusted', () => {
    const r = resolveAppTimezone({ saved: 'Mars/Olympus', env: 'garbage', host: 'Etc/Unknown' });
    assert.strictEqual(r.timezone, DEFAULT_TIMEZONE);
    assert.strictEqual(r.source, 'default');
});

// A miniature /usr/share/zoneinfo. Contents are stand-ins: only byte equality
// matters to the matcher.
function makeZoneinfo() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-zoneinfo-'));
    const write = (name, content) => {
        const full = path.join(root, ...name.split('/'));
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    };
    write('Europe/Berlin', 'TZif-berlin');
    write('Arctic/Longyearbyen', 'TZif-berlin'); // same rules, older name
    write('America/Chicago', 'TZif-chicago');
    write('Etc/UTC', 'TZif-utc');
    write('posix/America/Chicago', 'TZif-chicago'); // duplicate tree, skipped
    write('zone1970.tab', '# comment\nDE,NO\t+5230+01322\tEurope/Berlin\nUS\t+415100-0873900\tAmerica/Chicago\n');
    return root;
}

test('names the host zone from a mounted localtime file', () => {
    const zoneinfo = makeZoneinfo();
    const localtime = path.join(zoneinfo, '..', `localtime-${process.pid}`);
    try {
        fs.writeFileSync(localtime, 'TZif-chicago');
        assert.strictEqual(zoneFromLocaltimeFile(localtime, zoneinfo), 'America/Chicago');

        // Two names share Berlin's data: the location-based one wins.
        fs.writeFileSync(localtime, 'TZif-berlin');
        assert.strictEqual(zoneFromLocaltimeFile(localtime, zoneinfo), 'Europe/Berlin');

        fs.writeFileSync(localtime, 'TZif-utc');
        assert.match(zoneFromLocaltimeFile(localtime, zoneinfo), /UTC$/);

        fs.writeFileSync(localtime, 'not a zone we have');
        assert.strictEqual(zoneFromLocaltimeFile(localtime, zoneinfo), null);
    } finally {
        fs.rmSync(zoneinfo, { recursive: true, force: true });
        fs.rmSync(localtime, { force: true });
    }
});

test('no mounted file means no answer from it', () => {
    assert.strictEqual(zoneFromLocaltimeFile(path.join(os.tmpdir(), 'does-not-exist-localtime'), os.tmpdir()), null);
});

test('without a mount, the host zone is the one Node started in, unless TZ overrode it', () => {
    const noMount = { localtimePath: path.join(os.tmpdir(), 'does-not-exist-localtime') };
    assert.strictEqual(detectHostTimezone({ ...noMount, env: { TZ: 'Asia/Tokyo' } }), null);
    const detected = detectHostTimezone({ ...noMount, env: {} });
    assert.strictEqual(detected, canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
});
