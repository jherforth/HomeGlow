// The app's single seam for turning dates into text (issue #137).
//
// Every user-visible date or time string goes through here, so switching
// language re-formats the whole UI from one place, and swapping the underlying
// date engine later (moment is in maintenance mode — see #120) touches this
// file and the date-math call sites, but never the display call sites again.
//
// Two rules:
//   1. Display formatting belongs here. Machine formatting does not.
//   2. Never localize a machine format. `YYYY-MM-DD` strings are used as map
//      keys, API parameters, and date-matching identifiers throughout the
//      calendar; localizing them silently breaks event lookup.
import moment from 'moment';

// Locales are loaded on demand so a household running English never pays for
// the others. Keep in sync with the locales shipped under src/i18n/locales.
const LOCALE_LOADERS = {
  en: null, // built into moment
  es: () => import('moment/locale/es'),
};

let activeLocale = 'en';

// Called by the i18n layer whenever the language changes.
export async function setDateLocale(language) {
  const base = (language || 'en').split('-')[0];
  const loader = LOCALE_LOADERS[base];
  if (loader === undefined) {
    // Unknown language: keep dates in English rather than crashing.
    moment.locale('en');
    activeLocale = 'en';
    return;
  }
  if (loader) {
    try {
      await loader();
    } catch (error) {
      console.warn(`Could not load date locale "${base}", falling back to English:`, error);
      moment.locale('en');
      activeLocale = 'en';
      return;
    }
  }
  moment.locale(base);
  activeLocale = base;
}

export const getDateLocale = () => activeLocale;

// --- Display formats (localized) ------------------------------------------
// Names describe intent, not pattern, so a locale that wants a different
// arrangement can be served by changing the pattern in one place.

/** "3:30 PM" — a time of day. */
export const formatTime = (value) => moment(value).format('LT');

/** "Aug 13" — short date without year, for dense views. */
export const formatShortDate = (value) => moment(value).format('MMM D');

/** "Aug 13, 2026" — short date with year. */
export const formatShortDateWithYear = (value) => moment(value).format('ll');

/** "Aug 13, 3:30 PM" — short date and time together. */
export const formatShortDateTime = (value) => moment(value).format('lll');

/** "Thursday, August 13, 2026" — the full, spelled-out date. */
export const formatFullDate = (value) => moment(value).format('LLLL').replace(/\s+\d{1,2}:\d{2}.*$/, '');

/** "August 2026" — month and year, for calendar headers. */
export const formatMonthYear = (value) => moment(value).format('MMMM YYYY');

/** "Thu" — abbreviated weekday. */
export const formatWeekdayShort = (value) => moment(value).format('ddd');

/** "Aug" — abbreviated month. */
export const formatMonthShort = (value) => moment(value).format('MMM');

/** "13" — day of month, numerals only. */
export const formatDayOfMonth = (value) => moment(value).format('D');

/** Localized abbreviated weekday names, ordered from the given week start. */
export const getWeekdayLabels = (weekStartsOn = 0) => {
  const names = moment.weekdaysShort();
  return [...names.slice(weekStartsOn), ...names.slice(0, weekStartsOn)];
};

/** Localized full weekday names paired with their stable English values. */
export const getWeekdayOptions = () => {
  const english = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return english.map((value, index) => ({ value, label: moment.weekdays()[index] }));
};

// --- Machine formats (never localized) ------------------------------------
// Deliberately not routed through the locale: these are identifiers.

/** "2026-08-13" — the canonical date key used across the app and API. */
export const toDateKey = (value) => moment(value).format('YYYY-MM-DD');

/** "2026-08-13T15:30" — datetime-local input value. */
export const toDateTimeInputValue = (value) => moment(value).format('YYYY-MM-DDTHH:mm');

/** "2026-08" — month key used for cache invalidation. */
export const toMonthKey = (value) => moment(value).format('YYYY-MM');
