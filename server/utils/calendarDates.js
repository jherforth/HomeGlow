// Shared date handling for calendar sync.
//
// An all-day event is a *date*, not an instant: "NO PRACTICE on Sep 5" means
// Sep 5 wherever you are standing. The cache can only store instants, so every
// sync path anchors all-day events to UTC midnight of the calendar date the
// source named, and the client rebuilds them from that date. Anchoring them to
// the server's local midnight instead (what `ICAL.Time#toJSDate()` and
// node-ical do for date-only and floating values) bakes the server's timezone
// into the row, so a display in any other zone renders the event on the wrong
// day — a backend on America/New_York puts Sep 5 at 11:00 PM on Sep 4 for a
// display on America/Chicago.
//
// Feeds express a day two ways, and both must land on the same anchor:
//   DTSTART;VALUE=DATE:20260905                  (date-only)
//   DTSTART:20260905T000000 / DTEND:20260906T000000  (midnight to midnight)
// The second form is what SportsEngine-style team feeds emit.

const DAY_MS = 24 * 60 * 60 * 1000;

// UTC midnight from calendar parts. `month` is 1-based, as it appears in ICS.
function utcMidnight(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

// UTC midnight of the calendar date a Date lands on *in the current process's
// timezone*. For values that were already resolved against server-local time
// (node-ical's date-only handling), this recovers the intended calendar date.
function utcMidnightFromLocalDate(date) {
  const d = new Date(date);
  return utcMidnight(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ICS DTEND is exclusive; the cache stores the last day the event covers, which
// is what the widget's inclusive day math expects. Never returns a value before
// `start`, so a single-day event ends on the day it starts.
function inclusiveAllDayEnd(start, exclusiveEnd) {
  const end = new Date(exclusiveEnd.getTime() - DAY_MS);
  return end.getTime() < start.getTime() ? new Date(start.getTime()) : end;
}

module.exports = {
  DAY_MS,
  utcMidnight,
  utcMidnightFromLocalDate,
  inclusiveAllDayEnd,
};
