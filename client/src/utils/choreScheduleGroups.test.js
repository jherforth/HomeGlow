import { describe, it, expect } from 'vitest';
import {
  parseDaysOfWeek,
  timingOfSchedule,
  scheduleFieldsForTiming,
  groupSchedulesForUser,
  weekTiming,
  everyNTiming,
  monthlyTiming,
  onceTiming,
  afterTiming,
  timingFallsOn,
  weekDates,
  COMMON_TIMINGS,
} from './choreScheduleGroups.js';

describe('parseDaysOfWeek', () => {
  it('reads lists, ranges, names, steps and 7 as Sunday', () => {
    expect(parseDaysOfWeek('*')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseDaysOfWeek('1-5')).toEqual([1, 2, 3, 4, 5]);
    expect(parseDaysOfWeek('0,6')).toEqual([0, 6]);
    expect(parseDaysOfWeek('MON,wed,Fri')).toEqual([1, 3, 5]);
    expect(parseDaysOfWeek('7')).toEqual([0]);
    expect(parseDaysOfWeek('5-7')).toEqual([0, 5, 6]);
    expect(parseDaysOfWeek('*/2')).toEqual([0, 2, 4, 6]);
    expect(parseDaysOfWeek('3,1,3')).toEqual([1, 3]);
  });

  it('gives null for what it cannot read', () => {
    expect(parseDaysOfWeek('L')).toBeNull();
    expect(parseDaysOfWeek('5-1')).toBeNull();
    expect(parseDaysOfWeek('9')).toBeNull();
  });
});

describe('timingOfSchedule', () => {
  it('puts the same days in the same group however they are written or timed', () => {
    const a = timingOfSchedule({ crontab: '0 0 * * 1-5' });
    const b = timingOfSchedule({ crontab: '30 7 * * 1,2,3,4,5' });
    expect(a.key).toBe(b.key);
    expect(a).toMatchObject({ kind: 'week', days: [1, 2, 3, 4, 5] });
    expect(timingOfSchedule({ crontab: '0 0 * * *' }).key).toBe(weekTiming([0, 1, 2, 3, 4, 5, 6]).key);
  });

  it('knows every-n-days, monthly, custom, one-time and again-after-done', () => {
    expect(timingOfSchedule({ crontab: '0 0 */2 * *' })).toMatchObject({ kind: 'everyN', n: 2 });
    expect(timingOfSchedule({ crontab: '0 0 15,1 * *' })).toMatchObject({ kind: 'monthly', dom: '1,15' });
    expect(timingOfSchedule({ crontab: '0 0 1 6 *' })).toMatchObject({ kind: 'custom', rest: '1 6 *' });
    expect(timingOfSchedule({ crontab: null, due_date: '2026-11-03' })).toMatchObject({ kind: 'once', dueDate: '2026-11-03' });
    expect(timingOfSchedule({ crontab: null })).toMatchObject({ kind: 'once', dueDate: null });
    expect(timingOfSchedule({ crontab: '0 0 * * *', duration: 'once-completed', interval: '3d' })).toMatchObject({ kind: 'after', interval: '3d' });
  });

  it('leaves out a sticky chore\'s daily copy', () => {
    expect(timingOfSchedule({ crontab: null, parent_schedule_id: 4 })).toBeNull();
  });
});

describe('scheduleFieldsForTiming', () => {
  it('keeps a moved schedule\'s time of day and sticky setting', () => {
    const s = { crontab: '30 7 * * *', duration: 'until-completed' };
    expect(scheduleFieldsForTiming(weekTiming([1, 3, 5]), s))
      .toEqual({ crontab: '30 7 * * 1,3,5', duration: 'until-completed', interval: null });
  });

  it('writes every day as *, and new schedules at midnight, showing that day only', () => {
    expect(scheduleFieldsForTiming(weekTiming([0, 1, 2, 3, 4, 5, 6])))
      .toEqual({ crontab: '0 0 * * *', duration: 'day-of', interval: null });
    expect(scheduleFieldsForTiming(everyNTiming(2)).crontab).toBe('0 0 */2 * *');
    expect(scheduleFieldsForTiming(monthlyTiming('1')).crontab).toBe('0 0 1 * *');
  });

  it('moves into and out of one-time and again-after-done', () => {
    expect(scheduleFieldsForTiming(onceTiming('2026-11-03'), { crontab: '0 0 * * *', duration: 'until-completed' }))
      .toEqual({ crontab: null, duration: 'day-of', interval: null, due_date: '2026-11-03' });
    expect(scheduleFieldsForTiming(weekTiming([6]), { crontab: null, due_date: '2026-11-03' }))
      .toEqual({ crontab: '0 0 * * 6', duration: 'day-of', interval: null, due_date: null });
    expect(scheduleFieldsForTiming(afterTiming('3d'), { crontab: '0 8 * * 1', duration: 'day-of' }))
      .toEqual({ crontab: '0 8 * * 1', duration: 'once-completed', interval: '3d' });
    expect(scheduleFieldsForTiming(weekTiming([1]), { crontab: '0 8 * * *', duration: 'once-completed', interval: '3d' }))
      .toEqual({ crontab: '0 8 * * 1', duration: 'day-of', interval: null });
  });

  it('round-trips: a moved schedule lands in the group it was moved to', () => {
    for (const timing of COMMON_TIMINGS) {
      const fields = scheduleFieldsForTiming(timing, { crontab: '15 6 * * 2', duration: 'day-of' });
      expect(timingOfSchedule({ ...fields }).key).toBe(timing.key);
    }
  });
});

describe('groupSchedulesForUser', () => {
  const schedules = [
    { id: 1, user_id: 7, title: 'Make bed', crontab: '0 0 * * *' },
    { id: 2, user_id: 7, title: 'Dishes', crontab: '0 18 * * *' },
    { id: 3, user_id: 7, title: 'Trash', crontab: '0 0 * * 1,3,5' },
    { id: 4, user_id: 8, title: 'Dishes', crontab: '0 0 * * *' },
    { id: 5, user_id: null, title: 'Wash car', crontab: '0 0 * * 6' },
    { id: 6, user_id: 7, title: 'Make bed', crontab: null, parent_schedule_id: 1 },
    { id: 7, user_id: 7, title: 'Dentist forms', crontab: null, due_date: '2026-11-03' },
  ];

  it('groups one person\'s schedules by timing, every day first and one-time last', () => {
    const groups = groupSchedulesForUser(schedules, 7);
    expect(groups.map((g) => g.timing.key)).toEqual(['week:0,1,2,3,4,5,6', 'week:1,3,5', 'once:2026-11-03']);
    expect(groups[0].schedules.map((s) => s.title)).toEqual(['Dishes', 'Make bed']);
  });

  it('treats no one (and user 0) as the bonus chores', () => {
    expect(groupSchedulesForUser(schedules, null).map((g) => g.schedules[0].id)).toEqual([5]);
    expect(groupSchedulesForUser(schedules, 0).length).toBe(1);
  });
});

describe('timingFallsOn', () => {
  const wed = new Date(2026, 9, 28); // Wednesday
  it('answers for weekly, one-time and crontab timings', () => {
    expect(timingFallsOn(weekTiming([1, 3, 5]), wed)).toBe(true);
    expect(timingFallsOn(weekTiming([2]), wed)).toBe(false);
    expect(timingFallsOn(onceTiming('2026-10-28'), wed)).toBe(true);
    expect(timingFallsOn(onceTiming(null), wed)).toBeNull();
    expect(timingFallsOn(afterTiming('3d'), wed)).toBeNull();
    expect(timingFallsOn(monthlyTiming('28'), wed)).toBe(true);
    expect(timingFallsOn(monthlyTiming('1'), wed)).toBe(false);
  });
});

describe('weekDates', () => {
  it('gives the Sunday-to-Saturday week, and moves by weeks', () => {
    const days = weekDates(new Date(2026, 9, 28));
    expect(days.map((d) => d.getDate())).toEqual([25, 26, 27, 28, 29, 30, 31]);
    expect(weekDates(new Date(2026, 9, 28), 1)[0].getDate()).toBe(1);
  });
});
