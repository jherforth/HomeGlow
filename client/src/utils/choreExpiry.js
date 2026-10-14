// When a chore is too late to do (issue #279). The server has the same rule
// in server/utils/choreExpiry.js, and refuses a late completion without a
// parent's approval; keep the two in step.
//
// A schedule with a due time can expire `expire_minutes` after it (0 = at the
// due time; null = never). Everything is in the household's terms: a date
// ('YYYY-MM-DD') and minutes since midnight in the server's time zone.
import { getMinutesSinceMidnightInTz, parseDueTimeToMinutes } from './choreSound.js';
import { getServerTimezoneSync } from './timezone.js';
import { getTodayDateString } from './choreHelpers.js';

// The choices the editors offer, in minutes after the due time.
export const EXPIRE_OPTIONS = [0, 15, 30, 60, 120, 180, 240, 360, 480, 720];

const DAY_MINUTES = 24 * 60;

function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * When the occurrence on `date` expires, as { date, minutes }, or null if it
 * never does. A one-time chore with a due date is due on that day; any other
 * on the day it's done for. The buffer can run past midnight.
 */
export function expiryOf(schedule, date) {
  const due = parseDueTimeToMinutes(schedule?.due_time);
  const raw = schedule?.expire_minutes;
  const extra = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (due === null || !Number.isInteger(extra) || extra < 0) return null;
  const day = !schedule.crontab && schedule.due_date ? String(schedule.due_date).slice(0, 10) : date;
  const total = due + extra;
  return { date: shiftDate(day, Math.floor(total / DAY_MINUTES)), minutes: total % DAY_MINUTES };
}

/** The household's now, as { date, minutes }. */
export function householdNow(now = new Date()) {
  return { date: getTodayDateString(), minutes: getMinutesSinceMidnightInTz(getServerTimezoneSync(), now) };
}

/** Past its expiry: the minute after it, or any later day. */
export function isExpired(schedule, date, now = householdNow()) {
  const at = expiryOf(schedule, date);
  if (!at) return false;
  return now.date > at.date || (now.date === at.date && now.minutes > at.minutes);
}
