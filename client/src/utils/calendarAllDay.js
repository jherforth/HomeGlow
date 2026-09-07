/**
 * All-day events arrive from Google/ICS/CalDAV as a date with no timezone
 * ("2026-09-11"). The sync stores them through Date#toISOString, which stamps
 * that floating date as UTC midnight, and the API serves it as
 * "2026-09-11T00:00:00.000Z".
 *
 * Reading that back as an instant and rendering it in local time puts the
 * event on the PREVIOUS day for any viewer west of UTC — a Friday "No School"
 * shows on Thursday in America/Los_Angeles.
 *
 * The `all_day` flag is the only surviving record of the original intent, so
 * use it: take the UTC date part, which is the real datum, and reinterpret it
 * as a local date. Every downstream local-day comparison then lands on the
 * correct day, in any viewer timezone.
 *
 * This is a read-side correction. Storage still asserts a timezone the source
 * date never had.
 */
export function allDayInstantToLocalDate(value) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return instant;
  return new Date(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
}

/**
 * Start/end for one event: all-day dates reinterpreted as local dates, timed
 * events untouched (they carry a real instant and must convert normally).
 */
export function eventDates(event) {
  const toDate = event && event.all_day ? allDayInstantToLocalDate : (v) => new Date(v);
  return { start: toDate(event.start), end: toDate(event.end) };
}
