import { describe, expect, it } from 'vitest';
import { arrange, conditionMet, normalizeTakeovers, stepRules } from './takeovers.js';

const grill = { id: 'g', widget: 'plugin:Grill.html', entity: 'climate.pit_boss', op: 'is_not', state: 'off', level: 'high', place: 'bottom', seconds: 0 };
const door = { id: 'd', widget: 'plugin:ha-front-door.html', entity: 'binary_sensor.doorbell', op: 'is', state: 'on', level: 'urgent', place: 'bottom', seconds: 30 };

describe('normalizeTakeovers', () => {
  it('keeps whole rules and fills defaults', () => {
    const out = normalizeTakeovers([grill, { ...grill, id: 'g' }, { id: 'x', widget: '../etc', entity: 'a.b', state: 'on' }, { id: 'y', widget: 'calendar', entity: 'a.b', state: 'on', level: 'loud' }]);
    expect(out.map((r) => r.id)).toEqual(['g', 'y']);
    expect(out[1]).toMatchObject({ level: 'high', place: 'bottom', op: 'is', seconds: 0, enabled: true });
  });
});

describe('conditionMet', () => {
  it('is and is not, never on unknown', () => {
    expect(conditionMet(grill, { 'climate.pit_boss': { state: 'heat' } })).toBe(true);
    expect(conditionMet(grill, { 'climate.pit_boss': { state: 'off' } })).toBe(false);
    expect(conditionMet(grill, { 'climate.pit_boss': { state: 'unavailable' } })).toBe(false);
    expect(conditionMet(grill, {})).toBe(false);
  });
});

describe('stepRules', () => {
  it('starts when the condition turns on, and a timed one ends', () => {
    const rules = normalizeTakeovers([grill, door]);
    const on = { 'climate.pit_boss': { state: 'heat' }, 'binary_sensor.doorbell': { state: 'on' } };
    let step = stepRules(rules, on, {}, 1000);
    expect(step.live.map((x) => x.rule.id)).toEqual(['g', 'd']);
    step = stepRules(rules, on, step.memory, 31000);
    expect(step.live.map((x) => x.rule.id)).toEqual(['g']);
    // The bell again: off, then on, starts over.
    step = stepRules(rules, { ...on, 'binary_sensor.doorbell': { state: 'off' } }, step.memory, 32000);
    step = stepRules(rules, on, step.memory, 33000);
    expect(step.live.find((x) => x.rule.id === 'd').since).toBe(33000);
  });
});

describe('arrange', () => {
  const c = (key, level, place, since = 0) => ({ key, level, place, since });

  it('shares the screen, the less important one moving to the free half', () => {
    expect(arrange([c('grill', 'high', 'top'), c('door', 'urgent', 'top')])).toEqual({ full: null, top: 'door', bottom: 'grill', waiting: [] });
  });

  it('gives the whole screen to the most important, others wait', () => {
    expect(arrange([c('grill', 'urgent', 'full'), c('door', 'high', 'bottom')])).toEqual({ full: 'grill', top: null, bottom: null, waiting: ['door'] });
  });

  it('a full one that isn\'t first takes a half', () => {
    expect(arrange([c('grill', 'high', 'full'), c('door', 'urgent', 'bottom')])).toMatchObject({ bottom: 'door', top: 'grill' });
  });

  it('a third waits; pinned shows urgent only', () => {
    expect(arrange([c('a', 'normal', 'top'), c('b', 'normal', 'top', 1), c('x', 'normal', 'bottom', 2)]).waiting).toEqual(['x']);
    expect(arrange([c('a', 'high', 'top'), c('b', 'urgent', 'bottom')], { pinned: true })).toMatchObject({ top: null, bottom: 'b' });
  });
});
