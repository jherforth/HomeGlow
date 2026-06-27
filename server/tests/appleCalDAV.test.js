const test = require('node:test');
const assert = require('node:assert/strict');
const ICAL = require('ical.js');
const { extractIcsFromCalendarData } = require('../services/appleCalDAV');

// Anonymized fixtures: no real names, emails, or principal/DSID values.
const ANON_VEVENT = [
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
].join('\r\n');

const ANON_VCALENDAR = [
    'BEGIN:VCALENDAR',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Example Inc.//Example//EN',
    'VERSION:2.0',
    ANON_VEVENT,
    'END:VCALENDAR',
].join('\r\n');

// Mirrors the shape iCloud returns: calendar-data wrapped in a CDATA section.
function buildCdataResponseBlock(icsBody) {
    return [
        '<calendar-data xmlns="urn:ietf:params:xml:ns:caldav">',
        `<![CDATA[${icsBody}`,
        ']]>',
        '</calendar-data>',
    ].join('\n');
}

// Some CalDAV servers return entity-encoded ICS instead of CDATA.
function buildEntityEncodedResponseBlock(icsBody) {
    const encoded = icsBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `<calendar-data xmlns="urn:ietf:params:xml:ns:caldav">${encoded}</calendar-data>`;
}

test('extractIcsFromCalendarData strips the CDATA wrapper', () => {
    const block = buildCdataResponseBlock(ANON_VCALENDAR);
    const ics = extractIcsFromCalendarData(block);

    assert.ok(ics.startsWith('BEGIN:VCALENDAR'), 'first line must be BEGIN:VCALENDAR');
    assert.ok(!ics.includes('<![CDATA['), 'CDATA opening marker must be removed');
    assert.ok(!ics.includes(']]>'), 'CDATA closing marker must be removed');
});

test('CDATA-wrapped calendar-data parses cleanly with ical.js', () => {
    const block = buildCdataResponseBlock(ANON_VCALENDAR);
    const ics = extractIcsFromCalendarData(block);

    // Regression: previously threw "Cannot read properties of undefined
    // (reading 'propertyGroups')" because the CDATA prefix prevented ical.js
    // from initializing its design set on the first line.
    const comp = new ICAL.Component(ICAL.parse(ics));
    const vevents = comp.getAllSubcomponents('vevent');

    assert.equal(vevents.length, 1);
    const event = new ICAL.Event(vevents[0]);
    assert.equal(event.summary, 'Sample Event');
    assert.equal(event.uid, '00000000-0000-0000-0000-000000000000');
});

test('extractIcsFromCalendarData decodes entity-encoded (non-CDATA) calendar-data', () => {
    const block = buildEntityEncodedResponseBlock(ANON_VCALENDAR);
    const ics = extractIcsFromCalendarData(block);

    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    const comp = new ICAL.Component(ICAL.parse(ics));
    assert.equal(comp.getAllSubcomponents('vevent').length, 1);
});
