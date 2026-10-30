import { describe, expect, it } from 'vitest';
import { routineStepOptions } from './routineStepOptions.js';

const steps = [
  { id: 1, label: 'Brush teeth', icon: '🪥' },
  { id: 2, label: 'Make bed', icon: '🛏️' },
];
const chores = [
  { id: 10, title: 'Feed the dog', icon: '🐕' },
  { id: 11, title: 'make bed', icon: '🛏️' },
  { id: 12, title: 'Morning', icon: '☀️', routine_id: 3 },
  { id: 13, title: 'Feed the dog', icon: '🐶' },
  { id: 14, title: 'Empty dishwasher', icon: null },
];
const labels = (options) => options.map((o) => `${o.kind}:${o.label}`);

describe('routineStepOptions', () => {
  it('lists unused steps, then chores, with no text typed', () => {
    expect(labels(routineStepOptions({ steps, used: [2], chores }))).toEqual([
      'step:Brush teeth',
      'chore:Empty dishwasher',
      'chore:Feed the dog',
    ]);
  });

  it('leaves out routine chores, chores named like a step, and repeat titles', () => {
    const kinds = routineStepOptions({ steps, chores }).filter((o) => o.kind === 'chore');
    expect(kinds.map((o) => o.label)).toEqual(['Empty dishwasher', 'Feed the dog']);
    expect(kinds[1].icon).toBe('🐕');
  });

  it('filters by the text, ignoring case', () => {
    expect(labels(routineStepOptions({ steps, chores, input: 'TEE' }))).toEqual(['step:Brush teeth', 'create:TEE']);
    expect(labels(routineStepOptions({ steps, chores, input: 'feed' }))).toEqual(['chore:Feed the dog', 'create:feed']);
  });

  it('offers Create only when the text names no step and no chore', () => {
    expect(labels(routineStepOptions({ steps, chores, input: ' brush teeth ' }))).toEqual(['step:Brush teeth']);
    expect(labels(routineStepOptions({ steps, chores, input: 'feed the dog' }))).toEqual(['chore:Feed the dog']);
    // A step already in the routine is still a step: no duplicate is offered.
    expect(labels(routineStepOptions({ steps, used: [1], chores, input: 'Brush teeth' }))).toEqual([]);
    expect(labels(routineStepOptions({ steps, chores, input: '  Feed fish ' }))).toEqual(['create:Feed fish']);
    expect(routineStepOptions({ steps, chores, input: '   ' }).some((o) => o.kind === 'create')).toBe(false);
  });

  it('caps a chore title or typed name at the step limit', () => {
    const long = 'x'.repeat(80);
    expect(routineStepOptions({ chores: [{ title: long }] })[0].label).toHaveLength(60);
    expect(routineStepOptions({ input: long })[0].label).toHaveLength(60);
  });
});
