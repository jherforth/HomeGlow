// Reading an iCalendar (ICS) document into HomeGlow events.
//
// Shared by every source that speaks ICS: an iCloud CalDAV calendar, an iCloud
// subscription's upstream feed, and a generic CalDAV/authenticated-ICS URL. It
// is deliberately not Apple-specific — keeping one reader is what stops each
// source from growing its own subtly different notion of "all day" and its own
// answer to "does this series repeat?".

const ICAL = require('ical.js');
const { DAY_MS, utcMidnight, inclusiveAllDayEnd } = require('./calendarDates');


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


module.exports = {
  icsToEvents,
  // Exported for unit testing.
  isAllDaySpan,
};
