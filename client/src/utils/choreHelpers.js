import { CronExpressionParser } from 'cron-parser';
import { getServerTimezoneSync } from './timezone.js';

export function shouldShowChoreToday(schedule) {
  if (!schedule.visible) {
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
