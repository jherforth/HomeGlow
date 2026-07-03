const axios = require('axios');
const ICAL = require('ical.js');
const { XMLParser } = require('fast-xml-parser');

const CALDAV_BASE = 'https://caldav.icloud.com';

// CalDAV responses are WebDAV "multistatus" XML envelopes whose <calendar-data>
// elements contain an iCalendar (ICS) text payload. We use a real XML parser for
// the envelope (it transparently handles CDATA, XML entities, and namespaces) and
// hand the extracted ICS text to ical.js, which is responsible for parsing the
// iCalendar payload itself.
const xmlParser = new XMLParser({
  removeNSPrefix: true,   // collapse d:/c:/cs:/ical: prefixes
  ignoreAttributes: false, // need attributes (e.g. comp[name="VEVENT"])
  attributeNamePrefix: '@_',
  parseTagValue: false,    // keep text as strings (colors, ctags, hrefs)
  trimValues: true,
});

function buildAuthHeader(appleId, appPassword) {
  return 'Basic ' + Buffer.from(`${appleId}:${appPassword}`).toString('base64');
}

// ---------------------------------------------------------------------------
// XML helpers (pure, exported for testing)
// ---------------------------------------------------------------------------

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Resolve the text content of a parsed node, whether it is a bare string or an
// object carrying attributes alongside a #text value (CDATA included).
function nodeText(node) {
  if (node === undefined || node === null) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (typeof node === 'object' && '#text' in node) {
    const text = node['#text'];
    return text === undefined || text === null ? null : String(text);
  }
  return null;
}

// Find a prop value across all <propstat> blocks of a <response> (a response can
// carry multiple propstats, e.g. one HTTP 200 and one HTTP 404).
function findProp(response, key) {
  for (const propstat of asArray(response && response.propstat)) {
    const prop = propstat && propstat.prop;
    if (prop && prop[key] !== undefined) return prop[key];
  }
  return undefined;
}

function absolutizeUrl(href) {
  const value = (href || '').trim();
  if (!value) return null;
  return value.startsWith('http') ? value : `${CALDAV_BASE}${value}`;
}

function parseMultistatusResponses(xmlBody) {
  const doc = xmlParser.parse(xmlBody);
  return asArray(doc && doc.multistatus && doc.multistatus.response);
}

// Extract the current-user-principal URL from a PROPFIND response body.
function parsePrincipalUrl(xmlBody) {
  const responses = parseMultistatusResponses(xmlBody);
  for (const response of responses) {
    const cup = findProp(response, 'current-user-principal');
    if (cup) {
      const url = absolutizeUrl(nodeText(cup.href) ?? nodeText(cup));
      if (url) return url;
    }
  }
  // Fallback: first response-level href.
  for (const response of responses) {
    const url = absolutizeUrl(nodeText(response.href));
    if (url) return url;
  }
  return null;
}

// Extract the calendar-home-set URL from a PROPFIND response body.
function parseCalendarHomeUrl(xmlBody) {
  const responses = parseMultistatusResponses(xmlBody);
  for (const response of responses) {
    const home = findProp(response, 'calendar-home-set');
    if (home) {
      const url = absolutizeUrl(nodeText(home.href) ?? nodeText(home));
      if (url) return url;
    }
  }
  return null;
}

// Extract VEVENT-capable calendars from a Depth:1 PROPFIND response body.
function parseCalendars(xmlBody) {
  const calendars = [];

  for (const response of parseMultistatusResponses(xmlBody)) {
    const href = nodeText(response.href);
    if (!href) continue;

    // A collection holds events if it advertises VEVENT in its supported
    // component set. This is the most reliable signal and works across regular,
    // shared, and subscribed iCloud calendars (subscriptions use a
    // <cs:subscribed/> resourcetype rather than <C:calendar/>, so we must not
    // gate on resourcetype alone).
    const compSet = findProp(response, 'supported-calendar-component-set');
    const comps = compSet ? asArray(compSet.comp) : [];
    const supportsVevent = comps.some(
      (comp) => String(comp && comp['@_name'] ? comp['@_name'] : '').toUpperCase() === 'VEVENT'
    );

    // Fallback when no component set is advertised: accept calendar/subscribed
    // resource types (covers servers that omit supported-calendar-component-set)
    // while still excluding the calendar-home root and inbox/outbox collections.
    const resourcetype = findProp(response, 'resourcetype');
    const isCalendarResourceType = !!resourcetype && typeof resourcetype === 'object'
      && ('calendar' in resourcetype || 'subscribed' in resourcetype);

    const include = comps.length > 0 ? supportsVevent : isCalendarResourceType;
    if (!include) continue;

    const name = nodeText(findProp(response, 'displayname')) || 'Calendar';
    let color = nodeText(findProp(response, 'calendar-color'));
    // Apple returns colors like #RRGGBBAA; normalize to #RRGGBB.
    if (color && color.length === 9 && color.startsWith('#')) {
      color = color.slice(0, 7);
    }

    const calUrl = absolutizeUrl(href);
    calendars.push({ id: calUrl, name, color: color || '#3d7ab5', url: calUrl });
  }

  return calendars;
}

// Extract the raw ICS payload strings from a calendar REPORT response body.
// The XML parser already unwraps CDATA and decodes XML entities, so the returned
// strings start at "BEGIN:VCALENDAR" and are ready for ICAL.parse().
function extractIcsPayloads(xmlBody) {
  const payloads = [];

  for (const response of parseMultistatusResponses(xmlBody)) {
    const ics = nodeText(findProp(response, 'calendar-data'));
    if (!ics) continue;

    const trimmed = ics.trim();
    if (trimmed.includes('BEGIN:VCALENDAR')) {
      payloads.push(trimmed);
    }
  }

  return payloads;
}

// ---------------------------------------------------------------------------
// CalDAV HTTP flows
// ---------------------------------------------------------------------------

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
    const principalUrl = parsePrincipalUrl(response.data);
    if (principalUrl) return principalUrl;
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
    const homeUrl = parseCalendarHomeUrl(response.data);
    if (homeUrl) return homeUrl;

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

  return parseCalendars(response.data);
}

// Full discovery flow: credentials -> list of calendars
async function discoverAndListCalendars(appleId, appPassword) {
  const principalUrl = await discoverPrincipalUrl(appleId, appPassword);
  const homeUrl = await discoverCalendarHome(principalUrl, appleId, appPassword);
  const calendars = await listCalendars(homeUrl, appleId, appPassword);
  return { principalUrl, homeUrl, calendars };
}

// Convert a parsed ICS payload into HomeGlow event objects.
function icsToEvents(icsContent) {
  const comp = new ICAL.Component(ICAL.parse(icsContent));
  const vevents = comp.getAllSubcomponents('vevent');
  const events = [];

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

  return events;
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

  const events = [];

  for (const icsContent of extractIcsPayloads(response.data)) {
    try {
      events.push(...icsToEvents(icsContent));
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
  // Exported for unit testing (pure XML/ICS helpers, no network).
  parsePrincipalUrl,
  parseCalendarHomeUrl,
  parseCalendars,
  extractIcsPayloads,
  icsToEvents,
};
