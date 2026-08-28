const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { XMLValidator } = require('fast-xml-parser');
const {
    ICLOUD_XML_MESSAGE,
    parsePrincipalUrl,
    parseCalendarHomeUrl,
    parseCalendars,
    parseCollectionSource,
    normalizeFeedUrl,
    extractIcsPayloads,
    icsToEvents,
    fetchCalendarEvents,
} = require('../services/appleCalDAV');

// Anonymized fixtures: no real names, emails, or principal/DSID values.
const ANON_VCALENDAR = [
    'BEGIN:VCALENDAR',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Example Inc.//Example//EN',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'ATTENDEE;CN=Jane Doe;CUTYPE=INDIVIDUAL;EMAIL=jane@example.com',
    ' ;PARTSTAT=ACCEPTED;ROLE=CHAIR:/principal/',
    'CREATED:20251215T153939Z',
    'DTEND;TZID=America/Chicago:20260309T104500',
    'DTSTART;TZID=America/Chicago:20260309T094500',
    'SUMMARY:Sample Event',
    'UID:00000000-0000-0000-0000-000000000000',
    'DTSTAMP:20260108T022826Z',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');

// Wrap an ICS body in a calendar REPORT multistatus, the way iCloud does: the
// calendar-data is inside a CDATA section.
function buildReportWithCdata(icsBody) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/123456/calendars/home/event.ics</href>
    <propstat>
      <prop>
        <getetag>"abc123"</getetag>
        <caldav:calendar-data><![CDATA[${icsBody}]]></caldav:calendar-data>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;
}

// Some CalDAV servers return entity-encoded ICS instead of CDATA.
function buildReportWithEntities(icsBody) {
    const encoded = icsBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/123456/calendars/home/event.ics</href>
    <propstat>
      <prop>
        <caldav:calendar-data>${encoded}</caldav:calendar-data>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;
}

test('extractIcsPayloads unwraps CDATA calendar-data (regression: propertyGroups)', () => {
    const payloads = extractIcsPayloads(buildReportWithCdata(ANON_VCALENDAR));

    assert.equal(payloads.length, 1);
    assert.ok(payloads[0].startsWith('BEGIN:VCALENDAR'), 'first line must be BEGIN:VCALENDAR');
    assert.ok(!payloads[0].includes('<![CDATA['), 'CDATA marker must be gone');
    assert.ok(!payloads[0].includes(']]>'), 'CDATA marker must be gone');

    // Previously threw "Cannot read properties of undefined (reading 'propertyGroups')".
    const events = icsToEvents(payloads[0]);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Sample Event');
    assert.equal(events[0].uid, '00000000-0000-0000-0000-000000000000');
    assert.equal(events[0].all_day, false);
});

test('extractIcsPayloads decodes entity-encoded (non-CDATA) calendar-data', () => {
    const payloads = extractIcsPayloads(buildReportWithEntities(ANON_VCALENDAR));

    assert.equal(payloads.length, 1);
    assert.ok(payloads[0].startsWith('BEGIN:VCALENDAR'));
    assert.equal(icsToEvents(payloads[0]).length, 1);
});

test('extractIcsPayloads handles multiple responses and skips empty ones', () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/123456/calendars/home/a.ics</href>
    <propstat><prop><caldav:calendar-data><![CDATA[${ANON_VCALENDAR}]]></caldav:calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
  <response>
    <href>/123456/calendars/home/missing.ics</href>
    <propstat><prop/><status>HTTP/1.1 404 Not Found</status></propstat>
  </response>
  <response>
    <href>/123456/calendars/home/b.ics</href>
    <propstat><prop><caldav:calendar-data><![CDATA[${ANON_VCALENDAR}]]></caldav:calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

    assert.equal(extractIcsPayloads(body).length, 2);
});

test('parsePrincipalUrl extracts and absolutizes the current-user-principal href', () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/</href>
    <propstat>
      <prop><current-user-principal><href>/123456/principal/</href></current-user-principal></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

    assert.equal(parsePrincipalUrl(body), 'https://caldav.icloud.com/123456/principal/');
});

test('parseCalendarHomeUrl extracts the calendar-home-set href', () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/123456/principal/</href>
    <propstat>
      <prop><caldav:calendar-home-set><href>/123456/calendars/</href></caldav:calendar-home-set></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

    assert.equal(parseCalendarHomeUrl(body), 'https://caldav.icloud.com/123456/calendars/');
});

test('parseCalendars returns VEVENT calendars and skips non-calendar / VTODO-only collections', () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav"
             xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
  <response>
    <href>/123456/calendars/</href>
    <propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
  <response>
    <href>/123456/calendars/home/</href>
    <propstat><prop>
      <displayname>Family</displayname>
      <resourcetype><collection/><caldav:calendar/></resourcetype>
      <ical:calendar-color>#FF2968FF</ical:calendar-color>
      <caldav:supported-calendar-component-set><caldav:comp name="VEVENT"/></caldav:supported-calendar-component-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
  <response>
    <href>/123456/calendars/tasks/</href>
    <propstat><prop>
      <displayname>Reminders</displayname>
      <resourcetype><collection/><caldav:calendar/></resourcetype>
      <caldav:supported-calendar-component-set><caldav:comp name="VTODO"/></caldav:supported-calendar-component-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

    const calendars = parseCalendars(body);
    assert.equal(calendars.length, 1);
    assert.equal(calendars[0].name, 'Family');
    assert.equal(calendars[0].url, 'https://caldav.icloud.com/123456/calendars/home/');
    // #RRGGBBAA normalized to #RRGGBB
    assert.equal(calendars[0].color, '#FF2968');
});

test('parseCalendars includes shared/subscribed calendars that advertise VEVENT', () => {
    // Subscribed iCloud calendars use <cs:subscribed/> instead of <C:calendar/>
    // but still advertise VEVENT support. Regression: these were being dropped.
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav"
             xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
  <response>
    <href>/123456/calendars/work/</href>
    <propstat><prop>
      <displayname>Work</displayname>
      <resourcetype><collection/><caldav:calendar/></resourcetype>
      <caldav:supported-calendar-component-set><caldav:comp name="VEVENT"/></caldav:supported-calendar-component-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
  <response>
    <href>/123456/calendars/holidays/</href>
    <propstat><prop>
      <displayname>US Holidays</displayname>
      <resourcetype><collection/><cs:subscribed/></resourcetype>
      <caldav:supported-calendar-component-set><caldav:comp name="VEVENT"/></caldav:supported-calendar-component-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
  <response>
    <href>/123456/calendars/legacy/</href>
    <propstat><prop>
      <displayname>Legacy</displayname>
      <resourcetype><collection/><caldav:calendar/></resourcetype>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

    const calendars = parseCalendars(body);
    const names = calendars.map((c) => c.name).sort();
    // Work + subscribed Holidays (VEVENT) + Legacy (no comp set, calendar resourcetype)
    assert.deepEqual(names, ['Legacy', 'US Holidays', 'Work']);
});

test('normalizeFeedUrl rewrites webcal schemes and rejects non-http(s)', () => {
    assert.equal(
        normalizeFeedUrl('webcal://example.com/feed.ics'),
        'https://example.com/feed.ics'
    );
    assert.equal(
        normalizeFeedUrl('WEBCALS://example.com/feed.ics'),
        'https://example.com/feed.ics'
    );
    // Already-usable schemes pass through untouched.
    assert.equal(
        normalizeFeedUrl('https://example.com/feed.ics?token=abc'),
        'https://example.com/feed.ics?token=abc'
    );
    assert.equal(normalizeFeedUrl('  http://example.com/f.ics  '), 'http://example.com/f.ics');
    // Anything else must be refused so <cs:source> cannot redirect us off-protocol.
    assert.equal(normalizeFeedUrl('file:///etc/passwd'), null);
    assert.equal(normalizeFeedUrl('ftp://example.com/feed.ics'), null);
    assert.equal(normalizeFeedUrl(''), null);
    assert.equal(normalizeFeedUrl(null), null);
});

test('parseCollectionSource reads the subscription feed URL from a Depth:0 PROPFIND', () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <response>
    <href>/123456/calendars/subscribed-feed/</href>
    <propstat><prop>
      <resourcetype><collection/><cs:subscribed/></resourcetype>
      <cs:source><href>webcal://example.com/team/schedule.ics</href></cs:source>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

    const result = parseCollectionSource(body);
    assert.equal(result.subscribed, true);
    assert.equal(result.sourceUrl, 'https://example.com/team/schedule.ics');
});

test('parseCollectionSource reports a regular calendar as not subscribed', () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav"
             xmlns:cs="http://calendarserver.org/ns/">
  <response>
    <href>/123456/calendars/home/</href>
    <propstat><prop>
      <resourcetype><collection/><caldav:calendar/></resourcetype>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

    const result = parseCollectionSource(body);
    assert.equal(result.subscribed, false);
    assert.equal(result.sourceUrl, null);
});

test('parseCalendars exposes subscribed flag and source feed URL', () => {
    // Regression: subscriptions were listed in the picker but then queried with a
    // calendar-query REPORT, which returns an empty multistatus (0 events).
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav"
             xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
  <response>
    <href>/123456/calendars/home/</href>
    <propstat><prop>
      <displayname>Family</displayname>
      <resourcetype><collection/><caldav:calendar/></resourcetype>
      <caldav:supported-calendar-component-set><caldav:comp name="VEVENT"/></caldav:supported-calendar-component-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
  <response>
    <href>/123456/calendars/sports/</href>
    <propstat><prop>
      <displayname>Team Schedule</displayname>
      <resourcetype><collection/><cs:subscribed/></resourcetype>
      <cs:source><href>webcal://example.com/team/schedule.ics</href></cs:source>
      <caldav:supported-calendar-component-set><caldav:comp name="VEVENT"/></caldav:supported-calendar-component-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

    const calendars = parseCalendars(body);
    const byName = Object.fromEntries(calendars.map((c) => [c.name, c]));

    assert.equal(calendars.length, 2);
    assert.equal(byName['Family'].subscribed, false);
    assert.equal(byName['Family'].sourceUrl, null);
    assert.equal(byName['Team Schedule'].subscribed, true);
    assert.equal(byName['Team Schedule'].sourceUrl, 'https://example.com/team/schedule.ics');
});

// ---------------------------------------------------------------------------
// fetchCalendarEvents behaviour (regression: subscribed calendars synced 0 events)
//
// These use a throwaway local http server rather than module mocks, matching the
// approach in homeAssistant.test.js / outboundTls.test.js. fetchCalendarEvents
// takes the collection URL as an argument, so pointing it at 127.0.0.1 is enough
// to observe exactly which requests it makes.
// ---------------------------------------------------------------------------

function buildVCalendar(summary, uid) {
    return [
        'BEGIN:VCALENDAR',
        'CALSCALE:GREGORIAN',
        'PRODID:-//Example Inc.//Example//EN',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'DTSTART;TZID=America/Chicago:20260309T094500',
        'DTEND;TZID=America/Chicago:20260309T104500',
        `SUMMARY:${summary}`,
        `UID:${uid}`,
        'DTSTAMP:20260108T022826Z',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
}

// Stands in for both iCloud (PROPFIND/REPORT) and the third-party feed host (GET),
// recording every request so a test can assert which path was taken.
async function startFakeCalDav() {
    const state = {
        propfindStatus: 207,
        propfindBody: '',
        reportBody: '',
        feedBody: '',
        requests: [],
    };

    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            state.requests.push({
                method: req.method,
                url: req.url,
                authorization: req.headers.authorization ?? null,
                body,
            });

            if (req.method === 'PROPFIND') {
                res.statusCode = state.propfindStatus;
                res.setHeader('Content-Type', 'application/xml; charset=utf-8');
                res.end(state.propfindStatus >= 500 ? 'upstream exploded' : state.propfindBody);
                return;
            }
            if (req.method === 'REPORT') {
                res.statusCode = 207;
                res.setHeader('Content-Type', 'application/xml; charset=utf-8');
                res.end(state.reportBody);
                return;
            }
            if (req.method === 'GET') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
                res.end(state.feedBody);
                return;
            }
            res.statusCode = 405;
            res.end();
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    return {
        base: `http://127.0.0.1:${server.address().port}`,
        state,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

function subscribedPropfind(sourceUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <response>
    <href>/123456/calendars/sports/</href>
    <propstat><prop>
      <resourcetype><collection/><cs:subscribed/></resourcetype>
      ${sourceUrl ? `<cs:source><href>${sourceUrl}</href></cs:source>` : ''}
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;
}

const REGULAR_PROPFIND = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/123456/calendars/home/</href>
    <propstat><prop>
      <resourcetype><collection/><caldav:calendar/></resourcetype>
    </prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

test('fetchCalendarEvents reads a subscribed calendar from its source feed, not via REPORT', async () => {
    const fake = await startFakeCalDav();
    try {
        fake.state.propfindBody = subscribedPropfind(`${fake.base}/team/schedule.ics`);
        fake.state.feedBody = buildVCalendar('Feed Event', 'feed-uid-1');
        // If the old code path ran, this REPORT body would be used instead.
        fake.state.reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:"></multistatus>`;

        const events = await fetchCalendarEvents(
            `${fake.base}/123456/calendars/sports/`,
            'user@example.com',
            'app-specific-password'
        );

        // The regression: this used to be 0 because a calendar-query REPORT against
        // a subscription returns an empty multistatus.
        assert.equal(events.length, 1);
        assert.equal(events[0].title, 'Feed Event');

        const methods = fake.state.requests.map((r) => r.method);
        assert.ok(methods.includes('PROPFIND'), 'must probe the collection first');
        assert.ok(methods.includes('GET'), 'must fetch the upstream feed');
        assert.ok(!methods.includes('REPORT'), 'must not issue a calendar-query REPORT');
    } finally {
        await fake.close();
    }
});

test('fetchCalendarEvents never sends iCloud credentials to the third-party feed host', async () => {
    const fake = await startFakeCalDav();
    try {
        fake.state.propfindBody = subscribedPropfind(`${fake.base}/team/schedule.ics`);
        fake.state.feedBody = buildVCalendar('Feed Event', 'feed-uid-1');

        await fetchCalendarEvents(
            `${fake.base}/123456/calendars/sports/`,
            'user@example.com',
            'app-specific-password'
        );

        const propfind = fake.state.requests.find((r) => r.method === 'PROPFIND');
        const feedGet = fake.state.requests.find((r) => r.method === 'GET');

        // iCloud gets the credentials; the feed host must not.
        assert.match(propfind.authorization ?? '', /^Basic /);
        assert.equal(feedGet.authorization, null, 'feed request must be unauthenticated');
    } finally {
        await fake.close();
    }
});

test('fetchCalendarEvents keeps using REPORT for a regular calendar', async () => {
    const fake = await startFakeCalDav();
    try {
        fake.state.propfindBody = REGULAR_PROPFIND;
        fake.state.reportBody = buildReportWithCdata(buildVCalendar('Report Event', 'report-uid-1'));
        // Must not be touched for a non-subscribed calendar.
        fake.state.feedBody = buildVCalendar('Feed Event', 'feed-uid-1');

        const events = await fetchCalendarEvents(
            `${fake.base}/123456/calendars/home/`,
            'user@example.com',
            'app-specific-password'
        );

        assert.equal(events.length, 1);
        assert.equal(events[0].title, 'Report Event');

        const methods = fake.state.requests.map((r) => r.method);
        assert.ok(methods.includes('REPORT'), 'regular calendars still use REPORT');
        assert.ok(!methods.includes('GET'), 'must not fetch any feed');
    } finally {
        await fake.close();
    }
});

test('fetchCalendarEvents falls back to REPORT when the subscription probe fails', async () => {
    const fake = await startFakeCalDav();
    try {
        // A failing probe must never break a calendar the REPORT path already handled.
        fake.state.propfindStatus = 500;
        fake.state.reportBody = buildReportWithCdata(buildVCalendar('Report Event', 'report-uid-1'));

        const events = await fetchCalendarEvents(
            `${fake.base}/123456/calendars/home/`,
            'user@example.com',
            'app-specific-password'
        );

        assert.equal(events.length, 1);
        assert.equal(events[0].title, 'Report Event');
        assert.ok(
            fake.state.requests.some((r) => r.method === 'REPORT'),
            'probe failure must fall through to REPORT'
        );
    } finally {
        await fake.close();
    }
});

test('fetchCalendarEvents reports a clear error for a subscription with no source URL', async () => {
    const fake = await startFakeCalDav();
    try {
        fake.state.propfindBody = subscribedPropfind(null);

        await assert.rejects(
            () => fetchCalendarEvents(
                `${fake.base}/123456/calendars/sports/`,
                'user@example.com',
                'app-specific-password'
            ),
            /no usable source feed URL/i
        );

        // Silently returning [] here is what made the original bug hard to spot.
        assert.ok(!fake.state.requests.some((r) => r.method === 'GET'));
    } finally {
        await fake.close();
    }
});

test('fetchCalendarEvents rejects a non-http(s) subscription source instead of fetching it', async () => {
    const fake = await startFakeCalDav();
    try {
        fake.state.propfindBody = subscribedPropfind('file:///etc/passwd');

        await assert.rejects(
            () => fetchCalendarEvents(
                `${fake.base}/123456/calendars/sports/`,
                'user@example.com',
                'app-specific-password'
            ),
            /no usable source feed URL/i
        );
    } finally {
        await fake.close();
    }
});

// ---------------------------------------------------------------------------
// ICLOUD_XML_MESSAGE: the outbound request bodies
// ---------------------------------------------------------------------------

const STATIC_MESSAGES = [
    'CURRENT_USER_PRINCIPAL',
    'CALENDAR_HOME_SET',
    'CALENDAR_LIST',
    'COLLECTION_SOURCE',
];

test('ICLOUD_XML_MESSAGE static bodies are well-formed XML', () => {
    for (const key of STATIC_MESSAGES) {
        const body = ICLOUD_XML_MESSAGE[key];
        assert.equal(typeof body, 'string', `${key} must be a string`);
        assert.ok(body.startsWith('<?xml'), `${key} must start with an XML declaration`);
        assert.equal(XMLValidator.validate(body), true, `${key} must be well-formed XML`);
    }
});

test('ICLOUD_XML_MESSAGE.CALENDAR_LIST requests cs:source (regression guard)', () => {
    // Dropping cs:source is precisely what made subscribed calendars look like
    // empty calendars: without it the upstream feed URL is never discoverable.
    assert.match(ICLOUD_XML_MESSAGE.CALENDAR_LIST, /<cs:source\s*\/>/);
    assert.match(ICLOUD_XML_MESSAGE.CALENDAR_LIST, /xmlns:cs="http:\/\/calendarserver\.org\/ns\/"/);
    // The properties the picker depends on must stay requested too.
    assert.match(ICLOUD_XML_MESSAGE.CALENDAR_LIST, /<d:displayname\s*\/>/);
    assert.match(ICLOUD_XML_MESSAGE.CALENDAR_LIST, /<d:resourcetype\s*\/>/);
    assert.match(ICLOUD_XML_MESSAGE.CALENDAR_LIST, /<c:supported-calendar-component-set\s*\/>/);
});

test('ICLOUD_XML_MESSAGE.COLLECTION_SOURCE asks only what the probe needs', () => {
    assert.match(ICLOUD_XML_MESSAGE.COLLECTION_SOURCE, /<d:resourcetype\s*\/>/);
    assert.match(ICLOUD_XML_MESSAGE.COLLECTION_SOURCE, /<cs:source\s*\/>/);
});

test('ICLOUD_XML_MESSAGE.CALENDAR_QUERY interpolates the time-range and stays well-formed', () => {
    const body = ICLOUD_XML_MESSAGE.CALENDAR_QUERY('20260101T000000Z', '20261231T235959Z');

    assert.equal(XMLValidator.validate(body), true);
    assert.match(body, /<c:time-range start="20260101T000000Z" end="20261231T235959Z"\s*\/>/);
    assert.match(body, /<c:comp-filter name="VEVENT">/);
    assert.match(body, /<c:calendar-data\s*\/>/);
});

test('ICLOUD_XML_MESSAGE is frozen so the bodies cannot be swapped at runtime', () => {
    assert.equal(Object.isFrozen(ICLOUD_XML_MESSAGE), true);
    assert.throws(
        () => { 'use strict'; ICLOUD_XML_MESSAGE.COLLECTION_SOURCE = '<hacked/>'; },
        TypeError
    );
});

test('fetchCalendarEvents sends the calendar-query body with a time-range', async () => {
    const fake = await startFakeCalDav();
    try {
        fake.state.propfindBody = REGULAR_PROPFIND;
        fake.state.reportBody = buildReportWithCdata(buildVCalendar('Report Event', 'report-uid-1'));

        await fetchCalendarEvents(
            `${fake.base}/123456/calendars/home/`,
            'user@example.com',
            'app-specific-password'
        );

        const report = fake.state.requests.find((r) => r.method === 'REPORT');
        assert.ok(report, 'a REPORT must be issued for a regular calendar');
        assert.equal(XMLValidator.validate(report.body), true, 'REPORT body must be well-formed');
        assert.match(report.body, /<c:calendar-query/);
        // Basic-format UTC bounds, e.g. 20260309T094500Z
        assert.match(report.body, /<c:time-range start="\d{8}T\d{6}Z" end="\d{8}T\d{6}Z"\s*\/>/);
    } finally {
        await fake.close();
    }
});
