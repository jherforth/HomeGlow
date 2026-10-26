import { fromDateKey, getDateLocale } from './dateUtils.js';

// The lines of a photo's details, for the screensaver: when it was taken, who
// is in it and where, in that order, leaving out whatever the photo doesn't
// carry (server/utils/photoDetails.js says which sources carry what).

export const MAX_NAMED_PEOPLE = 3;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const formatDate = (key, locale) => {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, options).format(fromDateKey(key));
  } catch {
    return new Intl.DateTimeFormat('en', options).format(fromDateKey(key));
  }
};

const formatList = (items, locale) => {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
};

/**
 * ['June 14, 2019', 'Emma, Liam, and Noah', 'South Lake Tahoe, California'],
 * or fewer. `more(count)` words the people past the first three.
 */
export function photoDetailLines(photo, { locale = getDateLocale(), more = (count) => `${count} more` } = {}) {
  const lines = [];
  if (DATE_KEY.test(photo?.takenOn || '')) lines.push(formatDate(photo.takenOn, locale));

  const people = (Array.isArray(photo?.people) ? photo.people : [])
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => name.trim());
  if (people.length) {
    const named = people.length > MAX_NAMED_PEOPLE
      ? [...people.slice(0, MAX_NAMED_PEOPLE), more(people.length - MAX_NAMED_PEOPLE)]
      : people;
    lines.push(formatList(named, locale));
  }

  if (typeof photo?.place === 'string' && photo.place.trim()) lines.push(photo.place.trim());
  return lines;
}
