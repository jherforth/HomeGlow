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
