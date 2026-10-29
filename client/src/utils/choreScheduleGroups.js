// Grouping a person's chore schedules by when they happen, for the "By person"
// view of Admin → Chores. Nothing here changes how schedules are stored: each
// chore still has its own schedule row, and a "group" is just the schedules of
// one person whose timing matches. Changing a group's days changes each of its
// schedules the same way.
//
// A timing is { kind, key, ... }:
//   week    { days: [0..6] }        days of the week (0 = Sunday, as crontab)
//   everyN  { n }                   every n days ("*/n" day of month)
//   monthly { dom: '1' | '1,15' }   days of the month
//   months  { dom: 15, months: [1,4,7,10], every: 3 }   one day in some
//           months: every 3 or 6 months, or once a year (every: 12)
//   custom  { rest: 'dom mon dow' } anything else crontab can say
//   once    { dueDate: 'YYYY-MM-DD' | null }   no repeat
//   after   { interval: '3d' }      "once completed": again a while after done
//
// Only the day fields of a crontab decide the group. The minute and hour are
// each schedule's own, and are kept when its group's days change.

import { CronExpressionParser } from 'cron-parser';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// "1-5", "0,6", "MON,WED", "*" → sorted day numbers; null when it can't be read.
const DOW_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const dowValue = (part) => {
  const lower = part.toLowerCase();
  if (lower in DOW_NAMES) return DOW_NAMES[lower];
  if (!/^\d+$/.test(part)) return null;
  const n = Number(part);
  if (n === 7) return 0;
  return n >= 0 && n <= 6 ? n : null;
};

export function parseDaysOfWeek(field) {
  if (field === '*' || field === '?') return [...ALL_DAYS];
  const days = new Set();
  for (const part of String(field).split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return null;
    let from;
    let to;
    if (range === '*') {
      from = 0; to = 6;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      from = dowValue(a);
      to = b === '7' ? 7 : dowValue(b);
      if (from === null || to === null) return null;
    } else {
      from = dowValue(range);
      if (from === null) return null;
      to = stepText === undefined ? from : 6;
    }
    if (to < from) return null;
    for (let d = from; d <= to; d += step) days.add(d % 7);
  }
  return [...days].sort((a, b) => a - b);
}

// The minute, hour and the three day fields of a crontab, or null.
function cronFields(crontab) {
  const parts = String(crontab || '').trim().split(/\s+/);
  if (parts.length === 6) parts.shift(); // seconds
  if (parts.length !== 5) return null;
  const [minute, hour, dom, mon, dow] = parts;
  return { minute, hour, dom, mon, dow };
}

// The timing a schedule's chore belongs to. Null for a sticky schedule's
// daily copy (parent_schedule_id): the schedule it came from stands for it.
export function timingOfSchedule(schedule) {
  if (!schedule || schedule.parent_schedule_id) return null;
  if (schedule.duration === 'once-completed' && schedule.crontab) {
    const interval = schedule.interval || '';
    return { kind: 'after', key: `after:${interval}`, interval };
  }
  if (!schedule.crontab) {
    const dueDate = schedule.due_date ? String(schedule.due_date).slice(0, 10) : null;
    return { kind: 'once', key: `once:${dueDate || ''}`, dueDate };
  }
  const f = cronFields(schedule.crontab);
  if (!f) return { kind: 'custom', key: `custom:${schedule.crontab}`, rest: schedule.crontab };
  if (f.mon === '*' && f.dom === '*') {
    const days = parseDaysOfWeek(f.dow);
    if (days && days.length) return { kind: 'week', key: `week:${days.join(',')}`, days };
  }
  if (f.mon === '*' && (f.dow === '*' || f.dow === '?')) {
    const every = f.dom.match(/^\*\/(\d+)$/);
    if (every) return { kind: 'everyN', key: `every:${Number(every[1])}`, n: Number(every[1]) };
    if (/^\d+(,\d+)*$/.test(f.dom)) {
      const dom = f.dom.split(',').map(Number).sort((a, b) => a - b).join(',');
      return { kind: 'monthly', key: `month:${dom}`, dom };
    }
  }
  if ((f.dow === '*' || f.dow === '?') && /^\d+$/.test(f.dom)) {
    const months = parseMonths(f.mon);
    if (months && months.length < 12) return monthsTiming(Number(f.dom), months);
  }
  const rest = `${f.dom} ${f.mon} ${f.dow}`;
  return { kind: 'custom', key: `custom:${rest}`, rest };
}

// "1,4,7,10", "3", "1-12/3", "2/6" → sorted month numbers 1..12; null if unreadable.
function parseMonths(field) {
  const months = new Set();
  for (const part of String(field).split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return null;
    let from;
    let to;
    if (range === '*') { from = 1; to = 12; } else if (range.includes('-')) {
      [from, to] = range.split('-').map(Number);
    } else {
      from = Number(range);
      to = stepText === undefined ? from : 12;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 12 || to < from) return null;
    for (let m = from; m <= to; m += step) months.add(m);
  }
  return [...months].sort((a, b) => a - b);
}

// Evenly spaced months (every 2, 3, 4, 6 or 12) know their step; others don't.
export function monthsTiming(dom, months) {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const step = 12 / sorted.length;
  const even = Number.isInteger(step) && sorted.every((m, i) => i === 0 || m - sorted[i - 1] === step);
  return { kind: 'months', key: `months:${dom}:${sorted.join(',')}`, dom, months: sorted, every: even ? step : null };
}

// Every `every` months (3, 6, 12) on the day of `startDate` ('YYYY-MM-DD'),
// counting from that date's month.
export function monthsFromStart(startDate, every) {
  const [, m, d] = startDate.split('-').map(Number);
  const months = [];
  for (let i = 0; i < 12; i += every) months.push(((m - 1 + i) % 12) + 1);
  return monthsTiming(d, months);
}

// Timings built from scratch (the Add menu's choices).
export const weekTiming = (days) => {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  return { kind: 'week', key: `week:${sorted.join(',')}`, days: sorted };
};
export const everyNTiming = (n) => ({ kind: 'everyN', key: `every:${n}`, n });
export const monthlyTiming = (dom) => {
  const sorted = String(dom).split(',').map(Number).sort((a, b) => a - b).join(',');
  return { kind: 'monthly', key: `month:${sorted}`, dom: sorted };
};
export const onceTiming = (dueDate = null) => ({ kind: 'once', key: `once:${dueDate || ''}`, dueDate: dueDate || null });
export const afterTiming = (interval) => ({ kind: 'after', key: `after:${interval}`, interval });

// The day fields a timing writes into a crontab.
function dayFieldsOf(timing) {
  switch (timing.kind) {
    case 'week':
      return timing.days.length === 7 ? '* * *' : `* * ${timing.days.join(',')}`;
    case 'everyN':
      return `*/${timing.n} * *`;
    case 'monthly':
      return `${timing.dom} * *`;
    case 'months':
      return `${timing.dom} ${timing.months.join(',')} *`;
    case 'custom':
      return timing.rest;
    default:
      return '* * *';
  }
}

// What to send for a schedule to take on `timing`. `schedule` is the existing
// row when moving one (its time of day and settings are kept); omit it for a
// new schedule.
export function scheduleFieldsForTiming(timing, schedule = null) {
  const old = schedule ? cronFields(schedule.crontab) : null;
  const time = old ? `${old.minute} ${old.hour}` : '0 0';
  // A schedule leaving "again after done" goes back to showing on its day.
  const wasAfter = schedule?.duration === 'once-completed';
  const keepDuration = schedule && !wasAfter ? (schedule.duration || 'day-of') : 'day-of';
  switch (timing.kind) {
    case 'once':
      return { crontab: null, duration: 'day-of', interval: null, due_date: timing.dueDate || null };
    case 'after':
      return {
        crontab: old && schedule?.crontab ? schedule.crontab : '0 0 * * *',
        duration: 'once-completed',
        interval: timing.interval,
      };
    default: {
      const fields = { crontab: `${time} ${dayFieldsOf(timing)}`, duration: keepDuration, interval: null };
      // A one-time chore's date means nothing once it repeats.
      if (schedule && !schedule.crontab) fields.due_date = null;
      return fields;
    }
  }
}

// Group order: every day first, then the other weekly groups (most days
// first, then by first day), then every-n-days, monthly, again-after-done,
// custom, and one-time last (by date).
const KIND_ORDER = { week: 0, everyN: 1, monthly: 2, months: 3, after: 4, custom: 5, once: 6 };
export function compareTimings(a, b) {
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.kind === 'week') {
    if (a.days.length !== b.days.length) return b.days.length - a.days.length;
    for (let i = 0; i < a.days.length; i += 1) {
      // Monday-first reads naturally: Sunday sorts last.
      const da = (a.days[i] + 6) % 7;
      const db = (b.days[i] + 6) % 7;
      if (da !== db) return da - db;
    }
    return 0;
  }
  if (a.kind === 'everyN') return a.n - b.n;
  if (a.kind === 'months') return (a.every || 99) - (b.every || 99) || a.key.localeCompare(b.key);
  if (a.kind === 'once') return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
  return a.key.localeCompare(b.key);
}

// A person's schedules → [{ timing, schedules }], in display order.
// `userId` null is the unassigned bonus chores.
export function groupSchedulesForUser(schedules, userId) {
  const wanted = userId === null || userId === undefined || userId === 0 ? null : Number(userId);
  const groups = new Map();
  for (const s of schedules) {
    const owner = s.user_id === null || s.user_id === undefined || s.user_id === 0 ? null : Number(s.user_id);
    if (owner !== wanted) continue;
    const timing = timingOfSchedule(s);
    if (!timing) continue;
    if (!groups.has(timing.key)) groups.set(timing.key, { timing, schedules: [] });
    groups.get(timing.key).schedules.push(s);
  }
  const list = [...groups.values()];
  list.sort((a, b) => compareTimings(a.timing, b.timing));
  for (const g of list) g.schedules.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  return list;
}

// The common timings the Add menu offers. Their order is the menu's order.
// Single days, monthly and longer ones are picked with their own controls.
export const COMMON_TIMINGS = [
  weekTiming(ALL_DAYS),
  weekTiming([1, 2, 3, 4, 5]),
  weekTiming([0, 6]),
  weekTiming([1, 3, 5]),
  weekTiming([2, 4]),
  everyNTiming(2),
  onceTiming(null),
];

// Does `timing` put a chore on `date` (a local Date)? Null when it can't say
// (again-after-done depends on when it was last done). `tz` is the server's
// time zone, for the crontab kinds that need cron-parser.
export function timingFallsOn(timing, date, { schedule = null, tz } = {}) {
  switch (timing.kind) {
    case 'week':
      return timing.days.includes(date.getDay());
    case 'once': {
      if (!timing.dueDate) return null;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return timing.dueDate === key;
    }
    case 'after':
      return null;
    default: {
      const expr = schedule?.crontab || `0 0 ${dayFieldsOf(timing)}`;
      try {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
        const it = CronExpressionParser.parse(expr, {
          currentDate: new Date(start.getTime() - 1000),
          endDate: end,
          ...(tz ? { tz } : {}),
        });
        return it.hasNext();
      } catch {
        return null;
      }
    }
  }
}

// The Sunday-first week (7 local dates) that contains `date`, moved by `offset` weeks.
export function weekDates(date = new Date(), offset = 0) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
