const test = require('node:test');
const assert = require('node:assert/strict');
const nodeIcal = require('node-ical');
const CalendarSyncService = require('../services/calendarSync');

function buildFixtureIcs() {
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HomeGlow Regression Test//EN',
        'BEGIN:VEVENT',
        'UID:test-language-param@example.com',
        'DTSTAMP:20260501T120000Z',
        'DTSTART:20260501T130000Z',
        'DTEND:20260501T140000Z',
        'SUMMARY;LANGUAGE=en-US:Meeting title',
        'DESCRIPTION;LANGUAGE=en-US:Desc text',
        'LOCATION;LANGUAGE=en-US:123 Main St',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
}

test('normalizeIcsTextValue handles node-ical parameterized values', () => {
    const service = new CalendarSyncService({}, () => null);

    assert.equal(service.normalizeIcsTextValue('plain'), 'plain');
    assert.equal(service.normalizeIcsTextValue({ val: 'param-value', params: { LANGUAGE: 'en-US' } }), 'param-value');
    assert.equal(service.normalizeIcsTextValue(42), '42');
    assert.equal(service.normalizeIcsTextValue(null), null);
    assert.equal(service.normalizeIcsTextValue(undefined), null);
});

test('normalizeAllDayEnd subtracts one day for all-day events', () => {
    const service = new CalendarSyncService({}, () => null);
    const result = service.normalizeAllDayEnd(new Date('2026-05-02T00:00:00.000Z'));
    assert.equal(result.toISOString().slice(0, 10), '2026-05-01');
});

test('fetchICSEvents normalizes SUMMARY/DESCRIPTION/LOCATION to strings', async () => {
    const fixture = buildFixtureIcs();
    const parsed = nodeIcal.sync.parseICS(fixture);
    const vevent = Object.values(parsed).find((item) => item && item.type === 'VEVENT');

    assert.ok(vevent, 'expected one VEVENT in fixture');
    assert.equal(typeof vevent.location, 'object');

    const service = new CalendarSyncService({}, () => null);

    const originalFromUrl = nodeIcal.async.fromURL;
    const originalExpandRecurringEvent = nodeIcal.expandRecurringEvent;

    nodeIcal.async.fromURL = async () => parsed;
    nodeIcal.expandRecurringEvent = () => null;

    try {
        const events = await service.fetchICSEvents({ id: 'fixture', url: 'http://example.invalid/test.ics' });

        assert.equal(events.length, 1);
        assert.equal(events[0].title, 'Meeting title');
        assert.equal(events[0].description, 'Desc text');
        assert.equal(events[0].location, '123 Main St');
        assert.equal(typeof events[0].title, 'string');
        assert.equal(typeof events[0].description, 'string');
        assert.equal(typeof events[0].location, 'string');
    } finally {
        nodeIcal.async.fromURL = originalFromUrl;
        nodeIcal.expandRecurringEvent = originalExpandRecurringEvent;
    }
});

test('getCachedEvents maps cached rows with source metadata', () => {
    const sources = [
        { id: 1, name: 'Family', color: '#123456' },
    ];

    const rows = [
        {
            source_id: 1,
            event_uid: 'evt-1',
            title: 'Title 1',
            start_time: '2026-05-01T10:00:00.000Z',
            end_time: '2026-05-01T11:00:00.000Z',
            description: 'Desc 1',
            location: 'Loc 1',
            all_day: 0,
        },
        {
            source_id: 999,
            event_uid: 'evt-2',
            title: 'Title 2',
            start_time: '2026-05-02T10:00:00.000Z',
            end_time: '2026-05-02T11:00:00.000Z',
            description: null,
            location: null,
            all_day: 1,
        },
    ];

    let capturedQuery = '';
    let capturedParams = [];

    const fakeDb = {
        prepare(query) {
            if (query.includes('SELECT id, name, color FROM calendar_sources')) {
                return { all: () => sources };
            }
            if (query.includes('SELECT * FROM calendar_events_cache')) {
                return {
                    all: (...params) => {
                        capturedQuery = query;
                        capturedParams = params;
                        return rows;
                    },
                };
            }
            throw new Error(`Unexpected query: ${query}`);
        },
    };

    const service = new CalendarSyncService(fakeDb, () => null);
    const mapped = service.getCachedEvents('2026-05-01', '2026-05-03');

    assert.equal(mapped.length, 2);
    assert.ok(capturedQuery.includes('end_time >= ?'));
    assert.ok(capturedQuery.includes('start_time <= ?'));
    assert.equal(capturedParams.length, 2);

    assert.equal(mapped[0].source_name, 'Family');
    assert.equal(mapped[0].source_color, '#123456');
    assert.equal(mapped[0].all_day, false);

    assert.equal(mapped[1].source_name, 'Unknown');
    assert.equal(mapped[1].source_color, '#6e44ff');
    assert.equal(mapped[1].all_day, true);
});
