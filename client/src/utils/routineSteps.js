// Helpers for showing Routines-plugin checklists inline in the chore widget.
//
// The Routines plugin (plugin id "routines") stores its data in shared plugin
// storage, readable by core through /api/plugin/v1/storage/routines/<key>:
//   routines            [{ id, name, icon, userId, choreId, scheduleId, steps: [stepId], ... }]
//   library             [{ id, name }] — the shared step library
//   progress:<routineId> { "<YYYY-MM-DD>": { done: [stepId], at: <ISO|null> } }
//
// A chore schedule is routine-backed when a routine's scheduleId matches the
// schedule's id. Step ticks are written back to the same progress keys the
// plugin owns, so the plugin (which polls every minute) and the widget agree.

export const ROUTINES_PLUGIN_ID = 'routines';

/** Fetch the routines list, step library, and progress keys from plugin storage. */
export async function fetchRoutinesData(apiBase, httpGet) {
  const get = httpGet || ((url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }));
  const base = `${apiBase}/api/plugin/v1/storage/${ROUTINES_PLUGIN_ID}`;
  const [routines, library, allValues] = await Promise.all([
    get(`${base}/routines`).catch(() => []),
    get(`${base}/library`).catch(() => []),
    // The plugin-scoped index returns { key: value }; fall back to empty.
    get(base).catch(() => ({})),
  ]);
  const progressKeys = Object.keys(allValues || {})
    .filter((k) => typeof k === 'string' && k.startsWith('progress:'));
  const progressEntries = await Promise.all(
    progressKeys.map((k) => get(`${base}/${encodeURIComponent(k)}`)
      .then((v) => [k.slice('progress:'.length), v || {}])
      .catch(() => [k.slice('progress:'.length), {}]))
  );
  return {
    routines: Array.isArray(routines) ? routines : [],
    library: Array.isArray(library) ? library : [],
    progress: Object.fromEntries(progressEntries),
  };
}

/** Find the routine backing a chore schedule, if any.
 * Matches by scheduleId; falls back to choreId for routines created before
 * scheduleId was stored. */
export function routineForSchedule(routines, schedule) {
  if (!Array.isArray(routines) || !schedule) return null;
  const sid = Number(schedule.id);
  const cid = Number(schedule.chore_id);
  // Prefer an exact scheduleId match; fall back to choreId for routines
  // created before scheduleId was stored.
  if (Number.isFinite(sid)) {
    const bySchedule = routines.find((r) => Number(r.scheduleId) === sid);
    if (bySchedule) return bySchedule;
  }
  if (Number.isFinite(cid)) {
    const byChore = routines.find((r) =>
      (r.scheduleId === undefined || r.scheduleId === null) && Number(r.choreId) === cid);
    if (byChore) return byChore;
  }
  return null;
}

/** Resolve a routine's step ids to display names via the library.
 * Library entries carry the display text in `label` (older exports may use
 * `name`); fall back to the raw id when the step is unknown. */
export function routineStepNames(routine, library) {
  if (!routine || !Array.isArray(routine.steps)) return [];
  const byId = new Map((Array.isArray(library) ? library : []).map((s) => [s.id, s.label || s.name]));
  return routine.steps.map((id) => ({ id, name: byId.get(id) || String(id) }));
}

/** Step ids ticked for a routine on a date. */
export function doneStepIds(progress, routineId, date) {
  const day = progress?.[routineId]?.[date];
  return Array.isArray(day?.done) ? day.done : [];
}

/**
 * Pure step toggle. Returns { progress, allDone, wasAllDone } with a new
 * progress object — the caller persists it and completes the chore when
 * allDone flips true.
 */
export function toggleRoutineStep(progress, routine, stepId, date, nowIso) {
  const routineId = routine.id;
  const prev = progress?.[routineId]?.[date] || { done: [], at: null };
  const done = Array.isArray(prev.done) ? [...prev.done] : [];
  const idx = done.indexOf(stepId);
  if (idx === -1) done.push(stepId);
  else done.splice(idx, 1);

  const stepIds = Array.isArray(routine.steps) ? routine.steps : [];
  const wasAllDone = stepIds.length > 0 && stepIds.every((s) => (prev.done || []).includes(s));
  const allDone = stepIds.length > 0 && stepIds.every((s) => done.includes(s));

  return {
    progress: {
      ...(progress || {}),
      [routineId]: {
        ...(progress?.[routineId] || {}),
        [date]: { done, at: allDone ? (prev.at || nowIso) : null },
      },
    },
    allDone,
    wasAllDone,
  };
}

/** Serialize one routine's progress map for PUT to plugin storage. */
export function progressStorageKey(routineId) {
  return `progress:${routineId}`;
}
