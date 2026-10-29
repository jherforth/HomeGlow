// What an uploaded photo's camera recorded about it, for the screensaver's
// photo details (utils/photoDetails.js): the day it was taken and where.
// Read at upload, and once at startup for every photo uploaded before the
// server read them (readPendingPhotoDetails).

const path = require('path');
const exifr = require('exifr');

// 'YYYY:MM:DD HH:MM:SS', the camera's own clock with no zone: its date is the
// day the photo was taken wherever that was, as Immich's localDateTime is.
const EXIF_DATE = /^(\d{4})[:-](\d{2})[:-](\d{2})/;

function dateKeyFromExif(value) {
  const match = EXIF_DATE.exec(typeof value === 'string' ? value.trim() : '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (year < 1900 || year > new Date().getFullYear() + 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const key = `${match[1]}-${match[2]}-${match[3]}`;
  // A camera whose clock was never set reads 0000:00:00 or the first day of 1970.
  return key === '1970-01-01' ? null : key;
}

/**
 * { takenOn, latitude, longitude } from a photo's EXIF, each null when the
 * photo doesn't carry it. `input` is a Buffer or a file path; exifr reads only
 * the start of a file. Never throws: a photo it can't read has no details.
 */
async function readPhotoDetails(input) {
  const details = { takenOn: null, latitude: null, longitude: null };
  try {
    const dates = await exifr.parse(input, { pick: ['DateTimeOriginal', 'CreateDate'], reviveValues: false });
    details.takenOn = dateKeyFromExif(dates?.DateTimeOriginal) || dateKeyFromExif(dates?.CreateDate);
  } catch {
    // No EXIF, or none exifr can read.
  }
  try {
    const gps = await exifr.gps(input);
    const { latitude, longitude } = gps || {};
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      && !(latitude === 0 && longitude === 0)) {
      details.latitude = latitude;
      details.longitude = longitude;
    }
  } catch {
    // No GPS.
  }
  return details;
}

const scan = { running: false };

/** True while the startup read of earlier photos is under way. */
const isReadingPhotoDetails = () => scan.running;

/**
 * Reads the details of every uploaded photo not read yet, one at a time, and
 * stores them. A photo that can't be read is marked read too, so it is never
 * retried in a loop. Returns how many were read.
 */
async function readPendingPhotoDetails(db, uploadsDir) {
  if (scan.running) return 0;
  scan.running = true;
  let read = 0;
  try {
    const pending = db.prepare(
      'SELECT id, source_id, filename FROM homeglow_photos WHERE details_read_at IS NULL ORDER BY id'
    ).all();
    const save = db.prepare(
      "UPDATE homeglow_photos SET taken_on = ?, latitude = ?, longitude = ?, details_read_at = datetime('now') WHERE id = ?"
    );
    for (const row of pending) {
      const file = path.join(uploadsDir, String(row.source_id), path.basename(row.filename));
      const details = await readPhotoDetails(file);
      save.run(details.takenOn, details.latitude, details.longitude, row.id);
      read += 1;
    }
  } finally {
    scan.running = false;
  }
  return read;
}

module.exports = { readPhotoDetails, readPendingPhotoDetails, isReadingPhotoDetails, dateKeyFromExif };
