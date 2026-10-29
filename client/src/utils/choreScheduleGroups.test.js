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
  monthsTiming,
  monthsFromStart,
  nextFireOn,
  calendarWeek,
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
    expect(timingOfSchedule({ crontab: '0 0 1 6 *' })).toMatchObject({ kind: 'months', months: [6], every: 12 });
    expect(timingOfSchedule({ crontab: '0 0 1-7 * 1' })).toMatchObject({ kind: 'custom', rest: '1-7 * 1' });
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
    for (const timing of [...COMMON_TIMINGS, monthlyTiming('15'), monthsFromStart('2026-01-15', 3), monthsFromStart('2026-03-02', 12), afterTiming('9m')]) {
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

describe('every few months and yearly', () => {
  it('builds the months from a start date', () => {
    expect(monthsFromStart('2026-02-15', 3)).toMatchObject({ kind: 'months', dom: 15, months: [2, 5, 8, 11], every: 3 });
    expect(monthsFromStart('2026-11-01', 6)).toMatchObject({ months: [5, 11], every: 6 });
    expect(monthsFromStart('2026-03-20', 12)).toMatchObject({ months: [3], every: 12 });
    expect(scheduleFieldsForTiming(monthsFromStart('2026-02-15', 3)).crontab).toBe('0 0 15 2,5,8,11 *');
  });

  it('reads those crontabs back, however the months are written', () => {
    expect(timingOfSchedule({ crontab: '0 0 15 2,5,8,11 *' }).key).toBe(monthsFromStart('2026-02-15', 3).key);
    expect(timingOfSchedule({ crontab: '0 0 15 2/3 *' }).key).toBe(monthsFromStart('2026-02-15', 3).key);
    expect(timingOfSchedule({ crontab: '0 0 1 1,2,7 *' })).toMatchObject({ kind: 'months', every: null });
    expect(timingOfSchedule({ crontab: '0 0 1 * *' }).kind).toBe('monthly');
  });

  it('puts them on the calendar on their days only', () => {
    expect(timingFallsOn(monthsTiming(28, [1, 4, 7, 10]), new Date(2026, 9, 28))).toBe(true);
    expect(timingFallsOn(monthsTiming(28, [1, 4, 7, 10]), new Date(2026, 10, 28))).toBe(false);
  });
});

describe('nextFireOn', () => {
  it('finds the next date a crontab fires, including the date the server sets after a chore is done', () => {
    expect(nextFireOn('0 0 2 2 *', '2026-10-28')).toBe('2027-02-02');
    expect(nextFireOn('0 0 * * *', '2026-10-28')).toBe('2026-10-28');
    expect(nextFireOn(null, '2026-10-28')).toBeNull();
  });
});

describe('calendarWeek', () => {
  const dates = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
  const today = '2026-10-28';
  const S = (id, chore_id, crontab, extra = {}) => ({ id, chore_id, user_id: 1, title: `c${chore_id}`, crontab, visible: 1, duration: 'day-of', ...extra });
  const group = (schedules) => ({ timing: timingOfSchedule(schedules[0]), schedules });
  const state = (week, date, choreId) => week.days.find((d) => d.date === date).items.find((i) => i.schedule.chore_id === choreId);

  it('marks done, missed, not done, today and planned', () => {
    const week = calendarWeek({
      groups: [group([S(1, 1, '0 0 * * *')])],
      dates,
      today,
      rows: [{ chore_id: 1, date: '2026-10-25', kind: 'completion' }, { chore_id: 1, date: '2026-10-26', kind: 'missed' }],
    });
    expect(state(week, '2026-10-25', 1).state).toBe('done');
    expect(state(week, '2026-10-26', 1).state).toBe('missed');
    expect(state(week, '2026-10-27', 1).state).toBe('notDone');
    expect(state(week, '2026-10-28', 1).state).toBe('today');
    expect(state(week, '2026-10-29', 1).state).toBe('planned');
  });

  it('marks nothing on days before the schedule existed', () => {
    const week = calendarWeek({ groups: [group([S(1, 1, '0 0 * * *', { created_at: '2026-10-27 15:00:00' })])], dates, today });
    expect(state(week, '2026-10-26', 1)).toBeUndefined();
    expect(state(week, '2026-10-27', 1).state).toBe('notDone');
  });

  it('repeats a stays-until-done chore still waiting on today, saying which day it is from', () => {
    const week = calendarWeek({ groups: [group([S(1, 5, '0 0 * * 1,3', { duration: 'until-completed' })])], dates, today: '2026-10-29' });
    expect(state(week, '2026-10-26', 5).state).toBe('waiting');
    expect(state(week, '2026-10-29', 5)).toMatchObject({ state: 'waiting', carriedFrom: '2026-10-26' });
  });

  it('counts from the last time it was done', () => {
    const groups = [group([S(1, 5, '0 0 * * 1,3', { duration: 'until-completed' })])];
    // Done Tuesday, due again Wednesday and not done: today shows it from Wednesday.
    let week = calendarWeek({ groups, dates, today: '2026-10-29', rows: [{ chore_id: 5, date: '2026-10-27', kind: 'completion' }] });
    expect(state(week, '2026-10-29', 5)).toMatchObject({ carriedFrom: '2026-10-28' });
    // Done Wednesday: nothing waiting today.
    week = calendarWeek({ groups, dates, today: '2026-10-29', rows: [{ chore_id: 5, date: '2026-10-28', kind: 'completion' }] });
    expect(state(week, '2026-10-29', 5)).toBeUndefined();
  });

  it('shows a stays-until-done chore done late on the day it was done', () => {
    const week = calendarWeek({
      groups: [group([S(1, 5, '0 0 * * 0', { duration: 'until-completed' })])],
      dates,
      today,
      rows: [{ chore_id: 5, date: '2026-10-27', kind: 'completion' }],
    });
    expect(state(week, '2026-10-25', 5).state).toBe('waiting');
    expect(state(week, '2026-10-27', 5)).toMatchObject({ state: 'done', late: true });
  });

  it('puts an again-after-done chore on its next date, and one-time chores on theirs', () => {
    const week = calendarWeek({
      groups: [
        group([S(1, 2, '0 0 30 10 *', { duration: 'once-completed', interval: '3m' })]),
        group([S(2, 3, null, { due_date: '2026-10-31' })]),
        group([S(3, 4, null)]),
      ],
      dates,
      today,
    });
    expect(state(week, '2026-10-30', 2).state).toBe('planned');
    expect(state(week, '2026-10-31', 3).state).toBe('planned');
    expect(week.noDay.map((n) => n.schedule.chore_id)).toEqual([4]);
  });

  it('treats vacation days as off, and leaves hidden chores off except where done', () => {
    const week = calendarWeek({
      groups: [group([S(1, 1, '0 0 * * *', { visible: 0 })]), group([S(2, 6, '0 0 * * 1')])],
      dates,
      today,
      rows: [{ chore_id: 1, date: '2026-10-25', kind: 'completion' }],
      vacation: { enabled: true, startDate: '2026-10-26', endDate: '2026-10-26' },
    });
    expect(state(week, '2026-10-25', 1).state).toBe('done');
    expect(state(week, '2026-10-29', 1)).toBeUndefined();
    expect(week.days[1].vacation).toBe(true);
    expect(state(week, '2026-10-26', 6).state).toBe('planned');
  });
});
