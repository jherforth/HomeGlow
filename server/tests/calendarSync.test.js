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

test('parseEventColor extracts a valid hex and rejects anything else', () => {
    const service = new CalendarSyncService({}, () => null);

    assert.equal(service.parseEventColor(JSON.stringify({ eventColor: '#dc2127' })), '#dc2127');
    assert.equal(service.parseEventColor(JSON.stringify({ eventColor: null })), null);
    assert.equal(service.parseEventColor(JSON.stringify({ googleEventId: 'x' })), null);
    assert.equal(service.parseEventColor(JSON.stringify({ eventColor: 'red' })), null);
    assert.equal(service.parseEventColor('not json'), null);
    assert.equal(service.parseEventColor(null), null);
});

test('getCachedEvents surfaces per-event color and leaves it null otherwise', () => {
    const rows = [
        {
            source_id: 1, event_uid: 'recolored', title: 'Recolored',
            start_time: '2026-05-01T13:00:00.000Z', end_time: '2026-05-01T14:00:00.000Z',
            description: null, location: null, all_day: 0,
            raw_data: JSON.stringify({ googleEventId: 'a', colorId: '11', eventColor: '#dc2127' }),
        },
        {
            source_id: 1, event_uid: 'default-color', title: 'Default',
            start_time: '2026-05-02T13:00:00.000Z', end_time: '2026-05-02T14:00:00.000Z',
            description: null, location: null, all_day: 0,
            raw_data: JSON.stringify({ googleEventId: 'b', colorId: null, eventColor: null }),
        },
    ];

    const fakeDb = {
        prepare(query) {
            // The events query also mentions calendar_sources in a subselect,
            // so match the cache table first.
            if (query.includes('FROM calendar_events_cache')) {
                return { all: () => rows };
            }
            if (query.includes('FROM calendar_sources')) {
                return { all: () => [{ id: 1, name: 'Family', color: '#123456' }] };
            }
            throw new Error(`Unexpected query: ${query}`);
        },
    };

    const service = new CalendarSyncService(fakeDb, () => null);
    const mapped = service.getCachedEvents();

    assert.equal(mapped.length, 2);
    assert.equal(mapped[0].event_color, '#dc2127');
    assert.equal(mapped[0].source_color, '#123456');
    assert.equal(mapped[1].event_color, null);
    assert.equal(mapped[1].source_color, '#123456');
});

function stubGoogle({ events, colors = {}, labels = {} }) {
    const googleCalendar = require('../services/googleCalendar');
    const googleConnection = require('../services/googleConnection');

    const original = {
        getConnectedAccount: googleConnection.getConnectedAccount,
        listEvents: googleCalendar.listEvents,
        listEventColors: googleCalendar.listEventColors,
        listEventLabels: googleCalendar.listEventLabels,
    };

    googleConnection.getConnectedAccount = () => ({ id: 'acct-1' });
    googleCalendar.listEvents = async () => events;
    googleCalendar.listEventColors = async () => colors;
    googleCalendar.listEventLabels = async () => labels;

    return () => {
        googleConnection.getConnectedAccount = original.getConnectedAccount;
        googleCalendar.listEvents = original.listEvents;
        googleCalendar.listEventColors = original.listEventColors;
        googleCalendar.listEventLabels = original.listEventLabels;
    };
}

test('fetchGoogleEvents resolves colorId to a hex via the Google palette', async () => {
    const restore = stubGoogle({
        colors: { '11': '#dc2127' },
        events: [
            {
                id: 'evt-recolored', status: 'confirmed', summary: 'Recolored',
                start: { dateTime: '2026-05-01T13:00:00Z' },
                end: { dateTime: '2026-05-01T14:00:00Z' },
                colorId: '11',
            },
            {
                id: 'evt-default', status: 'confirmed', summary: 'Default',
                start: { dateTime: '2026-05-02T13:00:00Z' },
                end: { dateTime: '2026-05-02T14:00:00Z' },
            },
        ],
    });

    try {
        const service = new CalendarSyncService({}, () => null);
        const events = await service.fetchGoogleEvents({ id: 1, url: 'primary' });

        assert.equal(events.length, 2);
        assert.equal(events[0].raw.colorId, '11');
        assert.equal(events[0].raw.eventColor, '#dc2127');
        assert.equal(events[1].raw.colorId, null);
        assert.equal(events[1].raw.eventColor, null);
    } finally {
        restore();
    }
});

test('fetchGoogleEvents leaves color null when the palette is unavailable', async () => {
    const restore = stubGoogle({
        events: [
            {
                id: 'evt-recolored', status: 'confirmed', summary: 'Recolored',
                start: { dateTime: '2026-05-01T13:00:00Z' },
                end: { dateTime: '2026-05-01T14:00:00Z' },
                colorId: '11',
            },
        ],
    });

    try {
        const service = new CalendarSyncService({}, () => null);
        const events = await service.fetchGoogleEvents({ id: 1, url: 'primary' });

        assert.equal(events[0].raw.colorId, '11');
        assert.equal(events[0].raw.eventColor, null);
    } finally {
        restore();
    }
});

test('fetchGoogleEvents resolves a custom-label event via its eventLabelId', async () => {
    const restore = stubGoogle({
        labels: { 'label-uuid-a': '#616161' },
        events: [
            {
                id: 'evt-label-only', status: 'confirmed', summary: 'Custom labeled',
                start: { dateTime: '2026-05-01T13:00:00Z' },
                end: { dateTime: '2026-05-01T14:00:00Z' },
                eventLabelId: 'label-uuid-a',
            },
        ],
    });

    try {
        const service = new CalendarSyncService({}, () => null);
        const events = await service.fetchGoogleEvents({ id: 1, url: 'primary' });

        assert.equal(events[0].raw.colorId, null);
        assert.equal(events[0].raw.eventLabelId, 'label-uuid-a');
        assert.equal(events[0].raw.eventColor, '#616161');
    } finally {
        restore();
    }
});

test('fetchGoogleEvents prefers the label color over the legacy palette when both are present', async () => {
    // The regression that motivates this change: colorId 8 resolves to the
    // pre-2016 #e1e1e1, but the current label color for the same event is
    // #616161. If we ever regress to colorId-first, this flips back to the
    // wrong color.
    const restore = stubGoogle({
        colors: { '8': '#e1e1e1' },
        labels: { 'label-uuid-b': '#616161' },
        events: [
            {
                id: 'evt-both', status: 'confirmed', summary: 'Default palette',
                start: { dateTime: '2026-05-01T13:00:00Z' },
                end: { dateTime: '2026-05-01T14:00:00Z' },
                colorId: '8',
                eventLabelId: 'label-uuid-b',
            },
        ],
    });

    try {
        const service = new CalendarSyncService({}, () => null);
        const events = await service.fetchGoogleEvents({ id: 1, url: 'primary' });

        assert.equal(events[0].raw.colorId, '8');
        assert.equal(events[0].raw.eventLabelId, 'label-uuid-b');
        assert.equal(events[0].raw.eventColor, '#616161');
    } finally {
        restore();
    }
});

test('fetchGoogleEvents leaves color null when neither colorId nor label are set', async () => {
    const restore = stubGoogle({
        colors: { '11': '#dc2127' },
        labels: { 'label-uuid-c': '#616161' },
        events: [
            {
                id: 'evt-none', status: 'confirmed', summary: 'Uncolored',
                start: { dateTime: '2026-05-01T13:00:00Z' },
                end: { dateTime: '2026-05-01T14:00:00Z' },
            },
        ],
    });

    try {
        const service = new CalendarSyncService({}, () => null);
        const events = await service.fetchGoogleEvents({ id: 1, url: 'primary' });

        assert.equal(events[0].raw.colorId, null);
        assert.equal(events[0].raw.eventLabelId, null);
        assert.equal(events[0].raw.eventColor, null);
    } finally {
        restore();
    }
});

test('fetchGoogleEvents falls through when the label id is not in the label map', async () => {
    // Simulates a stale label cache: the event references a label we do not
    // have a color for, but it also has a colorId. The colorId must win over
    // dropping color entirely.
    const restore = stubGoogle({
        colors: { '11': '#dc2127' },
        labels: {},
        events: [
            {
                id: 'evt-unknown-label', status: 'confirmed', summary: 'Unknown label',
                start: { dateTime: '2026-05-01T13:00:00Z' },
                end: { dateTime: '2026-05-01T14:00:00Z' },
                colorId: '11',
                eventLabelId: 'label-not-in-map',
            },
            {
                id: 'evt-unknown-label-only', status: 'confirmed', summary: 'Unknown label alone',
                start: { dateTime: '2026-05-02T13:00:00Z' },
                end: { dateTime: '2026-05-02T14:00:00Z' },
                eventLabelId: 'label-not-in-map',
            },
        ],
    });

    try {
        const service = new CalendarSyncService({}, () => null);
        const events = await service.fetchGoogleEvents({ id: 1, url: 'primary' });

        assert.equal(events[0].raw.eventColor, '#dc2127');
        assert.equal(events[1].raw.eventColor, null);
    } finally {
        restore();
    }
});
