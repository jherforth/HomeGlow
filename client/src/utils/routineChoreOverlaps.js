import { timingOfSchedule } from './choreScheduleGroups.js';

// The routine editor's quiet flag: a step that is also one of the routine's
// people's chores, on a day the routine runs, shows twice on the board. For
// each step, who has it as a chore and on which weekdays.
//
// Matched by name, as "Add a step" matches chores. Only weekly chores are
// read (a chore every N days or monthly has no fixed weekday); hidden ones and
// a routine's own chore are not on the board as a separate card, so they are
// left out. A calendar routine's days aren't known ahead, so any weekly chore
// of the same name counts.
const key = (text) => String(text || '').trim().toLocaleLowerCase();

export function routineChoreOverlaps({ steps = [], schedules = [], userIds = [], trigger = 'days', days = [] }) {
  const people = new Set(userIds.map(Number));
  const runs = trigger === 'calendar' ? null : new Set(days.length ? days : [0, 1, 2, 3, 4, 5, 6]);
  const byStep = new Map();
  for (const step of steps) {
    const name = key(step.label);
    const found = new Map(); // userId -> Set of weekdays
    for (const schedule of schedules) {
      if (!people.has(Number(schedule.user_id)) || schedule.routine_id || schedule.visible === 0) continue;
      if (key(schedule.title) !== name) continue;
      const timing = timingOfSchedule(schedule);
      if (timing?.kind !== 'week') continue;
      if (runs && !timing.days.some((day) => runs.has(day))) continue;
      const set = found.get(Number(schedule.user_id)) || new Set();
      timing.days.forEach((day) => set.add(day));
      found.set(Number(schedule.user_id), set);
    }
    if (found.size) {
      byStep.set(step.id, [...found].map(([userId, set]) => ({ userId, days: [...set].sort((a, b) => a - b) })));
    }
  }
  return byStep;
}
