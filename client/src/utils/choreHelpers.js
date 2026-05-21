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
    const todayStr = getTodayDateString();
    const [year, month, day] = todayStr.split('-').map(Number);
    const todayInServerTz = new Date(year, month - 1, day);

    const interval = CronExpressionParser.parse(schedule.crontab, {
      currentDate: new Date(todayInServerTz.getTime() + 24 * 60 * 60 * 1000),
      tz
    });

    const prevOccurrence = interval.prev().toDate();
    const prevFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const prevStr = prevFormatter.format(prevOccurrence);

    return prevStr === todayStr;
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
