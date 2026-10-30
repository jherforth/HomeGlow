import { describe, expect, it } from 'vitest';
import { calendarRoutinesFor, schedulesWithRoutines } from './routineSchedules.js';

const routines = [
  { id: 1, name: 'Morning', user_id: 7, trigger: 'days', schedule_id: 10, steps: [1, 2, 3] },
  { id: 2, name: 'Swim bag', user_id: 7, trigger: 'calendar', schedule_id: null, steps: [4] },
  { id: 3, name: 'Bedtime', user_id: 8, trigger: 'calendar', schedule_id: null, steps: [] },
  { id: 4, name: 'Art class', user_id: 7, trigger: 'calendar', schedule_id: null, steps: [] },
];
const schedules = [
  { id: 5, chore_id: 50, title: 'Dishes' },
  { id: 10, chore_id: 51, title: 'Morning', routine_id: 1 },
  // Morning's schedule from before it was moved (hidden), and a calendar
  // routine's one-date schedules.
  { id: 11, chore_id: 51, title: 'Morning', routine_id: 1, visible: 0 },
  { id: 12, chore_id: 52, title: 'Swim bag', routine_id: 2 },
  { id: 13, chore_id: 52, title: 'Swim bag', routine_id: 2 },
  // A routine no longer in the list.
  { id: 14, chore_id: 53, title: 'Gone', routine_id: 99 },
];

describe('schedulesWithRoutines', () => {
  it("keeps chores' schedules and a weekday routine's own, marked", () => {
    const shown = schedulesWithRoutines(schedules, routines);
    expect(shown.map((s) => s.id)).toEqual([5, 10]);
    expect(shown[0].routine).toBeUndefined();
    expect(shown[1].routine).toEqual({ id: 1, steps: 3 });
  });

  it('works before routines have loaded', () => {
    expect(schedulesWithRoutines(schedules).map((s) => s.id)).toEqual([5]);
    expect(schedulesWithRoutines()).toEqual([]);
  });
});

describe('calendarRoutinesFor', () => {
  it("lists one person's calendar routines by name", () => {
    expect(calendarRoutinesFor(routines, 7).map((r) => r.name)).toEqual(['Art class', 'Swim bag']);
    expect(calendarRoutinesFor(routines, 9)).toEqual([]);
  });
});
