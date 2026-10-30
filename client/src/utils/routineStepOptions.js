// "Add a step" in the routine editor: what typing `input` offers. Library
// steps not yet in the routine come first, then chores (a chore picked
// becomes a new step with its title and icon), then "Create step" when the
// text names no step and no chore. With nothing typed, "New step" comes
// first instead (label ''), so a step that isn't listed can be made without
// knowing to type it.
const key = (text) => String(text || '').trim().toLocaleLowerCase();

export function routineStepOptions({ steps = [], used = [], chores = [], input = '' }) {
  const query = key(input);
  const matches = (label) => !query || key(label).includes(query);
  const inRoutine = new Set(used);
  const stepNames = new Set(steps.map((step) => key(step.label)));

  const fromSteps = steps
    .filter((step) => !inRoutine.has(step.id) && matches(step.label))
    .map((step) => ({ kind: 'step', id: step.id, label: step.label, icon: step.icon || '' }));

  // A routine's own chore is not a step to offer, and a chore already
  // in the library as a step is offered once, as the step.
  const seen = new Set();
  const fromChores = [];
  for (const chore of chores) {
    const name = key(chore.title);
    if (!name || chore.routine_id || stepNames.has(name) || seen.has(name)) continue;
    seen.add(name);
    if (matches(chore.title)) fromChores.push({ kind: 'chore', label: chore.title.trim().slice(0, 60), icon: chore.icon || '' });
  }
  fromChores.sort((a, b) => a.label.localeCompare(b.label));

  if (!query) return [{ kind: 'create', label: '', icon: '' }, ...fromSteps, ...fromChores];

  const known = stepNames.has(query) || seen.has(query);
  const create = known ? [] : [{ kind: 'create', label: input.trim().slice(0, 60), icon: '' }];

  return [...fromSteps, ...fromChores, ...create];
}
