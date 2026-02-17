import parser from 'cron-parser';

export function shouldShowChoreToday(schedule) {
  if (!schedule.visible) {
    return false;
  }

  if (!schedule.crontab) {
    return true;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const interval = parser.parseExpression(schedule.crontab, {
      currentDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone
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
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
