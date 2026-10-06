const test = require('node:test');
const assert = require('node:assert/strict');
const googleCalendar = require('../services/googleCalendar');
const googleConnection = require('../services/googleConnection');

let originalFetch;
let originalGetValidAccessToken;

test.beforeEach(() => {
    originalFetch = global.fetch;
    originalGetValidAccessToken = googleConnection.getValidAccessToken;
    googleConnection.getValidAccessToken = async () => 'fake-token';
});

test.afterEach(() => {
    global.fetch = originalFetch;
    googleConnection.getValidAccessToken = originalGetValidAccessToken;
});

test('parseEventDate handles all-day and timed event payloads', () => {
    assert.deepEqual(googleCalendar.parseEventDate({ date: '2026-05-01' }), {
        date: '2026-05-01',
        allDay: true,
    });

    assert.deepEqual(googleCalendar.parseEventDate({
        dateTime: '2026-05-01T10:00:00Z',
        timeZone: 'UTC',
    }), {
        date: '2026-05-01T10:00:00Z',
        allDay: false,
        timeZone: 'UTC',
    });

    assert.equal(googleCalendar.parseEventDate(null), null);
    assert.equal(googleCalendar.parseEventDate({}), null);
});

test('listCalendars paginates and maps response fields', async () => {
    const calls = [];
    const responses = [
        {
            items: [
                {
                    id: 'one',
                    summary: 'Cal One',
                    summaryOverride: 'Custom One',
                    description: 'A',
                    backgroundColor: '#111111',
                    foregroundColor: '#ffffff',
                    primary: true,
                    accessRole: 'owner',
                    timeZone: 'UTC',
                },
            ],
            nextPageToken: 'next-token',
        },
        {
            items: [
                {
                    id: 'two',
                    summary: 'Cal Two',
                    description: 'B',
                    backgroundColor: '#222222',
                    foregroundColor: '#eeeeee',
                    primary: false,
                    accessRole: 'reader',
                    timeZone: 'America/New_York',
                },
            ],
        },
    ];

    global.fetch = async (url, init) => {
        calls.push({ url, init });
        const payload = responses.shift();
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(payload),
        };
    };

    const calendars = await googleCalendar.listCalendars({}, 1);

    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes('/users/me/calendarList'));
    assert.ok(calls[1].url.includes('pageToken=next-token'));
    assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-token');

    assert.equal(calendars.length, 2);
    assert.deepEqual(calendars[0], {
        id: 'one',
        summary: 'Cal One',
        summaryOverride: 'Custom One',
        description: 'A',
        backgroundColor: '#111111',
        foregroundColor: '#ffffff',
        primary: true,
        accessRole: 'owner',
        timeZone: 'UTC',
    });
    assert.equal(calendars[1].primary, false);
});

test('createEvent builds all-day payload and sends bearer token', async () => {
    let captured;

    global.fetch = async (url, init) => {
        captured = { url, init };
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'created-id' }),
        };
    };

    const created = await googleCalendar.createEvent({}, 1, 'primary', {
        title: 'All Day Event',
        description: 'Desc',
        location: 'Home',
        start: '2026-05-10',
        end: '2026-05-11',
        allDay: true,
    });

    assert.equal(created.id, 'created-id');
    assert.ok(captured.url.includes('/calendars/primary/events'));
    assert.equal(captured.init.method, 'POST');
    assert.equal(captured.init.headers.Authorization, 'Bearer fake-token');

    const body = JSON.parse(captured.init.body);
    assert.equal(body.summary, 'All Day Event');
    assert.equal(body.start.date, '2026-05-10');
    assert.equal(body.end.date, '2026-05-11');
    assert.equal(body.start.dateTime, undefined);
    assert.equal(body.end.dateTime, undefined);
});

// Issue #215: the event editor sends `all_day` with an inclusive end date.
// Capture the body each call would send to Google.
function captureGoogleBody() {
    const calls = [];
    global.fetch = async (url, init) => {
        calls.push({ url, method: init.method, body: JSON.parse(init.body) });
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'evt' }) };
    };
    return calls;
}

// Exactly what CalendarWidget's saveEvent posts for a one-day event on Oct 9.
const editorAllDay = (start, end) => ({
    title: 'Field trip', description: '', location: '', all_day: true, start, end,
});

test('an all-day event from the editor is saved as a Google all-day event (#215)', async () => {
    const calls = captureGoogleBody();
    await googleCalendar.createEvent({}, 1, 'primary', editorAllDay('2026-10-09', '2026-10-09'));

    const { body } = calls[0];
    assert.deepEqual(body.start, { date: '2026-10-09' });
    // Google's all-day end is exclusive: a one-day event ends the next day.
    assert.deepEqual(body.end, { date: '2026-10-10' });
});

test('the editor\'s inclusive end becomes Google\'s exclusive end (#215)', async () => {
    const calls = captureGoogleBody();
    await googleCalendar.createEvent({}, 1, 'primary', editorAllDay('2026-10-09', '2026-10-11'));
    await googleCalendar.createEvent({}, 1, 'primary', editorAllDay('2026-12-31', '2026-12-31'));
    await googleCalendar.createEvent({}, 1, 'primary', editorAllDay('2026-02-28', '2026-02-28'));
    // An end before the start is treated as a one-day event, not a negative one.
    await googleCalendar.createEvent({}, 1, 'primary', editorAllDay('2026-10-09', '2026-10-01'));

    assert.deepEqual(calls.map((c) => [c.body.start.date, c.body.end.date]), [
        ['2026-10-09', '2026-10-12'],
        ['2026-12-31', '2027-01-01'],
        ['2026-02-28', '2026-03-01'],
        ['2026-10-09', '2026-10-10'],
    ]);
});

test('a timed event from the editor is still saved as timed (#215)', async () => {
    const calls = captureGoogleBody();
    await googleCalendar.createEvent({}, 1, 'primary', {
        title: 'Dentist', all_day: false, start: '2026-10-09T15:00:00Z', end: '2026-10-09T16:00:00Z',
    });
    const { body } = calls[0];
    assert.equal(body.start.dateTime, '2026-10-09T15:00:00.000Z');
    assert.equal(body.end.dateTime, '2026-10-09T16:00:00.000Z');
    assert.equal(body.start.date, undefined);
});

test('editing an event into all-day clears its time, and back again (#215)', async () => {
    const calls = captureGoogleBody();
    await googleCalendar.updateEvent({}, 1, 'primary', 'evt', editorAllDay('2026-10-09', '2026-10-09'));
    await googleCalendar.updateEvent({}, 1, 'primary', 'evt', {
        title: 'Dentist', all_day: false, start: '2026-10-09T15:00:00Z', end: '2026-10-09T16:00:00Z',
    });

    assert.equal(calls[0].method, 'PATCH');
    // An update merges into what Google holds, so the other kind of time is
    // cleared explicitly rather than left beside the new one.
    assert.deepEqual(calls[0].body.start, { date: '2026-10-09', dateTime: null, timeZone: null });
    assert.deepEqual(calls[0].body.end, { date: '2026-10-10', dateTime: null, timeZone: null });
    assert.deepEqual(calls[1].body.start, { dateTime: '2026-10-09T15:00:00.000Z', date: null });
});
