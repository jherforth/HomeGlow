import { describe, it, expect } from 'vitest';
import { addDays, cronFiresOn, missesTracked, choreDays, streakOf, summarize, rowsFor } from './choreDays.js';

// 2026-10-20 is a Tuesday.
const TODAY = '2026-10-20';
const MWF = '0 0 * * 1,3,5';
const base = { id: 7, chore_id: 3, user_id: 2, crontab: null, clam_value: 0, created_at: '2026-01-01 08:00:00' };
const row = (date, kind = 'completion', extra = {}) => ({ user_id: 2, chore_schedule_id: 7, chore_id: 3, date, kind, clam_value: 0, ...extra });
const states = (days) => days.map((d) => d.state);

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('cronFiresOn', () => {
  it('reads weekdays', () => {
    expect(cronFiresOn(MWF, '2026-10-19')).toBe(true); // Monday
    expect(cronFiresOn(MWF, TODAY)).toBe(false); // Tuesday
  });
  it('treats 7 as Sunday', () => {
    expect(cronFiresOn('0 0 * * 7', '2026-10-18')).toBe(true);
  });
  it('ORs day of month with day of week when both are set', () => {
    expect(cronFiresOn('0 0 15 * 1', '2026-10-15')).toBe(true); // Thursday the 15th
    expect(cronFiresOn('0 0 15 * 1', '2026-10-19')).toBe(true); // a Monday
    expect(cronFiresOn('0 0 15 * 1', TODAY)).toBe(false);
  });
  it('is never due on a bad crontab', () => {
    expect(cronFiresOn('nonsense', TODAY)).toBe(false);
  });
});

describe('missesTracked', () => {
  it('only for assigned zero-clam chores', () => {
    expect(missesTracked(base)).toBe(true);
    expect(missesTracked({ ...base, clam_value: 2 })).toBe(false);
    expect(missesTracked({ ...base, user_id: 0 })).toBe(false);
    expect(missesTracked({ ...base, crontab: MWF, duration: 'until-completed' })).toBe(false);
  });
});

describe('choreDays', () => {
  it('marks done, missed, off and today, oldest first', () => {
    const schedule = { ...base, crontab: MWF };
    const rows = [row('2026-10-14'), row('2026-10-16', 'missed'), row('2026-10-19')];
    const days = choreDays({ rows, schedule, userId: 2, today: TODAY, count: 7 });
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20',
    ]);
    expect(states(days)).toEqual(['done', 'off', 'missed', 'off', 'off', 'done', 'off']);
  });

  it('shows a due day with no record as open, and today as today', () => {
    const days = choreDays({ rows: [], schedule: base, userId: 2, today: TODAY, count: 2 });
    expect(states(days)).toEqual(['open', 'today']);
  });

  it('counts a completion on a day it was not due', () => {
    const schedule = { ...base, crontab: MWF };
    const days = choreDays({ rows: [row('2026-10-18')], schedule, userId: 2, today: TODAY, count: 3 });
    expect(states(days)).toEqual(['done', 'open', 'off']);
  });

  it('is off before the schedule existed', () => {
    const schedule = { ...base, created_at: '2026-10-19 17:00:00' };
    const days = choreDays({ rows: [], schedule, userId: 2, today: TODAY, count: 3, timeZone: 'America/Los_Angeles' });
    expect(states(days)).toEqual(['off', 'open', 'today']);
  });

  it('reads created_at as UTC', () => {
    // 03:00 UTC on the 20th is still the 19th in Los Angeles.
    const schedule = { ...base, created_at: '2026-10-20 03:00:00' };
    const days = choreDays({ rows: [], schedule, userId: 2, today: TODAY, count: 2, timeZone: 'America/Los_Angeles' });
    expect(states(days)).toEqual(['open', 'today']);
  });

  it('marks vacation days with nothing logged', () => {
    const vacation = { enabled: true, startDate: '2026-10-18', endDate: '2026-10-19' };
    const rows = [row('2026-10-19')];
    const days = choreDays({ rows, schedule: base, userId: 2, today: TODAY, count: 4, vacation });
    expect(states(days)).toEqual(['open', 'vacation', 'done', 'today']);
  });

  it('ignores other people and other chores', () => {
    const rows = [row('2026-10-19', 'completion', { user_id: 5 }), row('2026-10-19', 'completion', { chore_schedule_id: 9, chore_id: 4 })];
    const days = choreDays({ rows, schedule: base, userId: 2, today: TODAY, count: 2 });
    expect(states(days)).toEqual(['open', 'today']);
  });

  it('follows the chore across schedules', () => {
    // A transfer or a reschedule leaves the person's old rows on another schedule id.
    const rows = [row('2026-10-19', 'completion', { chore_schedule_id: 4 })];
    expect(rowsFor(rows, base, 2)).toHaveLength(1);
  });

  it('has nothing due for until-completed chores', () => {
    const schedule = { ...base, crontab: MWF, duration: 'until-completed' };
    const days = choreDays({ rows: [row(TODAY)], schedule, userId: 2, today: TODAY, count: 2 });
    expect(states(days)).toEqual(['off', 'done']);
  });
});

describe('streakOf', () => {
  const d = (...s) => s.map((state) => ({ state }));
  it('skips days off and an open today', () => {
    expect(streakOf(d('missed', 'done', 'off', 'done', 'vacation', 'done', 'today'))).toEqual({ run: 3, capped: false });
  });
  it('stops at an open day', () => {
    expect(streakOf(d('done', 'open', 'done'))).toEqual({ run: 1, capped: false });
  });
  it('is capped when it reaches the oldest day', () => {
    expect(streakOf(d('done', 'off', 'done'))).toEqual({ run: 2, capped: true });
  });
  it('is zero with nothing done', () => {
    expect(streakOf(d('off', 'today'))).toEqual({ run: 0, capped: false });
  });
});

describe('summarize', () => {
  it('counts done, missed, clams and the rate', () => {
    const schedule = { ...base, clam_value: 0 };
    const rows = [row('2026-10-18', 'completion', { clam_value: 2 }), row('2026-10-19', 'missed'), row('2026-10-01', 'completion', { clam_value: 5 })];
    const days = choreDays({ rows, schedule, userId: 2, today: TODAY, count: 3 });
    expect(summarize(days, rows, schedule, 2)).toEqual({ doneCount: 1, missedCount: 1, clams: 2, rate: 50 });
  });
  it('has no rate with nothing to rate', () => {
    const days = choreDays({ rows: [], schedule: base, userId: 2, today: TODAY, count: 1 });
    expect(summarize(days, [], base, 2).rate).toBeNull();
  });
});
