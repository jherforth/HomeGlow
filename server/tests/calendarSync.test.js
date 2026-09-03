const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const nodeIcal = require('node-ical');
const CalendarSyncService = require('../services/calendarSync');

// Fixture dates are relative to today: icsToEvents keeps only events inside a
// +/-13-month window, so a hardcoded date would silently age out of it.
const FIXTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const pad = (n) => String(n).padStart(2, '0');
const fixtureYmd = (offsetDays = 0) => {
    const d = new Date(FIXTURE_DATE.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};
const fixtureUtcMidnight = (offsetDays = 0) =>
    `${fixtureYmd(offsetDays).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T00:00:00.000Z`;

// Serves whatever a test puts in `state`, recording each request so the test can
// assert what was actually sent on the wire.
async function startFakeIcsHost() {
    const state = { status: 200, contentType: 'text/calendar', body: '', requests: [] };

    const server = http.createServer((req, res) => {
        state.requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization ?? null });
        res.writeHead(state.status, { 'Content-Type': state.contentType });
        res.end(state.body);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    return {
        state,
        url: `http://127.0.0.1:${server.address().port}/calendar.ics`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}


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

// node-ical resolves date-only values against server-local midnight. Storing
// that instant as-is bakes the backend's timezone into the row, which is how an
// all-day event ends up rendered at 11:00 PM the day before on a display in a
// different zone.
test('normalizeAllDayRange re-anchors local-midnight dates to UTC midnight', () => {
    const service = new CalendarSyncService({}, () => null);

    // Local midnight on Sep 5, whatever zone this process runs in.
    const localStart = new Date(2026, 8, 5);
    const localExclusiveEnd = new Date(2026, 8, 6);

    const single = service.normalizeAllDayRange(localStart, localExclusiveEnd);
    assert.equal(single.start.toISOString(), '2026-09-05T00:00:00.000Z');
    // DTEND is exclusive; a one-day event ends on the day it starts.
    assert.equal(single.end.toISOString(), '2026-09-05T00:00:00.000Z');

    const span = service.normalizeAllDayRange(localStart, new Date(2026, 8, 8));
    assert.equal(span.start.toISOString(), '2026-09-05T00:00:00.000Z');
    assert.equal(span.end.toISOString(), '2026-09-07T00:00:00.000Z');

    // A missing DTEND means a single day, not a zero-length event.
    const noEnd = service.normalizeAllDayRange(localStart, null);
    assert.equal(noEnd.start.toISOString(), '2026-09-05T00:00:00.000Z');
    assert.equal(noEnd.end.toISOString(), '2026-09-05T00:00:00.000Z');
});

test('fetchICSEvents anchors all-day events to UTC midnight of their date', async () => {
    const fixture = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HomeGlow Regression Test//EN',
        'BEGIN:VEVENT',
        'UID:all-day@example.com',
        'DTSTAMP:20260901T120000Z',
        'DTSTART;VALUE=DATE:20260905',
        'DTEND;VALUE=DATE:20260906',
        'SUMMARY:No School',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');

    const parsed = nodeIcal.sync.parseICS(fixture);
    const service = new CalendarSyncService({}, () => null);
    const originalFromUrl = nodeIcal.async.fromURL;
    nodeIcal.async.fromURL = async () => parsed;

    try {
        const events = await service.fetchICSEvents({ id: 'fixture', url: 'http://example.invalid/test.ics' });

        assert.equal(events.length, 1);
        assert.equal(events[0].all_day, true);
        assert.equal(events[0].start.toISOString(), '2026-09-05T00:00:00.000Z');
        assert.equal(events[0].end.toISOString(), '2026-09-05T00:00:00.000Z');
    } finally {
        nodeIcal.async.fromURL = originalFromUrl;
    }
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

// ---------------------------------------------------------------------------
// Generic CalDAV sources (an ICS document behind HTTP basic auth)
// ---------------------------------------------------------------------------

test('fetchCalDAVEvents sends basic auth built from the decrypted password', async () => {
    const host = await startFakeIcsHost();
    host.state.body = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HomeGlow Regression Test//EN',
        'BEGIN:VEVENT',
        'UID:caldav-timed@example.com',
        `DTSTART:${fixtureYmd()}T150000Z`,
        `DTEND:${fixtureYmd()}T160000Z`,
        'SUMMARY:Timed event',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');

    const service = new CalendarSyncService({}, () => 'plaintext-secret');

    try {
        const events = await service.fetchCalDAVEvents({
            id: 7,
            url: host.url,
            username: 'user@example.com',
            password: 'encrypted-blob',
        });

        assert.equal(events.length, 1);
        assert.equal(events[0].title, 'Timed event');

        assert.equal(host.state.requests.length, 1);
        const expected = 'Basic ' + Buffer.from('user@example.com:plaintext-secret').toString('base64');
        assert.equal(host.state.requests[0].authorization, expected);
    } finally {
        await host.close();
    }
});

// This path hand-rolled its own ICS parse, so it carried both of the bugs the
// shared reader fixes: a series showed up once at the date it began, and an
// all-day event was anchored to the server's local midnight.
test('fetchCalDAVEvents expands recurring events and anchors all-day dates', async () => {
    const host = await startFakeIcsHost();
    host.state.body = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HomeGlow Regression Test//EN',
        'BEGIN:VEVENT',
        'UID:caldav-weekly@example.com',
        `DTSTART:${fixtureYmd()}T150000Z`,
        `DTEND:${fixtureYmd()}T160000Z`,
        'SUMMARY:Weekly standup',
        'RRULE:FREQ=WEEKLY;COUNT=3',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:caldav-allday@example.com',
        `DTSTART;VALUE=DATE:${fixtureYmd(1)}`,
        `DTEND;VALUE=DATE:${fixtureYmd(2)}`,
        'SUMMARY:Day off',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');

    const service = new CalendarSyncService({}, () => 'secret');

    try {
        const events = await service.fetchCalDAVEvents({
            id: 7, url: host.url, username: 'user', password: 'blob',
        });

        const standups = events.filter((e) => e.title === 'Weekly standup');
        assert.equal(standups.length, 3, 'the series must be expanded, not cached once');
        const days = standups.map((e) => e.start.getTime());
        assert.equal(days[1] - days[0], 7 * 24 * 60 * 60 * 1000);
        assert.equal(days[2] - days[1], 7 * 24 * 60 * 60 * 1000);
        assert.equal(new Set(standups.map((e) => e.uid)).size, 3, 'each occurrence needs its own uid');

        const dayOff = events.find((e) => e.title === 'Day off');
        assert.ok(dayOff);
        assert.equal(dayOff.all_day, true);
        assert.equal(dayOff.start.toISOString(), fixtureUtcMidnight(1));
        assert.equal(dayOff.end.toISOString(), fixtureUtcMidnight(1));
    } finally {
        await host.close();
    }
});

test('fetchCalDAVEvents rejects a 200 that is not an iCalendar document', async () => {
    const host = await startFakeIcsHost();
    // What a collection URL needing a REPORT, or an auth redirect to a login
    // page, actually returns. ical.js would fail on it with a parse error that
    // says nothing useful.
    host.state.contentType = 'text/html';
    host.state.body = '<!doctype html><html><body>Please sign in</body></html>';

    const service = new CalendarSyncService({}, () => 'secret');

    try {
        await assert.rejects(
            () => service.fetchCalDAVEvents({ id: 7, url: host.url, username: 'user', password: 'blob' }),
            /did not return an iCalendar document/
        );
    } finally {
        await host.close();
    }
});

test('fetchCalDAVEvents reports a failing HTTP status instead of parsing the body', async () => {
    const host = await startFakeIcsHost();
    host.state.status = 401;
    host.state.body = 'Unauthorized';

    const service = new CalendarSyncService({}, () => 'wrong-password');

    try {
        await assert.rejects(
            () => service.fetchCalDAVEvents({ id: 7, url: host.url, username: 'user', password: 'blob' }),
            /HTTP 401/
        );
    } finally {
        await host.close();
    }
});

test('getCachedEvents maps cached rows with source metadata', () => {    const sources = [
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
