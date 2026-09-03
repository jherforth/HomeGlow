import moment from 'moment';

// All-day events are cached as UTC midnight of the calendar date they belong to:
// "no practice on Sep 5" is a date, not an instant, so the backend deliberately
// strips the source timezone rather than resolving it against its own (see
// server/utils/calendarDates.js).
//
// Read that date back out of UTC and rebuild it as local midnight, so it stays
// on Sep 5 on every display. Handing the stored instant straight to `new Date`
// renders it in the browser's zone and slides the event onto the previous day
// anywhere west of UTC — which is how an all-day marker ends up showing as
// "11:00 PM" on the day before.
export const parseCalendarDate = (value, allDay) => {
  if (!allDay) return new Date(value);
  const utc = moment.utc(value);
  if (!utc.isValid()) return new Date(value);
  return moment([utc.year(), utc.month(), utc.date()]).toDate();
};

export default parseCalendarDate;
