import { describe, expect, it } from 'vitest';
import { conditionMet } from './haConditions.js';

describe('conditionMet', () => {
  const states = { 'switch.grill': { state: 'on' }, 'sensor.gone': { state: 'unavailable' } };
  it('reads is and is not', () => {
    expect(conditionMet({ entity: 'switch.grill', op: 'is', state: 'on' }, states)).toBe(true);
    expect(conditionMet({ entity: 'switch.grill', op: 'is_not', state: 'off' }, states)).toBe(true);
    expect(conditionMet({ entity: 'switch.grill', op: 'is', state: 'off' }, states)).toBe(false);
  });
  it('never counts a state it does not know', () => {
    expect(conditionMet({ entity: 'sensor.gone', op: 'is_not', state: 'on' }, states)).toBe(false);
    expect(conditionMet({ entity: 'sensor.none', op: 'is_not', state: 'on' }, states)).toBe(false);
    expect(conditionMet({ entity: 'switch.grill', op: 'is', state: 'on' }, null)).toBe(false);
  });
});
