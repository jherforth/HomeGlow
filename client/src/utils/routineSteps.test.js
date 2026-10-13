import { describe, expect, it, vi } from 'vitest';
import {
  fetchRoutinesData,
  routineForSchedule,
  routineStepNames,
  doneStepIds,
  toggleRoutineStep,
  progressStorageKey,
} from './routineSteps.js';

const library = [
  { id: 's1', label: 'water' },
  { id: 's2', label: 'shorts' },
  { id: 's3', label: 'slides' },
];
const routine = {
  id: 'r1', name: 'Get ready for gymnastics', userId: 1,
  choreId: 126, scheduleId: 126, steps: ['s1', 's2', 's3'],
};

describe('routineForSchedule', () => {
  it('matches by scheduleId', () => {
    expect(routineForSchedule([routine], { id: 126, chore_id: 126 })).toBe(routine);
  });

  it('falls back to choreId when scheduleId is missing', () => {
    const legacy = { ...routine, scheduleId: undefined };
    expect(routineForSchedule([legacy], { id: 999, chore_id: 126 })).toBe(legacy);
  });

  it('prefers scheduleId over choreId fallback', () => {
    const legacy = { ...routine, id: 'legacy', scheduleId: undefined, choreId: 126 };
    const current = { ...routine, id: 'current', scheduleId: 999, choreId: 999 };
    expect(routineForSchedule([legacy, current], { id: 999, chore_id: 126 }).id).toBe('current');
  });

  it('returns null when nothing matches', () => {
    expect(routineForSchedule([routine], { id: 999, chore_id: 999 })).toBeNull();
    expect(routineForSchedule([], { id: 126, chore_id: 126 })).toBeNull();
    expect(routineForSchedule(null, { id: 126, chore_id: 126 })).toBeNull();
    expect(routineForSchedule([routine], null)).toBeNull();
  });
});

describe('routineStepNames', () => {
  it('resolves step ids through the library label', () => {
    expect(routineStepNames(routine, library)).toEqual([
      { id: 's1', name: 'water' },
      { id: 's2', name: 'shorts' },
      { id: 's3', name: 'slides' },
    ]);
  });

  it('accepts the legacy name field too', () => {
    expect(routineStepNames(routine, [{ id: 's1', name: 'water' }])[0]).toEqual({ id: 's1', name: 'water' });
  });

  it('falls back to the raw id for unknown steps', () => {
    expect(routineStepNames({ steps: ['nope'] }, library)).toEqual([{ id: 'nope', name: 'nope' }]);
  });

  it('handles missing data', () => {
    expect(routineStepNames(null, library)).toEqual([]);
    expect(routineStepNames({ steps: null }, library)).toEqual([]);
  });
});

describe('doneStepIds', () => {
  it('reads the day entry', () => {
    const progress = { r1: { '2026-10-12': { done: ['s1'], at: null } } };
    expect(doneStepIds(progress, 'r1', '2026-10-12')).toEqual(['s1']);
  });

  it('returns [] when nothing recorded', () => {
    expect(doneStepIds({}, 'r1', '2026-10-12')).toEqual([]);
    expect(doneStepIds(null, 'r1', '2026-10-12')).toEqual([]);
  });
});

describe('toggleRoutineStep', () => {
  const date = '2026-10-12';

  it('ticks a step on', () => {
    const { progress, allDone, wasAllDone } = toggleRoutineStep({}, routine, 's1', date, 'iso');
    expect(doneStepIds(progress, 'r1', date)).toEqual(['s1']);
    expect(allDone).toBe(false);
    expect(wasAllDone).toBe(false);
  });

  it('ticks a step off', () => {
    const start = { r1: { [date]: { done: ['s1', 's2'], at: null } } };
    const { progress } = toggleRoutineStep(start, routine, 's1', date, 'iso');
    expect(doneStepIds(progress, 'r1', date)).toEqual(['s2']);
  });

  it('detects the all-done transition', () => {
    const start = { r1: { [date]: { done: ['s1', 's2'], at: null } } };
    const { progress, allDone, wasAllDone } = toggleRoutineStep(start, routine, 's3', date, '2026-10-12T10:00:00Z');
    expect(allDone).toBe(true);
    expect(wasAllDone).toBe(false);
    expect(progress.r1[date].at).toBe('2026-10-12T10:00:00Z');
  });

  it('clears the timestamp when unticking below full', () => {
    const start = { r1: { [date]: { done: ['s1', 's2', 's3'], at: '2026-10-12T10:00:00Z' } } };
    const { progress, allDone } = toggleRoutineStep(start, routine, 's3', date, 'iso');
    expect(allDone).toBe(false);
    expect(progress.r1[date].at).toBeNull();
  });

  it('does not mutate the input', () => {
    const start = { r1: { [date]: { done: ['s1'], at: null } } };
    toggleRoutineStep(start, routine, 's2', date, 'iso');
    expect(start.r1[date].done).toEqual(['s1']);
  });
});

describe('fetchRoutinesData', () => {
  it('fetches routines, library, keys and progress', async () => {
    const httpGet = vi.fn(async (url) => {
      if (url === 'http://x/api/plugin/v1/storage/routines')
        return { routines: [routine], library, 'progress:r1': { '2026-10-12': { done: ['s1'], at: null } } };
      if (url.endsWith('/routines')) return [routine];
      if (url.endsWith('/library')) return library;
      if (url.includes('progress%3Ar1')) return { '2026-10-12': { done: ['s1'], at: null } };
      throw new Error('unexpected ' + url);
    });
    const data = await fetchRoutinesData('http://x', httpGet);
    expect(data.routines).toEqual([routine]);
    expect(data.library).toEqual(library);
    expect(data.progress.r1['2026-10-12'].done).toEqual(['s1']);
  });

  it('tolerates a missing plugin or empty storage', async () => {
    const httpGet = vi.fn(async () => { throw new Error('404'); });
    const data = await fetchRoutinesData('http://x', httpGet);
    expect(data).toEqual({ routines: [], library: [], progress: {} });
  });
});

describe('progressStorageKey', () => {
  it('namespaces by routine', () => {
    expect(progressStorageKey('r1')).toBe('progress:r1');
  });
});
