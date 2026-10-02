const test = require('node:test');
const assert = require('node:assert');

const { cronFiresOnDate } = require('../utils/cronDay');

// Zones on both sides of UTC. East of UTC is where reading the date from
// toISOString() went wrong: local midnight there is the previous day in UTC.
const ZONES = ['America/Los_Angeles', 'America/New_York', 'UTC', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Pacific/Auckland'];

const originalTz = process.env.TZ;
test.afterEach(() => {
    process.env.TZ = originalTz;
});

for (const zone of ZONES) {
    test(`a daily chore is due every day in ${zone}`, () => {
        process.env.TZ = zone;
        for (const day of ['2026-10-05', '2026-01-01', '2026-03-29', '2026-12-31']) {
            assert.strictEqual(cronFiresOnDate('0 0 * * *', day), true, `${zone} ${day}`);
        }
    });

    test(`a weekly chore lands on its weekday, not the day before, in ${zone}`, () => {
        process.env.TZ = zone;
        // 2026-10-05 is a Monday.
        assert.strictEqual(cronFiresOnDate('0 0 * * 1', '2026-10-05'), true);
        assert.strictEqual(cronFiresOnDate('0 0 * * 1', '2026-10-04'), false);
        assert.strictEqual(cronFiresOnDate('0 0 * * 1', '2026-10-06'), false);
    });
}

test('a monthly chore lands on its day of the month east of UTC', () => {
    process.env.TZ = 'Europe/Berlin';
    assert.strictEqual(cronFiresOnDate('0 0 15 * *', '2026-10-15'), true);
    assert.strictEqual(cronFiresOnDate('0 0 15 * *', '2026-10-14'), false);
});

test('a schedule firing later in the day still counts for that day', () => {
    process.env.TZ = 'Asia/Tokyo';
    assert.strictEqual(cronFiresOnDate('30 18 * * *', '2026-10-05'), true);
});

test('across a daylight saving change', () => {
    // Europe springs forward on 2026-03-29 and falls back on 2026-10-25.
    process.env.TZ = 'Europe/Berlin';
    for (const day of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-25', '2026-10-26']) {
        assert.strictEqual(cronFiresOnDate('0 0 * * *', day), true, day);
    }
});

test('follows a time zone changed while the server runs (issue #193)', () => {
    process.env.TZ = 'America/New_York';
    assert.strictEqual(cronFiresOnDate('0 0 * * 1', '2026-10-05'), true);
    process.env.TZ = 'Asia/Tokyo';
    assert.strictEqual(cronFiresOnDate('0 0 * * 1', '2026-10-05'), true);
    assert.strictEqual(cronFiresOnDate('0 0 * * 1', '2026-10-04'), false);
});

test('throws on an invalid crontab or date, leaving the caller to decide', () => {
    assert.throws(() => cronFiresOnDate('not a cron', '2026-10-05'));
    assert.throws(() => cronFiresOnDate('0 0 * * *', 'someday'));
});
