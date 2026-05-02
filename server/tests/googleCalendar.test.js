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
