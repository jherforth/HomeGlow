const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parsePrincipalUrl,
    parseCalendarHomeUrl,
    parseCalendars,
    extractIcsPayloads,
    icsToEvents,
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
