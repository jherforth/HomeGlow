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

// Issue #244: the event editor can pick one of Google's eleven event colors.
test('a color picked in the editor is sent to Google as colorId (#244)', async () => {
    const calls = captureGoogleBody();
    await googleCalendar.createEvent({}, 1, 'primary', { ...editorAllDay('2026-10-09', '2026-10-09'), color_id: '11' });
    // A number from a hand-written request is accepted too.
    await googleCalendar.createEvent({}, 1, 'primary', { ...editorAllDay('2026-10-09', '2026-10-09'), color_id: 8 });
    await googleCalendar.updateEvent({}, 1, 'primary', 'evt', { color_id: '2' });

    assert.equal(calls[0].body.colorId, '11');
    assert.equal(calls[1].body.colorId, '8');
    assert.deepEqual(calls[2].body, { colorId: '2' });
});

test('no color_id leaves the color alone; null puts the calendar color back (#244)', async () => {
    const calls = captureGoogleBody();
    // Created on the calendar's color: nothing to send.
    await googleCalendar.createEvent({}, 1, 'primary', editorAllDay('2026-10-09', '2026-10-09'));
    await googleCalendar.createEvent({}, 1, 'primary', { ...editorAllDay('2026-10-09', '2026-10-09'), color_id: null });
    // An edit that does not mention the color must not touch it.
    await googleCalendar.updateEvent({}, 1, 'primary', 'evt', { title: 'Renamed' });
    // Back to the calendar's color, from the editor ('') or the API (null).
    await googleCalendar.updateEvent({}, 1, 'primary', 'evt', { color_id: '' });
    await googleCalendar.updateEvent({}, 1, 'primary', 'evt', { color_id: null });

    assert.equal('colorId' in calls[0].body, false);
    assert.equal('colorId' in calls[1].body, false);
    assert.equal('colorId' in calls[2].body, false);
    assert.deepEqual(calls[3].body, { colorId: null });
    assert.deepEqual(calls[4].body, { colorId: null });
});

test('a color Google does not have is a 400, and nothing is sent (#244)', async () => {
    const calls = captureGoogleBody();
    for (const color_id of ['0', '12', 'red', '#d50000', 3.5]) {
        await assert.rejects(
            googleCalendar.updateEvent({}, 1, 'primary', 'evt', { color_id }),
            (error) => error.status === 400,
        );
    }
    assert.equal(calls.length, 0);
});

test('EVENT_COLORS is Google\'s current eleven-color palette (#244)', () => {
    assert.deepEqual(Object.keys(googleCalendar.EVENT_COLORS), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    for (const hex of Object.values(googleCalendar.EVENT_COLORS)) assert.match(hex, /^#[0-9a-f]{6}$/);
    // The reason it is not read from /colors: graphite is dark grey, not near-white.
    assert.equal(googleCalendar.EVENT_COLORS['8'], '#616161');
});
