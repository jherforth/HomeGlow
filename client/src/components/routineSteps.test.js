import { describe, it, expect } from 'vitest';
import { routineCardView, tickRemainingSteps, tickRemainingStepsOrThrow } from './RoutineSteps.jsx';

const open = { completed: false, steps: [{ id: 1 }, { id: 2 }], done: [1] };
const fresh = { completed: false, steps: [{ id: 1 }, { id: 2 }], done: [] };
const finished = { completed: true, steps: [{ id: 1 }, { id: 2 }], done: [1, 2] };

describe('routineCardView', () => {
  it('shows the steps while any is still to do, and the button completes them all', () => {
    expect(routineCardView(open)).toEqual({ finished: false, stepsShown: true, buttonActive: true, completeAll: true });
    // Opened earlier or not makes no difference: there is nothing to fold away.
    expect(routineCardView(open, true).stepsShown).toBe(true);
    expect(routineCardView(open, true).completeAll).toBe(true);
  });

  it('folds the steps away once finished, until a parent opens them', () => {
    expect(routineCardView(finished)).toEqual({ finished: true, stepsShown: false, buttonActive: true, completeAll: false });
    expect(routineCardView(finished, true)).toEqual({ finished: true, stepsShown: true, buttonActive: true, completeAll: false });
  });
});

describe('tickRemainingSteps', () => {
  // A stand-in for the widget's toggleStep: applies the tick and answers
  // with the new day, marking it completed once every step is done.
  const ticking = async (day, stepId, done) => {
    const nextDone = done ? [...day.done, stepId] : day.done.filter((id) => id !== stepId);
    return { ...day, done: nextDone, completed: nextDone.length === day.steps.length };
  };

  it('ticks only the remaining steps and finishes a partially-done routine', async () => {
    const calls = [];
    const toggleStep = async (day, stepId, done, opts) => {
      calls.push(stepId);
      return ticking(day, stepId, done, opts);
    };
    const after = await tickRemainingSteps(open, toggleStep);
    expect(calls).toEqual([2]);
    expect(after.done).toEqual([1, 2]);
    expect(after.completed).toBe(true);
  });

  it('ticks every step of a 0/N routine and finishes it', async () => {
    const calls = [];
    const toggleStep = async (day, stepId, done) => {
      calls.push(stepId);
      return ticking(day, stepId, done);
    };
    const after = await tickRemainingSteps(fresh, toggleStep);
    expect(calls).toEqual([1, 2]);
    expect(after.completed).toBe(true);
  });

  it('does nothing when every step is already ticked', async () => {
    let calls = 0;
    const after = await tickRemainingSteps(finished, async () => { calls += 1; });
    expect(calls).toBe(0);
    expect(after).toBe(finished);
  });

  it('passes parent approval through to every tick', async () => {
    const seen = [];
    const toggleStep = async (day, stepId, done, opts) => {
      seen.push(opts);
      return ticking(day, stepId, done);
    };
    await tickRemainingSteps(fresh, toggleStep, { parentApproved: true });
    expect(seen).toEqual([{ parentApproved: true }, { parentApproved: true }]);
  });

  it('stops and reports expired when the server refuses a tick', async () => {
    const calls = [];
    const toggleStep = async (day, stepId, done) => {
      calls.push(stepId);
      if (stepId === 2) return { expired: true };
      return ticking(day, stepId, done);
    };
    expect(await tickRemainingSteps(fresh, toggleStep)).toBe('expired');
    expect(calls).toEqual([1, 2]);
  });

  it('stops and reports false when a tick fails', async () => {
    const toggleStep = async () => null;
    expect(await tickRemainingSteps(fresh, toggleStep)).toBe(false);
  });
});

describe('tickRemainingStepsOrThrow', () => {
  // Same stand-in as above: applies the tick and marks the day completed
  // once every step is done.
  const ticking = async (day, stepId, done) => {
    const nextDone = done ? [...day.done, stepId] : day.done.filter((id) => id !== stepId);
    return { ...day, done: nextDone, completed: nextDone.length === day.steps.length };
  };

  it('finishes the routine and passes parent approval through', async () => {
    const seen = [];
    const toggleStep = async (day, stepId, done, opts) => {
      seen.push(opts);
      return ticking(day, stepId, done);
    };
    const after = await tickRemainingStepsOrThrow(fresh, toggleStep);
    expect(after.completed).toBe(true);
    expect(seen).toEqual([{ parentApproved: true }, { parentApproved: true }]);
  });

  it('throws Not approved when a tick fails, so the dialog shows approveFailed', async () => {
    const toggleStep = async () => null;
    await expect(tickRemainingStepsOrThrow(fresh, toggleStep)).rejects.toThrow('Not approved');
  });

  it('throws Not approved when the server refuses a tick past expiry', async () => {
    const toggleStep = async (day, stepId, done) => {
      if (stepId === 2) return { expired: true };
      return ticking(day, stepId, done);
    };
    await expect(tickRemainingStepsOrThrow(fresh, toggleStep)).rejects.toThrow('Not approved');
  });
});
