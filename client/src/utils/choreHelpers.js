import { CronExpressionParser } from 'cron-parser';
import { getServerTimezoneSync } from './timezone.js';

export function shouldShowChoreToday(schedule) {
  if (!schedule.visible) {
    return false;
  }

  // Snoozed chores stay hidden until the snooze passes (ISO UTC comparison,
  // mirrors the server's daily-bonus filtering).
  if (schedule.snoozed_until && new Date(schedule.snoozed_until) > new Date()) {
    return false;
  }

  if (!schedule.crontab) {
    return true;
  }

  try {
    const tz = getServerTimezoneSync();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const interval = CronExpressionParser.parse(schedule.crontab, {
      currentDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      tz
    });

    const prevOccurrence = interval.prev().toDate();
    prevOccurrence.setHours(0, 0, 0, 0);

    return prevOccurrence.getTime() === today.getTime();
  } catch (error) {
    console.error('Error parsing crontab:', schedule.crontab, error);
    return false;
  }
}

/**
 * True when `userId` still has a bonus chore outstanding for today, which is
 * what blocks claiming another one.
 *
 * A bonus chore is one with clam_value > 0 (a regular chore is clam_value 0 —
 * the same test the server uses). Only chores actually DUE today count: a
 * Monday-only bonus chore is not outstanding on a Sunday, so it must not block
 * a claim. Due-ness comes from shouldShowChoreToday, the same predicate the
 * widget renders with, so the gate and the list can never disagree.
 */
export function hasOutstandingBonusChore(schedules, history, userId, today) {
  return schedules
    .filter((schedule) => schedule.user_id === userId
      && (schedule.clam_value || 0) > 0
      && shouldShowChoreToday(schedule))
    .some((schedule) => !history.some((entry) => entry.chore_schedule_id === schedule.id
      && entry.user_id === userId
      && entry.date === today));
}

export function getTodayDateString() {
  const tz = getServerTimezoneSync();
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(today);
}

export function convertDaysToCrontab(daysArray) {
  if (!daysArray || daysArray.length === 0) {
    return null;
  }

  const dayMap = {
    'sunday': '0',
    'monday': '1',
    'tuesday': '2',
    'wednesday': '3',
    'thursday': '4',
    'friday': '5',
    'saturday': '6'
  };

  if (daysArray.length === 7) {
    return '0 0 * * *';
  }

  const dayNumbers = daysArray.map(day => dayMap[day.toLowerCase()]).sort();
  return `0 0 * * ${dayNumbers.join(',')}`;
}

// Urgency status for a chore's calendar due date (issue #97).
// Compares 'YYYY-MM-DD' strings lexicographically (valid for ISO dates).
// Returns: 'none' (no date / already completed), 'upcoming' (before due day),
// 'due' (due today), or 'overdue' (past due).
export function getDueDateStatus(dueDate, todayStr = getTodayDateString(), completed = false) {
  if (!dueDate || completed) {
    return 'none';
  }
  if (dueDate === todayStr) {
    return 'due';
  }
  return dueDate < todayStr ? 'overdue' : 'upcoming';
}

// Formats a 'YYYY-MM-DD' string as a short, locale-friendly label (e.g. 'Jul 3').
export function formatDueDate(dueDate) {
  if (typeof dueDate !== 'string') return '';
  const parts = dueDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dueDate;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return dueDate;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * When a history row was actually recorded, for display beside the row's own
 * date. The two usually agree, and repeating the date in every row would be
 * noise — so the date is shown only when it differs, which is exactly the case
 * a reader would otherwise misread: a chore dated yesterday but checked off
 * after midnight.
 *
 * Rendered in the server's timezone, not the viewer's, so the time cannot
 * contradict the date column beside it when a phone is travelling.
 *
 * Returns '' for a missing or unparseable value; callers render a placeholder
 * rather than a wrong time.
 */
export function formatLoggedAt(createdAt, rowDate, locale = undefined) {
  if (!createdAt) return '';
  const logged = new Date(createdAt);
  if (Number.isNaN(logged.getTime())) return '';

  const timeZone = getServerTimezoneSync();
  const time = logged.toLocaleTimeString(locale, { timeZone, hour: 'numeric', minute: '2-digit' });

  const loggedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(logged);

  if (!rowDate || loggedDate === rowDate) return time;

  const dayLabel = logged.toLocaleDateString(locale, { timeZone, month: 'short', day: 'numeric' });
  return `${dayLabel}, ${time}`;
}

/**
 * Compare two rows by a column's sort key, for the chore admin tables.
 *
 * `GET /api/chores` and `GET /api/chore-schedules` declare no `ORDER BY`, so
 * rows arrive in whatever order SQLite's plan yields, which is insertion order
 * in practice. That is fine for a handful of chores and unreadable once a
 * household has thirty, so both tables sort client side and let a header click
 * re-sort.
 *
 * `keyOf` maps a row to the value the column sorts on, which is deliberately
 * not what the cell draws: Next Occurrence renders a formatted date, and
 * comparing those as text would order "Apr" before "Jan".
 *
 * Numbers compare numerically. Everything else goes through `localeCompare`
 * with case and accents folded (`sensitivity: 'base'`), so "Dishes" and
 * "dishes" sort together instead of splitting into two alphabets.
 *
 * A `null` key means the row has no value for this column at all, which is
 * different from having a low one. Those rows sort last in *both* directions:
 * flipping the arrow to find the soonest occurrence should not march the
 * schedules that have no occurrence to the top. Next Occurrence is the only
 * column that produces one, since a missing title folds to `''` and an
 * unassigned schedule still reads "Unassigned".
 *
 * `id` breaks every tie and is never reversed, which keeps the order
 * deterministic rather than leaning on the sort being stable over an input
 * order that is itself unspecified, and means toggling the direction on a
 * column full of equal values does not reshuffle those rows.
 */
export function compareByKey(a, b, keyOf, direction = 'asc', locale = undefined) {
  const ka = keyOf(a);
  const kb = keyOf(b);

  const aMissing = ka === null || ka === undefined;
  const bMissing = kb === null || kb === undefined;
  if (aMissing || bMissing) {
    if (!(aMissing && bMissing)) return aMissing ? 1 : -1;
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  }

  const byKey = typeof ka === 'number' && typeof kb === 'number'
    ? ka - kb
    : String(ka).localeCompare(String(kb), locale, { sensitivity: 'base' });

  const signed = direction === 'desc' ? -byKey : byKey;
  if (signed !== 0) return signed;
  return Number(a?.id ?? 0) - Number(b?.id ?? 0);
}
