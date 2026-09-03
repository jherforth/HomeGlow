const axios = require('axios');
const ICAL = require('ical.js');
const { XMLParser } = require('fast-xml-parser');
const { DAY_MS, utcMidnight, inclusiveAllDayEnd } = require('../utils/calendarDates');

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

// ---------------------------------------------------------------------------
// Outbound CalDAV request bodies
//
// Every request body lives here so the wire format is in one place instead of
// being scattered through the request functions. JavaScript has no `static final`,
// so this is a frozen class with static fields — the closest equivalent: the
// values cannot be reassigned, and strings are immutable already.
//
// CALENDAR_QUERY is the one exception to "static string": a calendar-query REPORT
// must carry a concrete time-range, so it is a builder.
// ---------------------------------------------------------------------------
class ICLOUD_XML_MESSAGE {
  // PROPFIND Depth:0 against the service root -> current-user-principal href.
  static CURRENT_USER_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
  </d:prop>
</d:propfind>`;

  // PROPFIND Depth:0 against the principal -> calendar-home-set href.
  static CALENDAR_HOME_SET = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set />
  </d:prop>
</d:propfind>`;

  // PROPFIND Depth:1 against the calendar home -> one entry per collection.
  // cs:source is required: it is the only way a subscription's upstream feed URL
  // becomes discoverable. Without it, subscriptions look like empty calendars.
  static CALENDAR_LIST = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
    <ical:calendar-color />
    <cs:getctag />
    <cs:source />
    <c:supported-calendar-component-set />
  </d:prop>
</d:propfind>`;

  // PROPFIND Depth:0 against a single collection -> is it a subscription, and
  // where does its feed live? Kept minimal so the probe stays cheap.
  static COLLECTION_SOURCE = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:resourcetype />
    <cs:source />
  </d:prop>
</d:propfind>`;

  // REPORT against a calendar collection -> etag + ICS payload per event that
  // overlaps the window. Both bounds are UTC basic-format (YYYYMMDDTHHMMSSZ).
  static CALENDAR_QUERY(startUtc, endUtc) {
    return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startUtc}" end="${endUtc}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  }
}

Object.freeze(ICLOUD_XML_MESSAGE);

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

// iCloud records a subscription's upstream feed as webcal:// (occasionally
// webcals://). Those are ordinary http(s) URLs wearing a different scheme, which
// axios will not fetch, so rewrite them. Anything that is still not http(s)
// afterwards is rejected, so a hostile or malformed <cs:source> cannot talk us
// into fetching file:// or similar.
function normalizeFeedUrl(url) {
  const value = (url || '').trim();
  if (!value) return null;
  const rewritten = value.replace(/^webcals?:\/\//i, 'https://');
  return /^https?:\/\//i.test(rewritten) ? rewritten : null;
}

// Pull the <cs:source><d:href> feed URL out of a <response>, normalized.
function extractSourceHref(response) {
  const sourceProp = findProp(response, 'source');
  if (!sourceProp) return null;
  const href = asArray(sourceProp.href)[0];
  return normalizeFeedUrl(nodeText(href) ?? nodeText(sourceProp));
}

// True when a parsed resourcetype carries <cs:subscribed/>.
function isSubscribedResourceType(resourcetype) {
  return !!resourcetype && typeof resourcetype === 'object' && 'subscribed' in resourcetype;
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
    calendars.push({
      id: calUrl,
      name,
      color: color || '#3d7ab5',
      url: calUrl,
      // Subscriptions hold no event resources of their own; sourceUrl is where
      // their events actually live. See fetchCalendarEvents.
      subscribed: isSubscribedResourceType(resourcetype),
      sourceUrl: extractSourceHref(response),
    });
  }

  return calendars;
}

// Read subscription details out of a Depth:0 PROPFIND body for one collection.
function parseCollectionSource(xmlBody) {
  for (const response of parseMultistatusResponses(xmlBody)) {
    const subscribed = isSubscribedResourceType(findProp(response, 'resourcetype'));
    const sourceUrl = extractSourceHref(response);
    if (subscribed || sourceUrl) return { subscribed, sourceUrl };
  }
  return { subscribed: false, sourceUrl: null };
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
    data: ICLOUD_XML_MESSAGE.CURRENT_USER_PRINCIPAL,
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
    data: ICLOUD_XML_MESSAGE.CALENDAR_HOME_SET,
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
    data: ICLOUD_XML_MESSAGE.CALENDAR_LIST,
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

// ---------------------------------------------------------------------------
// ICS -> HomeGlow events
// ---------------------------------------------------------------------------

// How far either side of now a series is expanded, matching the window the
// CalDAV REPORT and the Google sync already use. A subscribed feed arrives
// unfiltered, so this is also what keeps an open-ended RRULE bounded.
const WINDOW_MS = 13 * 30 * 24 * 60 * 60 * 1000;

// Hard stop on a single series, so a malformed or very old daily rule can never
// spin. 10k covers ~27 years of daily occurrences.
const MAX_OCCURRENCES_PER_SERIES = 10000;

// True when a start/end pair describes whole calendar days rather than an
// instant: either a date-only value, or midnight to midnight in the value's own
// frame. An overnight 00:00-00:00 shift is indistinguishable from a one-day
// all-day event in iCalendar, and is treated as all-day.
function isAllDaySpan(start, end) {
  if (!start) return false;
  if (start.isDate) return true;
  if (!end) return false;

  const atMidnight = (t) => t.hour === 0 && t.minute === 0 && t.second === 0;
  if (!atMidnight(start) || !atMidnight(end)) return false;

  return end.compare(start) > 0;
}

// Resolve an occurrence's ICAL.Time pair into the instants stored in the cache.
// All-day spans keep their wall-clock date and are anchored to UTC midnight (see
// utils/calendarDates); timed values carry a TZID or Z and convert exactly.
function resolveEventTimes(start, end) {
  if (!isAllDaySpan(start, end)) {
    return { start: start.toJSDate(), end: end.toJSDate(), allDay: false };
  }

  const startDate = utcMidnight(start.year, start.month, start.day);
  const exclusiveEnd = end
    ? utcMidnight(end.year, end.month, end.day)
    : new Date(startDate.getTime() + DAY_MS);

  return { start: startDate, end: inclusiveAllDayEnd(startDate, exclusiveEnd), allDay: true };
}

function buildEvent(source, times, fallbackUid, extras = {}) {
  return {
    uid: source.uid || fallbackUid,
    title: source.summary || 'Untitled Event',
    start: times.start,
    end: times.end,
    description: source.description || null,
    location: source.location || null,
    all_day: times.allDay,
    raw: {},
    ...extras,
  };
}

function overlapsWindow(times, from, to) {
  return times.end >= from && times.start <= to;
}

// Expand one series into its occurrences inside [from, to].
//
// ICAL's iterator walks forward from DTSTART and already skips EXDATEs, and
// getOccurrenceDetails applies any RECURRENCE-ID override related to the master
// — so a moved or retitled instance reports its own time and summary rather than
// the master's.
function expandSeries(event, from, to) {
  const out = [];
  const iterator = event.iterator();
  let seen = 0;

  for (let next = iterator.next(); next; next = iterator.next()) {
    if (++seen > MAX_OCCURRENCES_PER_SERIES) break;

    let details;
    try {
      details = event.getOccurrenceDetails(next);
    } catch {
      continue;
    }

    const times = resolveEventTimes(details.startDate, details.endDate);

    // Occurrences are generated in order, so once one starts past the window
    // every later one does too.
    if (times.start > to) break;
    if (!overlapsWindow(times, from, to)) continue;

    const recurrenceId = details.recurrenceId?.toString() ?? String(times.start.getTime());
    out.push(buildEvent(details.item ?? event, times, `apple-${recurrenceId}`, {
      // The cache is keyed on (source, uid): every occurrence needs its own.
      uid: `${event.uid || 'apple'}-${recurrenceId}`,
    }));
  }

  return out;
}

// Convert a parsed ICS payload into HomeGlow event objects.
//
// A recurring series arrives as one master VEVENT plus a RECURRENCE-ID VEVENT
// per modified instance; reading DTSTART off each VEVENT would show the series
// once, at its original start (a weekly practice from last August appearing
// only last August, and a yearly birthday stuck in 2022). So masters are
// expanded, and overrides are attached to their master first.
function icsToEvents(icsContent, { from, to } = {}) {
  const comp = new ICAL.Component(ICAL.parse(icsContent));
  const vevents = comp.getAllSubcomponents('vevent');

  const now = Date.now();
  const windowStart = from ?? new Date(now - WINDOW_MS);
  const windowEnd = to ?? new Date(now + WINDOW_MS);

  const masters = [];
  const overrides = new Map();

  for (const vevent of vevents) {
    let event;
    try {
      event = new ICAL.Event(vevent);
    } catch {
      continue; // A malformed VEVENT must not sink the rest of the payload.
    }

    if (event.isRecurrenceException()) {
      const uid = event.uid || '';
      if (!overrides.has(uid)) overrides.set(uid, []);
      overrides.get(uid).push({ vevent, event });
    } else {
      masters.push(event);
    }
  }

  const events = [];
  const claimedOverrides = new Set();

  for (const event of masters) {
    for (const override of overrides.get(event.uid) ?? []) {
      claimedOverrides.add(override);
      try {
        event.relateException(override.vevent);
      } catch {
        // An override ICAL refuses to relate (mismatched UID/range) is emitted
        // standalone below rather than lost.
        claimedOverrides.delete(override);
      }
    }

    // A VEVENT missing DTSTART throws when its times are read; one bad event in
    // a feed must not cost us the rest of the calendar.
    try {
      if (event.isRecurring()) {
        events.push(...expandSeries(event, windowStart, windowEnd));
        continue;
      }

      const times = resolveEventTimes(event.startDate, event.endDate);
      if (!overlapsWindow(times, windowStart, windowEnd)) continue;
      events.push(buildEvent(event, times, `apple-${Date.now()}-${Math.random()}`));
    } catch {
      continue;
    }
  }

  // Overrides with no master in this payload (or that ICAL would not relate)
  // are still real events.
  for (const [, list] of overrides) {
    for (const override of list) {
      if (claimedOverrides.has(override)) continue;
      try {
        const times = resolveEventTimes(override.event.startDate, override.event.endDate);
        if (!overlapsWindow(times, windowStart, windowEnd)) continue;
        events.push(buildEvent(override.event, times, `apple-${Date.now()}-${Math.random()}`, {
          uid: `${override.event.uid || 'apple'}-${times.start.getTime()}`,
        }));
      } catch {
        continue;
      }
    }
  }

  return events;
}

// Ask iCloud whether a collection is a subscription, and if so where its events
// really live. Depth:0 so it stays a cheap single-resource lookup.
async function describeCollection(calendarUrl, appleId, appPassword) {
  const response = await axios({
    method: 'PROPFIND',
    url: calendarUrl,
    headers: {
      'Authorization': buildAuthHeader(appleId, appPassword),
      'Depth': '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    data: ICLOUD_XML_MESSAGE.COLLECTION_SOURCE,
    timeout: 15000,
    validateStatus: (s) => s < 500,
  });

  if (response.status !== 207 && response.status !== 200) {
    return { subscribed: false, sourceUrl: null };
  }

  return parseCollectionSource(response.data);
}

// Fetch a subscribed calendar's events straight from its upstream ICS feed.
// Deliberately unauthenticated: the feed is hosted by a third party (TeamSnap,
// leagues, school districts), so the iCloud app password must never be sent there.
async function fetchSubscriptionEvents(feedUrl) {
  const response = await axios.get(feedUrl, {
    timeout: 30000,
    responseType: 'text',
    // Keep the body a raw string; ICAL.parse needs the original text.
    transformResponse: [(data) => data],
    maxRedirects: 5,
    validateStatus: (s) => s < 500,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch subscribed calendar feed (HTTP ${response.status}).`);
  }

  return icsToEvents(response.data);
}

// Fetch events from a specific calendar URL using CalDAV REPORT
async function fetchCalendarEvents(calendarUrl, appleId, appPassword) {
  // An iCloud subscription (a webcal feed added to iCloud) is a pointer, not a
  // container: its resourcetype is <cs:subscribed/> and the events live at the
  // <cs:source> URL. A calendar-query REPORT against one succeeds but returns an
  // empty multistatus, which surfaced as "synced 0 events" with no error. Detect
  // that case and read the upstream feed instead.
  let subscription = { subscribed: false, sourceUrl: null };
  try {
    subscription = await describeCollection(calendarUrl, appleId, appPassword);
  } catch (err) {
    // Never let the probe break a calendar that the REPORT path already handled.
    console.warn('Subscription probe failed; falling back to CalDAV REPORT:', err.message);
  }

  if (subscription.subscribed) {
    if (!subscription.sourceUrl) {
      throw new Error('Subscribed iCloud calendar exposes no usable source feed URL.');
    }
    return fetchSubscriptionEvents(subscription.sourceUrl);
  }

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
    data: ICLOUD_XML_MESSAGE.CALENDAR_QUERY(formatDate(timeMin), formatDate(timeMax)),
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

module.exports = {
  discoverAndListCalendars,
  fetchCalendarEvents,
  // Exported for unit testing (pure XML/ICS helpers, no network).
  ICLOUD_XML_MESSAGE,
  parsePrincipalUrl,
  parseCalendarHomeUrl,
  parseCalendars,
  parseCollectionSource,
  normalizeFeedUrl,
  extractIcsPayloads,
  icsToEvents,
  isAllDaySpan,
};
