import { describe, it, expect } from 'vitest';
import { BONUS, schedulePayload } from './ScheduleChoreDialog.jsx';
import { customTiming } from './SchedulePicker.jsx';
import { afterTiming, anyDayTiming, monthlyTiming, weekTiming } from '../utils/choreScheduleGroups.js';

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
