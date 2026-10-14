// When a chore is too late to do (issue #279).
//
// A schedule with a due time can expire: `expire_minutes` after its due time
// (0 = at the due time; NULL = never). After that, an open chore can only be
// completed with a parent's approval. The client has the same rule in
// client/src/utils/choreExpiry.js; keep the two in step.
//
// Everything is in household-local terms: a date ('YYYY-MM-DD') and minutes
// since midnight. The server process runs on the household zone, so its own
// clock gives both.

// The choices the editors offer, in minutes after the due time.
const EXPIRE_OPTIONS = [0, 15, 30, 60, 120, 180, 240, 360, 480, 720];

const DAY_MINUTES = 24 * 60;

function parseTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** null, or the minutes when `value` is one of the offered choices (for the API). */
function normalizeExpireMinutes(value) {
  if (value === null || value === undefined || value === '') return { valid: true, value: null };
  const minutes = Number(value);
  return EXPIRE_OPTIONS.includes(minutes) ? { valid: true, value: minutes } : { valid: false };
}

/**
 * When the occurrence on `date` expires, as { date, minutes }, or null if it
 * never does. A one-time chore with a due date is due on that day; any other
 * on the day it's done for. The buffer can run past midnight.
 */
function expiryOf(schedule, date) {
  const due = parseTime(schedule?.due_time);
  const raw = schedule?.expire_minutes;
  const extra = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (due === null || !Number.isInteger(extra) || extra < 0) return null;
  const day = !schedule.crontab && schedule.due_date ? String(schedule.due_date).slice(0, 10) : date;
  const total = due + extra;
  return { date: shiftDate(day, Math.floor(total / DAY_MINUTES)), minutes: total % DAY_MINUTES };
}

/** The household's now, as { date, minutes }. */
function localNow(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
}

/** Past its expiry: the minute after it, or any later day. */
function isExpired(schedule, date, now = localNow()) {
  const at = expiryOf(schedule, date);
  if (!at) return false;
  return now.date > at.date || (now.date === at.date && now.minutes > at.minutes);
}

module.exports = { EXPIRE_OPTIONS, normalizeExpireMinutes, expiryOf, localNow, isExpired };
