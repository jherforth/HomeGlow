const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const CalendarSyncService = require('../services/calendarSync');

const SILENT = { debug() {}, info() {}, warn() {}, error() {} };

// The tables syncSource writes, as the migrations create them.
function freshDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE calendar_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
            url TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6e44ff', enabled INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE calendar_events_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, event_uid TEXT NOT NULL,
            title TEXT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, description TEXT, location TEXT,
            all_day INTEGER DEFAULT 0, raw_data TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source_id, event_uid, start_time)
        );
        CREATE TABLE calendar_sync_status (
            source_id INTEGER PRIMARY KEY, last_sync_at TEXT, last_sync_status TEXT, last_sync_message TEXT,
            event_count INTEGER DEFAULT 0, sync_interval_minutes INTEGER DEFAULT 15
        );
        INSERT INTO calendar_sources (id, name, type, url) VALUES (1, 'Family', 'ICS', 'http://example.test/family.ics');
    `);
    return db;
}

const event = (uid, day, extra = {}) => ({
    uid,
    title: `Event ${uid}`,
    start: new Date(`2026-11-${day}T10:00:00.000Z`),
    end: new Date(`2026-11-${day}T11:00:00.000Z`),
    ...extra,
});

function serviceWith(db, feeds) {
    const service = new CalendarSyncService(db, () => null, SILENT);
    let call = 0;
    service.fetchICSEvents = async () => feeds[Math.min(call++, feeds.length - 1)];
    return service;
}

const cachedUids = (db) => db.prepare('SELECT event_uid FROM calendar_events_cache WHERE source_id = 1 ORDER BY event_uid').all().map((r) => r.event_uid);

test('a sync that fails while writing keeps the events already cached', async () => {
    const db = freshDb();
    const service = serviceWith(db, [
        [event('a', '02'), event('b', '03')],
        [event('c', '04'), event('d', '05', { start: new Date('not a date') })],
    ]);

    assert.equal((await service.syncSource(1)).success, true);
    assert.deepEqual(cachedUids(db), ['a', 'b']);

    const failed = await service.syncSource(1);
    assert.equal(failed.success, false);
    assert.deepEqual(cachedUids(db), ['a', 'b'], 'previous events survive the failed sync');
    assert.equal(service.getSyncStatus(1).last_sync_status, 'error');
});

test('a failed insert rolls back the delete too', async () => {
    const db = freshDb();
    const service = serviceWith(db, [
        [event('a', '02')],
        // Two rows with the same (source, uid, start) are fine under OR
        // REPLACE, so force a failure with a NOT NULL column instead.
        [event('b', '03'), { ...event('c', '04'), uid: null }],
    ]);
    await service.syncSource(1);
    assert.equal((await service.syncSource(1)).success, false);
    assert.deepEqual(cachedUids(db), ['a']);
});

test('an unchanged feed is not rewritten, a changed one is', async () => {
    const db = freshDb();
    const same = [event('a', '02'), event('b', '03')];
    const service = serviceWith(db, [same, same, [event('a', '02')]]);

    await service.syncSource(1);
    const firstIds = db.prepare('SELECT id FROM calendar_events_cache ORDER BY id').all().map((r) => r.id);

    await service.syncSource(1);
    const secondIds = db.prepare('SELECT id FROM calendar_events_cache ORDER BY id').all().map((r) => r.id);
    assert.deepEqual(secondIds, firstIds, 'same rows, same ids: nothing was deleted and reinserted');

    await service.syncSource(1);
    assert.deepEqual(cachedUids(db), ['a'], 'a removed event leaves the cache');
});

test('an emptied cache is refilled even when the feed is unchanged', async () => {
    const db = freshDb();
    const same = [event('a', '02')];
    const service = serviceWith(db, [same, same]);
    await service.syncSource(1);
    db.prepare('DELETE FROM calendar_events_cache').run();
    await service.syncSource(1);
    assert.deepEqual(cachedUids(db), ['a']);
});

test('syncing keeps the source\'s interval, and Disabled reads back as 0', async () => {
    const db = freshDb();
    const service = serviceWith(db, [[event('a', '02')]]);
    service.restartSyncJob = () => {};

    service.setSyncInterval(1, 60);
    await service.syncSource(1);
    assert.equal(service.getSyncInterval(1), 60);
    assert.equal(service.getSyncStatus(1).last_sync_status, 'success');
    assert.equal(service.getSyncStatus(1).event_count, 1);

    service.setSyncInterval(1, 0);
    await service.syncSource(1);
    assert.equal(service.getSyncInterval(1), 0);
});

test('setting the interval keeps the last sync status', async () => {
    const db = freshDb();
    const service = serviceWith(db, [[event('a', '02')]]);
    service.restartSyncJob = () => {};
    await service.syncSource(1);
    service.setSyncInterval(1, 30);
    const status = service.getSyncStatus(1);
    assert.equal(status.last_sync_status, 'success');
    assert.equal(status.sync_interval_minutes, 30);
});

test('an ICS feed is fetched with a timeout', async () => {
    const nodeIcal = require('node-ical');
    const original = nodeIcal.async.fromURL;
    let options;
    nodeIcal.async.fromURL = async (_url, opts) => { options = opts; return {}; };
    try {
        await new CalendarSyncService({}, () => null, SILENT).fetchICSEvents({ id: 1, url: 'http://example.test/x.ics' });
    } finally {
        nodeIcal.async.fromURL = original;
    }
    assert.ok(options?.signal instanceof AbortSignal);
});

// Issue #325: the displays reload the calendar when a sync changed it, and
// only then.
test('a sync tells the displays only when it changed the cached events', async () => {
    const db = freshDb();
    const same = [event('a', '02')];
    let told = 0;
    const service = new CalendarSyncService(db, () => null, SILENT, { onEventsChanged: () => { told += 1; } });
    const feeds = [same, same, [event('a', '02'), event('b', '03')], [event('c', '04'), event('d', '05', { start: new Date('not a date') })]];
    let call = 0;
    service.fetchICSEvents = async () => feeds[Math.min(call++, feeds.length - 1)];

    await service.syncSource(1);
    assert.equal(told, 1, 'first sync');
    await service.syncSource(1);
    assert.equal(told, 1, 'unchanged feed');
    await service.syncSource(1);
    assert.equal(told, 2, 'changed feed');
    await service.syncSource(1);
    assert.equal(told, 2, 'a failed sync changed nothing');
});
