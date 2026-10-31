// "Any day" chores (schedule duration 'any-day'): done once, on any day of a
// period, and fresh each period. Practise an instrument once a week; change
// the furnace filter once every 3 months. The period is the schedule's
// `interval`, one of PERIODS:
//   1w      Sunday to Saturday, as the admin board's calendar
//   2w      two weeks, counted from the week the schedule was made
//   1m      a calendar month
//   3m, 6m  calendar quarters (Jan-Mar, ...) and halves (Jan-Jun, Jul-Dec)
//   1y      a calendar year
//
// Like the other sticky schedules, the parent never shows itself: its visible
// one-time child is what appears and is completed. The child's due_date is
// the period's last day, and that is the only day it counts as due: it holds
// back the daily bonus on that day alone, and an undone period is logged as
// one miss, that day. When the next period starts, the old card goes and a
// fresh one comes, whether or not it was done.

const ANY_DAY = 'any-day';
const PERIODS = ['1w', '2w', '1m', '3m', '6m', '1y'];
const DEFAULT_PERIOD = '1w';
// The days mean nothing for an any-day chore; the server keeps this.
const ANY_DAY_CRONTAB = '0 0 * * *';

const STICKY_DURATIONS = ['until-completed', 'once-completed', ANY_DAY];

const parseDay = (dateStr) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const formatDay = (date) => date.toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const date = parseDay(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
};

// The Sunday and the Saturday of the week `dateStr` ('YYYY-MM-DD') is in.
const weekStartOf = (dateStr) => addDays(dateStr, -parseDay(dateStr).getUTCDay());
const weekEndOf = (dateStr) => addDays(weekStartOf(dateStr), 6);

const isPeriod = (interval) => PERIODS.includes(interval);

/**
 * The period `dateStr` falls in, as { start, end } ('YYYY-MM-DD', inclusive).
 * `anchor` is the day the schedule was made; only 2-week periods use it, so
 * they run from that week.
 */
function periodOf(dateStr, interval = DEFAULT_PERIOD, anchor = null) {
  const match = String(isPeriod(interval) ? interval : DEFAULT_PERIOD).match(/^(\d+)([wmy])$/);
  const count = Number(match[1]);
  const unit = match[2];
  if (unit === 'w') {
    const start = weekStartOf(dateStr);
    if (count === 1) return { start, end: addDays(start, 6) };
    const from = weekStartOf(anchor || dateStr);
    const weeks = Math.floor((parseDay(start) - parseDay(from)) / (7 * 86400000));
    const blockStart = addDays(from, (Math.floor(weeks / count) * count) * 7);
    return { start: blockStart, end: addDays(blockStart, count * 7 - 1) };
  }
  const months = unit === 'y' ? count * 12 : count;
  const date = parseDay(dateStr);
  const index = date.getUTCFullYear() * 12 + date.getUTCMonth();
  const first = Math.floor(index / months) * months;
  const start = new Date(Date.UTC(Math.floor(first / 12), first % 12, 1));
  const end = new Date(Date.UTC(Math.floor((first + months) / 12), (first + months) % 12, 0));
  return { start: formatDay(start), end: formatDay(end) };
}

// Whether an any-day chore's card counts as due on `dateStr`: on its last
// day only. A card without a date counts every day, as any one-time chore.
const anyDayChildDueOn = (child, dateStr) => !child.due_date || child.due_date === dateStr;

// What a request's duration and interval mean: 'weekly' (the name this had
// for a day) is an any-day chore once a week; an any-day chore without a
// period is weekly. Other durations pass through.
function normalizeAnyDay(duration, interval) {
  if (duration === 'weekly') return { duration: ANY_DAY, interval: DEFAULT_PERIOD };
  if (duration === ANY_DAY) return { duration, interval: interval || DEFAULT_PERIOD };
  return { duration, interval };
}

module.exports = {
  ANY_DAY,
  PERIODS,
  DEFAULT_PERIOD,
  ANY_DAY_CRONTAB,
  STICKY_DURATIONS,
  weekStartOf,
  weekEndOf,
  isPeriod,
  periodOf,
  anyDayChildDueOn,
  normalizeAnyDay,
};
