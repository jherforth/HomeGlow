import { describe, expect, it } from 'vitest';
import { routineChoreOverlaps } from './routineChoreOverlaps.js';

const steps = [{ id: 1, label: 'Make Bed' }, { id: 2, label: 'Brush Teeth' }];
const sched = (over) => ({ id: Math.random(), user_id: 3, title: 'Make Bed', crontab: '0 0 * * *', visible: 1, routine_id: null, ...over });
const run = (schedules, more = {}) => Object.fromEntries(
  routineChoreOverlaps({ steps, schedules, userIds: [3], days: [1, 2, 3, 4, 5], ...more }),
);

describe('routineChoreOverlaps', () => {
  it('flags a step that is the person\'s chore on a day the routine runs', () => {
    expect(run([sched()])).toEqual({ 1: [{ userId: 3, days: [0, 1, 2, 3, 4, 5, 6] }] });
  });

  it('matches the name ignoring case and outer spaces', () => {
    expect(run([sched({ title: ' make bed ' })])[1]).toBeTruthy();
  });

  it('leaves out other people, other days, hidden chores and routine chores', () => {
    expect(run([sched({ user_id: 4 })])).toEqual({});
    expect(run([sched({ crontab: '0 0 * * 0,6' })])).toEqual({});
    expect(run([sched({ visible: 0 })])).toEqual({});
    expect(run([sched({ routine_id: 9 })])).toEqual({});
  });

  it('reads only weekly chores', () => {
    expect(run([sched({ crontab: '0 0 */2 * *' })])).toEqual({});
    expect(run([sched({ crontab: null, due_date: '2026-11-02' })])).toEqual({});
  });

  it('joins one person\'s schedules, and lists each person', () => {
    const out = run([sched({ crontab: '0 0 * * 1' }), sched({ crontab: '0 0 * * 3' }), sched({ user_id: 4, crontab: '0 0 * * 1-5' })], { userIds: [3, 4] });
    expect(out[1]).toEqual([{ userId: 3, days: [1, 3] }, { userId: 4, days: [1, 2, 3, 4, 5] }]);
  });

  it('every day when the routine has no days; any weekly chore for a calendar routine', () => {
    expect(run([sched({ crontab: '0 0 * * 6' })], { days: [] })[1]).toBeTruthy();
    expect(run([sched({ crontab: '0 0 * * 6' })], { trigger: 'calendar', days: [] })[1]).toBeTruthy();
  });
});
