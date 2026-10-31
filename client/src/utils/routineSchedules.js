// Routines on Admin → Chores' schedule views. A routine owns one chore; the
// chore and schedule lists mark its rows with routine_id. Of those, a weekday
// routine's own schedule is shown like any schedule, marked with `routine`
// so the views open the routine editor instead of changing it directly
// (server/routes/routines.js keeps a routine and its schedules in step).
// A calendar routine has a one-date schedule per matching event, and a
// routine moved from weekdays to calendar keeps its old one hidden; those are
// left out, and a calendar routine is shown once, by calendarRoutinesFor.

export function schedulesWithRoutines(schedules = [], routines = []) {
  const byId = new Map(routines.map((r) => [r.id, r]));
  const shown = [];
  for (const s of schedules) {
    if (!s.routine_id) {
      shown.push(s);
      continue;
    }
    const r = byId.get(s.routine_id);
    if (r && r.trigger !== 'calendar' && r.schedule_id === s.id) {
      shown.push({ ...s, routine: { id: r.id, steps: r.steps?.length || 0 } });
    }
  }
  return shown;
}

// One person's calendar routines, by name.
export function calendarRoutinesFor(routines = [], userId) {
  return routines
    .filter((r) => r.trigger === 'calendar' && r.user_id === userId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
