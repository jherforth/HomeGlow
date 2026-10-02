const { CronExpressionParser } = require('cron-parser');

const pad = (n) => String(n).padStart(2, '0');

/**
 * Whether `crontab` fires during the local calendar day `dateStr`
 * (YYYY-MM-DD), in the process's own time zone.
 *
 * Replays the schedule from just before that day's local midnight and asks
 * whether the next run lands on the same local date. The comparison has to use
 * local date parts: every crontab the app writes fires at midnight, and east
 * of UTC local midnight is still the previous day in UTC, so reading the date
 * from toISOString() put a Berlin chore for the 5th on the 4th, and it never
 * showed.
 *
 * Throws on an invalid crontab or date, as CronExpressionParser does; callers
 * decide whether to skip or fail.
 */
function cronFiresOnDate(crontab, dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(startOfDay.getTime())) throw new Error(`Invalid date: ${dateStr}`);

  const interval = CronExpressionParser.parse(crontab, {
    currentDate: new Date(startOfDay.getTime() - 1),
    utc: false,
  });
  const next = new Date(interval.next().getTime());
  const nextDate = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  return nextDate === dateStr;
}

module.exports = { cronFiresOnDate };
