// Data shaping for the photo screensaver's corner overlay (issue #190).
//
// Kept free of React and of the network so the rules that decide what appears
// on the wall — which day an event belongs to, how much fits, whose weather to
// show — can be tested without a renderer.

export const MIN_AGENDA_DAYS = 1;
export const MAX_AGENDA_DAYS = 7;

// The overlay sits over someone's photo. Past this many lines the corner stops
// being a corner, so the rest is summarised as "+N more". Counted in lines, day
// headings included: a week with one event a day is fourteen lines, not seven,
// and budgeting only the events let it climb past half the screen.
export const DEFAULT_MAX_AGENDA_LINES = 10;

export const clampAgendaDays = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MIN_AGENDA_DAYS;
  return Math.min(MAX_AGENDA_DAYS, Math.max(MIN_AGENDA_DAYS, n));
};

const keyFormatterCache = new Map();

/**
 * YYYY-MM-DD for `date` as seen in `timeZone`. Undefined means the browser's
 * own zone, which is the convention the calendar widget uses when it groups
 * events into days — the overlay has to agree with the calendar on the same
 * screen, or an 11pm event would sit under different days in each.
 */
export function localDateKey(date, timeZone) {
  const cacheKey = timeZone || '';
  let formatter = keyFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    keyFormatterCache.set(cacheKey, formatter);
  }
  return formatter.format(date);
}

/** Shift a YYYY-MM-DD key by whole days, with no timezone in play. */
export function addDaysToKey(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * The day keys an event occupies, oldest first.
 *
 * Treats the end as exclusive, which is what ICS and Google both mean: a
 * single-day all-day event runs to the next midnight, and counting that
 * midnight as a day would list it twice. An end at or before the start — real
 * feeds contain these — is treated as a single day rather than looped or
 * dropped.
 */
export function eventDayKeys(event, timeZone) {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return [];

  const end = event.end ? new Date(event.end) : start;
  const lastInstant = !Number.isNaN(end.getTime()) && end.getTime() > start.getTime()
    ? new Date(end.getTime() - 1)
    : start;

  const first = localDateKey(start, timeZone);
  const last = localDateKey(lastInstant, timeZone);

  const keys = [];
  let cursor = first;
  // Bounded: a malformed year-long event must not render a thousand rows.
  for (let i = 0; cursor <= last && i < 400; i += 1) {
    keys.push(cursor);
    cursor = addDaysToKey(cursor, 1);
  }
  return keys;
}

/**
 * Group events into consecutive days starting at `todayKey`.
 *
 * Returns `[{ date, events: [{ ...event, continued }] }]` for every day in the
 * window, including empty ones so the caller can decide what an empty day
 * looks like. `continued` marks a timed event carried over from an earlier day,
 * which has no meaningful start time on this one.
 */
export function buildAgenda(events, { todayKey, days, timeZone } = {}) {
  const count = clampAgendaDays(days);
  const window = Array.from({ length: count }, (_, i) => addDaysToKey(todayKey, i));
  const byDay = new Map(window.map((key) => [key, []]));

  (Array.isArray(events) ? events : []).forEach((event) => {
    const keys = eventDayKeys(event, timeZone);
    keys.forEach((key, index) => {
      if (!byDay.has(key)) return;
      byDay.get(key).push({ ...event, continued: index > 0 && !event.all_day });
    });
  });

  return window.map((date) => ({
    date,
    events: byDay.get(date).sort((a, b) => {
      // All-day first, then carried-over, then by start, then by title so the
      // order is stable between refreshes.
      if (!!a.all_day !== !!b.all_day) return a.all_day ? -1 : 1;
      if (a.continued !== b.continued) return a.continued ? -1 : 1;
      const at = new Date(a.start).getTime();
      const bt = new Date(b.start).getTime();
      if (at !== bt) return at - bt;
      return String(a.title || '').localeCompare(String(b.title || ''));
    }),
  }));
}

/**
 * Cut an agenda down to at most `maxLines` lines, each day's heading included.
 *
 * Days are kept in order and filled until the budget runs out; everything not
 * shown is counted in `hidden`, including whole days past the cut. A day is only
 * started if its heading and at least one event fit — a heading with nothing
 * under it would read as a free day. Empty days are dropped once a longer window
 * is chosen — "nothing on Thursday" is noise on a wall — but a single-day window
 * keeps its day so the caller can say the day is free.
 */
export function limitAgenda(agenda, maxLines = DEFAULT_MAX_AGENDA_LINES) {
  const keepEmpty = agenda.length === 1;
  const shown = [];
  let budget = Math.max(0, maxLines);
  let hidden = 0;

  agenda.forEach((day) => {
    if (!day.events.length) {
      if (keepEmpty) shown.push({ date: day.date, events: [] });
      return;
    }
    if (budget < 2) {
      hidden += day.events.length;
      return;
    }
    budget -= 1; // the heading
    const take = day.events.slice(0, budget);
    hidden += day.events.length - take.length;
    budget -= take.length;
    shown.push({ date: day.date, events: take });
  });

  return { days: shown, hidden };
}

const isValidCoordinates = (candidate) => (
  candidate
  && Number.isFinite(candidate.lat) && Math.abs(candidate.lat) <= 90
  && Number.isFinite(candidate.lon) && Math.abs(candidate.lon) <= 180
);

// A tab's config_json arrives as a string, an object, or nothing. The weather
// and calendar widgets each carry a private copy of this; it is exported here so
// they can share one.
export const parseTabConfigJson = (configJson) => {
  if (!configJson) return {};
  if (typeof configJson === 'object' && !Array.isArray(configJson)) return configJson;
  if (typeof configJson !== 'string') return {};
  try {
    const parsed = JSON.parse(configJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Which weather the overlay should show: the location and units a weather
 * widget on this display is already configured with, so the two never
 * disagree. Tabs are searched in order and the first configured one wins.
 *
 * Returns null when no tab has a weather widget configured. The caller then
 * asks the server with no location, which Home Assistant and the demo provider
 * answer from their own configuration; OpenWeatherMap cannot, and the overlay
 * simply leaves the weather out rather than guessing a place.
 *
 * Reads the same fields the weather widget writes (issue #57's per-tab
 * settings): `locationQuery` (or the older `zipCode`), `tempUnit`, and optional
 * saved coordinates that skip the geocoding round trip.
 */
export function pickWeatherSettings(tabs) {
  const ordered = (Array.isArray(tabs) ? tabs : [])
    .slice()
    .sort((a, b) => Number(a?.number ?? 0) - Number(b?.number ?? 0));

  for (const tab of ordered) {
    const entry = parseTabConfigJson(tab?.config_json).weather;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

    const locationQuery = String(entry.locationQuery || entry.zipCode || '').trim();
    const coordinates = isValidCoordinates(entry) ? { lat: entry.lat, lon: entry.lon } : null;
    if (!locationQuery && !coordinates) continue;

    return {
      locationQuery,
      coordinates,
      tempUnit: String(entry.tempUnit || '').toUpperCase() === 'C' ? 'C' : 'F',
    };
  }
  return null;
}

/** Query params for GET /api/weather, mirroring what the weather widget sends. */
export function weatherRequestParams(settings, language = 'en') {
  const params = {
    units: settings?.tempUnit === 'C' ? 'metric' : 'imperial',
    lang: String(language || 'en').split('-')[0],
  };
  if (settings?.coordinates) {
    params.lat = settings.coordinates.lat;
    params.lon = settings.coordinates.lon;
  } else if (settings?.locationQuery) {
    params.location = settings.locationQuery;
  }
  return params;
}
