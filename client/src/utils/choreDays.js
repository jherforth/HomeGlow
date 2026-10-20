// One person's record for one chore, day by day: the chore card's 7-day row
// and the History dialog both read it, so the two can never disagree.
//
// Dates are the household's 'YYYY-MM-DD' strings, the same ones chore_history
// stores. Whether a chore was due on a date is a calendar question, so it is
// answered from the crontab's day fields alone, with no Date in any timezone.

import { CronExpressionParser } from 'cron-parser';

// Day states, as the row and the dialog draw them.
//   done      a completion was logged
//   missed    the midnight job logged a miss
//   open      due, nothing logged (misses aren't tracked for it, or no record)
//   today     due today and not done yet
//   vacation  inside the household's vacation dates, nothing logged
//   off       not due, or before the schedule existed
export const DAY_STATES = ['done', 'missed', 'open', 'today', 'vacation', 'off'];

const pad = (n) => String(n).padStart(2, '0');

/** `dateStr` moved by `days`, as 'YYYY-MM-DD'. Pure calendar arithmetic, in UTC. */
export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Whether `crontab` fires on `dateStr`. Mirrors the server's cronFiresOnDate
 * by the calendar fields: month, and day of month or day of week (cron's OR
 * when both are restricted). A bad crontab is never due.
 */
export function cronFiresOn(crontab, dateStr) {
  let fields;
  try {
    ({ fields } = CronExpressionParser.parse(crontab));
  } catch {
    return false;
  }
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (!fields.month.values.includes(m)) return false;
  // Sunday is both 0 and 7 in cron.
  const dowMatch = fields.dayOfWeek.values.includes(weekday) || (weekday === 0 && fields.dayOfWeek.values.includes(7));
  const domMatch = fields.dayOfMonth.values.includes(d);
  const domAny = fields.dayOfMonth.isWildcard;
  const dowAny = fields.dayOfWeek.isWildcard;
  if (domAny && dowAny) return true;
  if (domAny) return dowMatch;
  if (dowAny) return domMatch;
  return domMatch || dowMatch;
}

/**
 * Whether the midnight job logs misses for this schedule: an assigned,
 * zero-clam chore that isn't an until/once-completed one. Mirrors the
 * server's getTodaysRegularChoresForUser.
 */
export function missesTracked(schedule) {
  if (!schedule || !schedule.user_id) return false;
  if ((schedule.clam_value || 0) !== 0) return false;
  return !(schedule.crontab && ['until-completed', 'once-completed'].includes(schedule.duration));
}

/**
 * Whether the schedule was due on `dateStr`, or null when that can't be told
 * from the schedule (until/once-completed chores carry over between days).
 */
export function dueOn(schedule, dateStr) {
  if (schedule.crontab && ['until-completed', 'once-completed'].includes(schedule.duration)) return null;
  if (!schedule.crontab) return true;
  return cronFiresOn(schedule.crontab, dateStr);
}

// created_at is SQLite CURRENT_TIMESTAMP: UTC, no zone marker.
function createdOn(schedule, timeZone) {
  if (!schedule.created_at) return null;
  const raw = String(schedule.created_at);
  const created = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(created.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(created);
}

function inVacation(vacation, dateStr) {
  if (!vacation || vacation.enabled !== true) return false;
  if (vacation.startDate && dateStr < vacation.startDate) return false;
  if (vacation.endDate && dateStr > vacation.endDate) return false;
  return true;
}

/** The history rows that belong to this person and this chore. */
export function rowsFor(rows, schedule, userId) {
  return (rows || []).filter((row) => Number(row.user_id) === Number(userId)
    && (row.chore_schedule_id === schedule.id
      || (schedule.chore_id != null && row.chore_id === schedule.chore_id)));
}

/**
 * The last `count` days for one person's chore, oldest first, ending today.
 * Each entry is { date, state }.
 */
export function choreDays({ rows, schedule, userId, today, count = 7, vacation = null, timeZone = undefined }) {
  const mine = rowsFor(rows, schedule, userId);
  const done = new Set(mine.filter((r) => r.kind === 'completion' || r.kind == null).map((r) => r.date));
  const missed = new Set(mine.filter((r) => r.kind === 'missed').map((r) => r.date));
  const since = createdOn(schedule, timeZone);

  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    let state;
    if (done.has(date)) state = 'done';
    else if (missed.has(date)) state = 'missed';
    else if (since && date < since) state = 'off';
    else if (inVacation(vacation, date)) state = 'vacation';
    else if (dueOn(schedule, date) !== true) state = 'off';
    else state = date === today ? 'today' : 'open';
    days.push({ date, state });
  }
  return days;
}

/**
 * Consecutive due days done, counting back from today. Today counts once done
 * and never breaks the run while still open; days off and vacation days are
 * skipped. `capped` is true when the run reaches the oldest day given.
 */
export function streakOf(days) {
  let run = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const { state } = days[i];
    if (state === 'done') run += 1;
    else if (state === 'today' || state === 'off' || state === 'vacation') continue;
    else return { run, capped: false };
  }
  return { run, capped: run > 0 };
}

/** Counts over `days`, for the dialog's summary line. */
export function summarize(days, rows, schedule, userId) {
  const first = days[0]?.date;
  const mine = rowsFor(rows, schedule, userId).filter((r) => !first || r.date >= first);
  const doneCount = days.filter((d) => d.state === 'done').length;
  const missedCount = days.filter((d) => d.state === 'missed').length;
  const clams = mine
    .filter((r) => r.kind === 'completion' || r.kind == null)
    .reduce((sum, r) => sum + (Number(r.clam_value) || 0), 0);
  const rate = doneCount + missedCount > 0 ? Math.round((doneCount / (doneCount + missedCount)) * 100) : null;
  return { doneCount, missedCount, clams, rate };
}
