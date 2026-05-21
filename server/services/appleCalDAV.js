const axios = require('axios');
const ICAL = require('ical.js');

const CALDAV_BASE = 'https://caldav.icloud.com';

function buildAuthHeader(appleId, appPassword) {
  return 'Basic ' + Buffer.from(`${appleId}:${appPassword}`).toString('base64');
}

// Discover the user's personal CalDAV principal URL via PROPFIND
async function discoverPrincipalUrl(appleId, appPassword) {
  const authHeader = buildAuthHeader(appleId, appPassword);

  // Apple requires a path suffix to avoid 400 errors on the bare domain
  const response = await axios({
    method: 'PROPFIND',
    url: `${CALDAV_BASE}/`,
    headers: {
      'Authorization': authHeader,
      'Depth': '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    data: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
  </d:prop>
</d:propfind>`,
    timeout: 15000,
    validateStatus: (s) => s < 500,
  });

  if (response.status === 207 || response.status === 200) {
    const body = response.data;
    const hrefMatch = body.match(/<[^>]*:?href[^>]*>(https?:\/\/[^<]+)<\/[^>]*:?href>/i)
      || body.match(/<[^>]*:?current-user-principal[^>]*>[\s\S]*?<[^>]*:?href[^>]*>([^<]+)<\/[^>]*:?href>/i);
    if (hrefMatch) {
      const href = hrefMatch[1].trim();
      return href.startsWith('http') ? href : `${CALDAV_BASE}${href}`;
    }
    // Try to extract any href path
    const pathMatch = body.match(/<[^>]*:?href[^>]*>([^<]+)<\/[^>]*:?href>/i);
    if (pathMatch) {
      const path = pathMatch[1].trim();
      return path.startsWith('http') ? path : `${CALDAV_BASE}${path}`;
    }
  }

  throw new Error(`iCloud principal discovery failed (HTTP ${response.status}). Check your Apple ID and app-specific password.`);
}

// Find the calendar-home-set from the principal URL
async function discoverCalendarHome(principalUrl, appleId, appPassword) {
  const authHeader = buildAuthHeader(appleId, appPassword);

  const response = await axios({
    method: 'PROPFIND',
    url: principalUrl,
    headers: {
      'Authorization': authHeader,
      'Depth': '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    data: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set />
  </d:prop>
</d:propfind>`,
    timeout: 15000,
    validateStatus: (s) => s < 500,
  });

  if (response.status === 207 || response.status === 200) {
    const body = response.data;
    const hrefMatch = body.match(/<[^>]*:?calendar-home-set[^>]*>[\s\S]*?<[^>]*:?href[^>]*>([^<]+)<\/[^>]*:?href>/i);
    if (hrefMatch) {
      const href = hrefMatch[1].trim();
      return href.startsWith('http') ? href : `${CALDAV_BASE}${href}`;
    }
    // Fallback: derive from principal URL (Apple structure is /DSID/principal -> /DSID/calendars/)
    const dsidMatch = principalUrl.match(/\/(\d+)\//);
    if (dsidMatch) {
      const baseUrl = new URL(principalUrl);
      return `${baseUrl.protocol}//${baseUrl.host}/${dsidMatch[1]}/calendars/`;
    }
  }

  throw new Error(`Could not find iCloud calendar home (HTTP ${response.status}).`);
}

// List all calendars in the calendar home
async function listCalendars(calendarHomeUrl, appleId, appPassword) {
  const authHeader = buildAuthHeader(appleId, appPassword);

  const response = await axios({
    method: 'PROPFIND',
    url: calendarHomeUrl,
    headers: {
      'Authorization': authHeader,
      'Depth': '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    data: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
    <ical:calendar-color />
    <cs:getctag />
    <c:supported-calendar-component-set />
  </d:prop>
</d:propfind>`,
    timeout: 15000,
    validateStatus: (s) => s < 500,
  });

  if (response.status !== 207 && response.status !== 200) {
    throw new Error(`Failed to list iCloud calendars (HTTP ${response.status}).`);
  }

  const body = response.data;
  const calendars = [];

  // Parse multistatus responses - each <response> element is a calendar or collection
  const responseBlocks = body.match(/<[^>]*:?response[^>]*>[\s\S]*?<\/[^>]*:?response>/gi) || [];

  for (const block of responseBlocks) {
    // Must be a calendar (vevent support)
    const isCalendar = block.includes('calendar') && !block.includes('calendar-home-set');
    const hasVEvent = block.includes('VEVENT') || block.includes('vevent');
    if (!isCalendar || !hasVEvent) continue;

    const hrefMatch = block.match(/<[^>]*:?href[^>]*>([^<]+)<\/[^>]*:?href>/i);
    const nameMatch = block.match(/<[^>]*:?displayname[^>]*>([^<]*)<\/[^>]*:?displayname>/i);
    const colorMatch = block.match(/<[^>]*:?calendar-color[^>]*>([^<]*)<\/[^>]*:?calendar-color>/i);

    if (!hrefMatch) continue;

    const href = hrefMatch[1].trim();
    const calUrl = href.startsWith('http') ? href : `${CALDAV_BASE}${href}`;
    const name = nameMatch ? nameMatch[1].trim() : 'Calendar';
    let color = colorMatch ? colorMatch[1].trim() : null;

    // Apple returns colors like #RRGGBBAA, normalize to #RRGGBB
    if (color && color.length === 9 && color.startsWith('#')) {
      color = color.slice(0, 7);
    }

    calendars.push({ id: calUrl, name, color: color || '#3d7ab5', url: calUrl });
  }

  return calendars;
}

// Full discovery flow: credentials -> list of calendars
async function discoverAndListCalendars(appleId, appPassword) {
  const principalUrl = await discoverPrincipalUrl(appleId, appPassword);
  const homeUrl = await discoverCalendarHome(principalUrl, appleId, appPassword);
  const calendars = await listCalendars(homeUrl, appleId, appPassword);
  return { principalUrl, homeUrl, calendars };
}

// Fetch events from a specific calendar URL using CalDAV REPORT
async function fetchCalendarEvents(calendarUrl, appleId, appPassword) {
  const authHeader = buildAuthHeader(appleId, appPassword);

  const now = Date.now();
  const timeMin = new Date(now - 13 * 30 * 24 * 60 * 60 * 1000);
  const timeMax = new Date(now + 13 * 30 * 24 * 60 * 60 * 1000);

  const formatDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const response = await axios({
    method: 'REPORT',
    url: calendarUrl,
    headers: {
      'Authorization': authHeader,
      'Depth': '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    data: `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${formatDate(timeMin)}" end="${formatDate(timeMax)}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`,
    timeout: 30000,
    validateStatus: (s) => s < 500,
  });

  if (response.status !== 207 && response.status !== 200) {
    throw new Error(`Failed to fetch iCloud events (HTTP ${response.status}).`);
  }

  const body = response.data;
  const events = [];

  // Extract calendar-data blocks from multistatus
  const calDataMatches = body.match(/<[^>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^>]*:?calendar-data>/gi) || [];

  for (const match of calDataMatches) {
    const icsContent = match
      .replace(/<[^>]*:?calendar-data[^>]*>/i, '')
      .replace(/<\/[^>]*:?calendar-data>/i, '')
      .trim();

    if (!icsContent) continue;

    try {
      const jcalData = ICAL.parse(icsContent);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      for (const vevent of vevents) {
        const event = new ICAL.Event(vevent);
        const dtstart = vevent.getFirstPropertyValue('dtstart');
        const isAllDay = dtstart?.isDate ?? false;
        const startDate = event.startDate.toJSDate();
        const rawEnd = event.endDate.toJSDate();
        const endDate = isAllDay ? subtractOneDay(rawEnd) : rawEnd;

        events.push({
          uid: event.uid || `apple-${Date.now()}-${Math.random()}`,
          title: event.summary || 'Untitled Event',
          start: startDate,
          end: endDate,
          description: event.description || null,
          location: event.location || null,
          all_day: isAllDay,
          raw: {},
        });
      }
    } catch (err) {
      console.warn('Failed to parse Apple CalDAV event block:', err.message);
    }
  }

  return events;
}

function subtractOneDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d;
}

module.exports = {
  discoverAndListCalendars,
  fetchCalendarEvents,
};
