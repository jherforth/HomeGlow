// The app's single seam for turning dates into text (issue #137).
//
// Every user-visible date or time string goes through here, so switching
// language re-formats the whole UI from one place, and replacing the date
// library later (moment is in maintenance mode — see #120) touches this file
// and the date-math call sites, but never the display call sites again.
//
// Display formatting uses the platform's Intl.DateTimeFormat rather than the
// date library's own locale support. Three reasons: no locale bundles to ship
// or lazy-load, every language the browser knows works immediately, and it
// sidesteps a real bug — Vite pre-bundles `moment` as an optimized dependency,
// so `import('moment/locale/es')` registers the locale on a *different* module
// instance than the one doing the formatting, and the UI silently stays in
// English.
//
// Two rules:
//   1. Display formatting belongs here. Machine formatting does not.
//   2. Never localize a machine format. `YYYY-MM-DD` strings are used as map
//      keys, API parameters, and date-matching identifiers throughout the
//      calendar; localizing them silently breaks event lookup.
import moment from 'moment';

let activeLocale = 'en';

/** Called by the i18n layer whenever the language changes. */
export function setDateLocale(language) {
  activeLocale = (language || 'en').split('-')[0];
  // Kept in sync so any remaining moment-based relative formatting agrees with
  // the display locale. Unknown locales fall back to English inside moment.
  moment.locale(activeLocale);
}

export const getDateLocale = () => activeLocale;

// Accepts a Date, an ISO string, or a moment object.
const toDate = (value) => {
  if (value == null) return new Date(NaN);
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

// Formatters are cached per locale+options: constructing Intl.DateTimeFormat is
// comparatively expensive and the calendar formats hundreds of cells per render.
const formatterCache = new Map();
const formatWith = (options, value) => {
  const key = `${activeLocale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(activeLocale, options);
    } catch {
      formatter = new Intl.DateTimeFormat('en', options);
    }
    formatterCache.set(key, formatter);
  }
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '' : formatter.format(date);
};

// --- Display formats (localized) ------------------------------------------
// Names describe intent, not pattern, so a locale that arranges things
// differently is served by Intl rather than by a hand-written pattern.

/** "3:30 PM", or "15:30" where that is the convention. */
export const formatTime = (value) => formatWith({ hour: 'numeric', minute: '2-digit' }, value);

/** "Aug 13" — short date without year, for dense views. */
export const formatShortDate = (value) => formatWith({ month: 'short', day: 'numeric' }, value);

/** "Aug 13, 2026" — short date with year. */
export const formatShortDateWithYear = (value) =>
  formatWith({ year: 'numeric', month: 'short', day: 'numeric' }, value);

/** "Aug 13, 3:30 PM" — short date and time together. */
export const formatShortDateTime = (value) =>
  formatWith({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }, value);

/** "Thursday, August 13, 2026" — the full, spelled-out date. */
export const formatFullDate = (value) =>
  formatWith({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }, value);

/** "August 2026" — month and year, for calendar headers. */
export const formatMonthYear = (value) => formatWith({ year: 'numeric', month: 'long' }, value);

/** "Thu" — abbreviated weekday. */
export const formatWeekdayShort = (value) => formatWith({ weekday: 'short' }, value);

/** "Aug" — abbreviated month. */
export const formatMonthShort = (value) => formatWith({ month: 'short' }, value);

/** "13" — day of month, numerals only. */
export const formatDayOfMonth = (value) => formatWith({ day: 'numeric' }, value);

// A known week (2024-01-07 was a Sunday) used to enumerate weekday names
// without depending on today's date.
const REFERENCE_SUNDAY = new Date(2024, 0, 7);
const weekdayNames = (options) =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date(REFERENCE_SUNDAY);
    date.setDate(REFERENCE_SUNDAY.getDate() + index);
    return formatWith(options, date);
  });

/** Localized abbreviated weekday names, ordered from the given week start. */
export const getWeekdayLabels = (weekStartsOn = 0) => {
  const names = weekdayNames({ weekday: 'short' });
  const offset = ((weekStartsOn % 7) + 7) % 7;
  return [...names.slice(offset), ...names.slice(0, offset)];
};

/** Localized full weekday names paired with their stable English values. */
export const getWeekdayOptions = () => {
  const values = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const names = weekdayNames({ weekday: 'long' });
  return values.map((value, index) => ({ value, label: names[index] }));
};

// --- Machine formats (never localized) ------------------------------------
// Deliberately not routed through the locale: these are identifiers.

/** "2026-08-13" — the canonical date key used across the app and API. */
export const toDateKey = (value) => moment(value).format('YYYY-MM-DD');

/** "2026-08-13T15:30" — datetime-local input value. */
export const toDateTimeInputValue = (value) => moment(value).format('YYYY-MM-DDTHH:mm');

/** "2026-08" — month key used for cache invalidation. */
export const toMonthKey = (value) => moment(value).format('YYYY-MM');
