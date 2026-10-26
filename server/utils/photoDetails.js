// What a photo carries about itself, for the screensaver's photo details:
// when it was taken, who is in it and where. Each source tells a different
// amount, and a field the source doesn't know is left out, never guessed.
//
//   Immich         takenOn, people (the faces it named), place (from GPS)
//   Google Photos  takenOn only: the Picker API shares no people or places
//   Uploads        nothing: the browser resizes them first, which drops the
//                  camera's data

const DATE_KEY = /^(\d{4}-\d{2}-\d{2})/;

/** 'YYYY-MM-DD' for an instant, in the server's zone (the household's). */
function takenOnFromInstant(value) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * { takenOn?, people?, place? } from an Immich asset fetched with withExif
 * and withPeople. `localDateTime` is the camera's own clock, so its date is
 * the day the photo was taken wherever that was, with no zone to shift it.
 */
function immichPhotoDetails(asset) {
  const exif = asset?.exifInfo || {};
  const details = {};

  const takenOn = DATE_KEY.exec(clean(asset?.localDateTime))?.[1]
    || takenOnFromInstant(exif.dateTimeOriginal);
  if (takenOn) details.takenOn = takenOn;

  const people = [];
  for (const person of Array.isArray(asset?.people) ? asset.people : []) {
    const name = clean(person?.name);
    if (name && !person.isHidden && !people.includes(name)) people.push(name);
  }
  if (people.length) details.people = people;

  // "City, State" in the US, "City, Country" elsewhere, whichever it has.
  const city = clean(exif.city);
  const region = clean(exif.state) || clean(exif.country);
  const place = [city, region].filter(Boolean).filter((part, i, all) => all.indexOf(part) === i).join(', ');
  if (place) details.place = place;

  return details;
}

module.exports = { immichPhotoDetails, takenOnFromInstant };
