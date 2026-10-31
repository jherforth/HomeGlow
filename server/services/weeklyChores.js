// "Once a week, any day" chores (schedule duration 'weekly'): practise an
// instrument once a week, whichever day suits. The week runs Sunday to
// Saturday, as the admin board's calendar does.
//
// Like the other sticky schedules, the parent never shows itself: its visible
// one-time child is what appears and is completed. The child's due_date is
// the week's Saturday, and that is the only day it counts as due: it holds
// back the daily bonus on Saturday alone, and an undone week is logged as one
// miss, that Saturday. The next Sunday the old card goes and a fresh one
// comes, whether or not it was done.

// Only marks the week start; the days mean nothing for a weekly chore.
const WEEKLY_CRONTAB = '0 0 * * 0';

const STICKY_DURATIONS = ['until-completed', 'once-completed', 'weekly'];

const parseDay = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
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

// Whether a weekly chore's card counts as due on `dateStr`: on its last day
// only. A card without a date (made before this rule) counts every day, as
// any one-time chore does.
const weeklyChildDueOn = (child, dateStr) => !child.due_date || child.due_date === dateStr;

module.exports = {
  WEEKLY_CRONTAB,
  STICKY_DURATIONS,
  weekStartOf,
  weekEndOf,
  weeklyChildDueOn,
};
