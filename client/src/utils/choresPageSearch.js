// The search on Admin → Family → Chores. It filters a section's rows and never
// what's inside one: a routine stays whole in its editor. A routine matches on
// its name or any of its steps, and says which step, since the row doesn't
// otherwise show them.
const key = (text) => String(text ?? '').trim().toLocaleLowerCase();

export const textMatches = (text, query) => !key(query) || key(text).includes(key(query));

export const choreMatches = (chore, query) => textMatches(chore?.title, query) || (Boolean(key(query)) && textMatches(chore?.description, query));

// { matches, step }: `step` names the step that matched, when the name didn't.
export function routineMatch(routine, steps = [], query = '') {
  if (textMatches(routine?.name, query)) return { matches: true, step: null };
  const byId = new Map(steps.map((step) => [step.id, step]));
  for (const id of routine?.steps || []) {
    const step = byId.get(id);
    if (step && textMatches(step.label, query)) return { matches: true, step: step.label };
  }
  return { matches: false, step: null };
}

// A schedule row, which for a weekday routine stands for the routine.
export function scheduleMatches(schedule, routines = [], steps = [], query = '') {
  if (textMatches(schedule?.title, query)) return true;
  if (key(query) && textMatches(schedule?.description, query)) return true;
  if (!schedule?.routine) return false;
  const routine = routines.find((r) => r.id === schedule.routine.id);
  return routine ? routineMatch(routine, steps, query).matches : false;
}

// Text split around its first match, for drawing the match marked.
export function splitMatch(text, query) {
  const value = String(text ?? '');
  const wanted = key(query);
  if (!wanted) return { before: value, match: '', after: '' };
  // Matched on the text itself: lowercasing can change a string's length, and
  // an index into the lowercased copy would mark the wrong letters.
  const found = new RegExp(String(query).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu').exec(value);
  if (!found) return { before: value, match: '', after: '' };
  return { before: value.slice(0, found.index), match: found[0], after: value.slice(found.index + found[0].length) };
}

// The person chips: 'all', 'bonus' or a person's id as a string. A person who
// has gone falls back to all.
export function validPerson(person, users = []) {
  if (person === 'bonus') return 'bonus';
  return users.some((user) => String(user.id) === String(person)) ? String(person) : 'all';
}

// A history row by the chips: whose it is, or for Bonus, a bonus chore's whoever
// did it. A bonus chore is one with clams, which the row keeps; its schedule may
// be gone by now, or have someone assigned.
export function historyRowIsFor(row, person) {
  if (person === 'all') return true;
  if (person === 'bonus') return row?.kind === 'completion' && row?.clam_value > 0;
  return String(row?.user_id) === String(person);
}

export const routineIsFor = (routine, person) => person === 'all' || String(routine?.user_id) === String(person);
