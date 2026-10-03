import { CronExpressionParser } from 'cron-parser';
import { getServerTimezoneSync } from './timezone.js';
import { getWeekdayLabels } from './dateUtils.js';

export const CRONTAB_PRESETS = [
  { key: 'daily', value: '0 0 * * *' },
  { key: 'everyOtherDay', value: '0 0 */2 * *' },
  { key: 'weekdays', value: '0 0 * * 1-5' },
  { key: 'weekends', value: '0 0 * * 0,6' }
];

export const DEFAULT_SCHEDULE_FIELDS = {
  scheduleMode: 'preset',
  selectedPreset: '0 0 * * *',
  selectedDays: [],
  customCrontab: '',
  isOneTime: false,
  duration: 'day-of',
  sleepCount: '',
  sleepUnit: 'd',
  calendar_match: ''
};

export const getDayOptions = () => getWeekdayLabels(0).map((label, value) => ({ label, value }));

export function getNextOccurrence(crontab, schedule) {
  if (schedule?.duration === 'once-completed') {
    return schedule.interval ? `Once completed (+${formatScheduleInterval(schedule.interval)})` : 'Once completed';
  }
  if (schedule?.calendar_match) {
    return schedule.calendar_matched_today ? 'Today' : 'No matching event';
  }
  if (!crontab) return 'One-time';
  const next = nextOccurrenceAt(crontab, schedule);
  if (!next) return 'Invalid expression';
  const tz = getServerTimezoneSync();
  return next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
}

// The date the Next Occurrence label is built from, exposed on its own so
// the column can sort on the instant rather than on the formatted string.
// Null means there is no next occurrence: a one-time task, an expression
// that does not parse, or a calendar schedule with no matching event today.
export function nextOccurrenceAt(crontab, schedule) {
  if (schedule?.duration === 'once-completed') return null;
  if (schedule?.calendar_match) {
    return schedule.calendar_matched_today ? new Date() : null;
  }
  if (!crontab) return null;
  try {
    const tz = getServerTimezoneSync();
    return CronExpressionParser.parse(crontab, { tz }).next().toDate();
  } catch {
    return null;
  }
}

export function validateCrontab(crontab) {
  if (!crontab) return null;
  try {
    CronExpressionParser.parse(crontab);
    return null;
  } catch (e) {
    return e.message;
  }
}

export function daysToCrontab(days) {
  const sorted = [...days].sort((a, b) => a - b);
  return `0 0 * * ${sorted.join(',')}`;
}

export function formatScheduleInterval(interval) {
  if (!interval || typeof interval !== 'string') {
    return null;
  }

  const match = interval.match(/^(\d+)([dwmy])$/i);
  if (!match) {
    return interval;
  }

  const count = match[1];
  const unit = match[2].toLowerCase();
  const unitLabelMap = {
    d: 'day',
    w: 'week',
    m: 'month',
    y: 'year'
  };
  const unitLabel = unitLabelMap[unit] || unit;
  return `${count} ${unitLabel}${count === '1' ? '' : 's'}`;
}

export function computeCrontab(f) {
  if (f.isOneTime || f.duration === 'once-completed' || f.scheduleMode === 'calendar') return '';
  if (f.scheduleMode === 'after-completion') return f.customCrontab || '0 0 * * *';
  if (f.scheduleMode === 'preset') return f.selectedPreset;
  if (f.scheduleMode === 'days') return f.selectedDays.length > 0 ? daysToCrontab(f.selectedDays) : '';
  return f.customCrontab;
}

export function updateScheduleFormHelper(prev, updates) {
  const next = { ...prev, ...updates };
  if (updates.scheduleMode) {
    if (updates.scheduleMode === 'after-completion') {
      next.duration = 'once-completed';
      if (!next.customCrontab) {
        next.customCrontab = '0 0 * * *';
      }
    } else if (prev.scheduleMode === 'after-completion' && next.duration === 'once-completed') {
      next.duration = 'day-of';
    }
  }
  const cron = computeCrontab(next);
  const isCronExempt = next.isOneTime || next.scheduleMode === 'calendar' || next.scheduleMode === 'after-completion';
  const crontabError = isCronExempt ? null : validateCrontab(cron);
  return { next, crontabError };
}

export function getAfterCompletionExplanation(form, t) {
  const count = form.sleepCount?.trim() || '[count]';
  const unitMap = {
    d: { singular: 'day', plural: 'days' },
    w: { singular: 'week', plural: 'weeks' },
    m: { singular: 'month', plural: 'months' },
    y: { singular: 'year', plural: 'years' },
  };
  const unitInfo = unitMap[form.sleepUnit] || unitMap.d;
  const unitLabel = count === '1' ? unitInfo.singular : unitInfo.plural;
  const formattedUnit = count === '[count]' ? '[unit]' : unitLabel;

  return t('chores:schedules.afterCompletionHelp', {
    count,
    unit: formattedUnit,
    defaultValue: `This chore appears on the dashboard immediately and stays visible until marked complete. Once completed, it will reappear ${count} ${formattedUnit} later.`
  });
}

export function isScheduleFormInvalid(form, crontabError) {
  if (form.isOneTime) return false;
  if (form.scheduleMode === 'calendar') {
    return !form.calendar_match?.trim();
  }
  if (form.scheduleMode === 'after-completion' || form.duration === 'once-completed') {
    const parsed = Number.parseInt(form.sleepCount, 10);
    return !Number.isInteger(parsed) || parsed <= 0;
  }
  if (form.scheduleMode === 'days') {
    return !form.selectedDays || form.selectedDays.length === 0;
  }
  if (form.scheduleMode === 'custom') {
    return !form.customCrontab?.trim() || Boolean(crontabError);
  }
  return Boolean(crontabError);
}
