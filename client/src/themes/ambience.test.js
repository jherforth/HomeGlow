import { describe, it, expect } from 'vitest';
import { AMBIENCE_EFFECT_NAMES } from './ambience.jsx';
import { AMBIENCE_SCHEMA, BUILT_IN_THEMES } from '../utils/themes.js';

describe('ambience', () => {
  it('has a component for every effect a theme may name, and no others', () => {
    expect([...AMBIENCE_EFFECT_NAMES].sort()).toEqual(Object.keys(AMBIENCE_SCHEMA).sort());
  });

  it('built-in themes only name built-in effects', () => {
    const named = BUILT_IN_THEMES.flatMap((theme) => (theme.ambience || []).map((entry) => entry.effect));
    expect(named.filter((effect) => !AMBIENCE_EFFECT_NAMES.includes(effect))).toEqual([]);
  });
});
