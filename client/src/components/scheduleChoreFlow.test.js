import { describe, it, expect } from 'vitest';
import { BONUS, schedulePayload } from './ScheduleChoreDialog.jsx';
import { customTiming } from './SchedulePicker.jsx';
import { afterTiming, anyDayTiming, monthlyTiming, onceTiming, weekTiming } from '../utils/choreScheduleGroups.js';

describe('schedulePayload', () => {
  it('saves one person\'s schedule of the chore, shown', () => {
    const body = schedulePayload(7, 3, weekTiming([1, 4]), null);
    expect(body.chore_id).toBe(7);
    expect(body.user_id).toBe(3);
    expect(body.visible).toBe(1);
    expect(body.crontab).toBe('0 0 * * 1,4');
    expect(body.duration).toBe('day-of');
  });

  it('a bonus chore belongs to no one', () => {
    expect(schedulePayload(7, BONUS, weekTiming([0, 1, 2, 3, 4, 5, 6]), null).user_id).toBeNull();
  });

  it('carries the wizard\'s "if it isn\'t done that day" answer', () => {
    expect(schedulePayload(7, 3, weekTiming([1]), true).duration).toBe('until-completed');
    expect(schedulePayload(7, 3, weekTiming([1]), false).duration).toBe('day-of');
  });

  it('keeps the timing\'s own duration where the wizard didn\'t ask', () => {
    const body = schedulePayload(7, 3, anyDayTiming('1m'), null);
    expect(body.duration).toBe('any-day');
    expect(body.interval).toBe('1m');
  });

  // The widget's Add flow used to build this by hand; it now goes through
  // ScheduleChoreDialog, so the 2026-10-05 once-completed case is pinned
  // here: a one-time chore still saves with a null crontab (and its due
  // date), never a fabricated one.
  it('a one-time chore saves with a null crontab and its due date', () => {
    const body = schedulePayload(7, 3, onceTiming('2026-11-20'), null);
    expect(body.chore_id).toBe(7);
    expect(body.user_id).toBe(3);
    expect(body.crontab).toBeNull();
    expect(body.duration).toBe('day-of');
    expect(body.due_date).toBe('2026-11-20');
  });

  it('a one-time chore with no date still saves with a null crontab', () => {
    const body = schedulePayload(7, 3, onceTiming(null), null);
    expect(body.crontab).toBeNull();
    expect(body.due_date).toBeNull();
  });

  // Repeat-after-completion was unreachable from the widget's old Add flow.
  it('repeat after completion carries its interval', () => {
    const body = schedulePayload(7, 3, afterTiming('3d'), null);
    expect(body.duration).toBe('once-completed');
    expect(body.interval).toBe('3d');
    expect(body.crontab).toBe('0 0 * * *');
  });
});

describe('customTiming', () => {
  it('counts from done for 9 months and a year', () => {
    expect(customTiming({ every: 9, from: 'done', start: '' })).toEqual(afterTiming('9m'));
    expect(customTiming({ every: 12, from: 'done', start: '' })).toEqual(afterTiming('1y'));
  });

  it('every month on set dates is monthly on the start\'s day', () => {
    expect(customTiming({ every: 1, from: 'dates', start: '2026-11-15' })).toEqual(monthlyTiming('15'));
  });

  it('is incomplete without a start date, and for 9 months on set dates', () => {
    expect(customTiming({ every: 3, from: 'dates', start: '' })).toBeNull();
    expect(customTiming({ every: 9, from: 'dates', start: '2026-11-15' })).toBeNull();
  });
});
