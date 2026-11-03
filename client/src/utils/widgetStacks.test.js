import { describe, expect, it } from 'vitest';
import { attentionWidget, flickDirection, normalizeStacks, stackInMode, stackWith, withModeSetting } from './widgetStacks.js';

describe('normalizeStacks', () => {
  it('keeps whole stacks, drops bad members and rules', () => {
    const out = normalizeStacks({
      stacks: [
        { id: 'abcd1234', widgets: ['calendar', 'plugin:Grill.html', 'calendar', '../x', 'stack:nested'], attention: [{ widget: 'plugin:Grill.html', entity: 'climate.pit', op: 'is_not', state: 'off' }, { widget: 'weather', entity: 'a.b', state: 'on' }] },
        { id: 'empty0000', widgets: [] },
        { id: 'BAD!' , widgets: ['calendar'] },
      ],
    });
    expect(out.stacks).toHaveLength(1);
    expect(out.stacks[0]).toMatchObject({ widgets: ['calendar', 'plugin:Grill.html'], returnSeconds: 60 });
    expect(out.stacks[0].attention).toEqual([{ widget: 'plugin:Grill.html', entity: 'climate.pit', op: 'is_not', state: 'off' }]);
  });
});

describe('attentionWidget', () => {
  const stack = normalizeStacks({ stacks: [{ id: 'abcd1234', widgets: ['calendar', 'plugin:Vac.html', 'plugin:Grill.html'], attention: [
    { widget: 'plugin:Grill.html', entity: 'climate.pit', op: 'is_not', state: 'off' },
    { widget: 'plugin:Vac.html', entity: 'vacuum.robo', state: 'cleaning' },
  ] }] }).stacks[0];

  it('jumps to the first in stack order that needs attention', () => {
    expect(attentionWidget(stack, { 'climate.pit': { state: 'heat' }, 'vacuum.robo': { state: 'cleaning' } })).toBe('plugin:Vac.html');
    expect(attentionWidget(stack, { 'climate.pit': { state: 'heat' }, 'vacuum.robo': { state: 'docked' } })).toBe('plugin:Grill.html');
    expect(attentionWidget(stack, { 'climate.pit': { state: 'off' } })).toBeNull();
    expect(attentionWidget(stack, null)).toBeNull();
  });
});

describe('flickDirection', () => {
  const at = (x, y, t) => ({ x, y, t });
  it('counts quick sideways flicks only', () => {
    expect(flickDirection(at(400, 300, 0), at(300, 310, 200))).toBe(1);
    expect(flickDirection(at(300, 300, 0), at(400, 290, 200))).toBe(-1);
    expect(flickDirection(at(400, 300, 0), at(300, 300, 600))).toBe(0); // slow drag
    expect(flickDirection(at(400, 300, 0), at(360, 300, 100))).toBe(0); // too short
    expect(flickDirection(at(400, 300, 0), at(320, 360, 100))).toBe(0); // too steep
  });
});

describe('stackWith', () => {
  it('makes a stack with the target first, or adds to one', () => {
    const made = stackWith('calendar', 'plugin:Grill.html');
    expect(made.widgets).toEqual(['calendar', 'plugin:Grill.html']);
    expect(stackWith(null, 'weather', made).widgets).toEqual(['calendar', 'plugin:Grill.html', 'weather']);
  });
});

describe('stacks in modes', () => {
  const base = normalizeStacks({ stacks: [{
    id: 'abcd1234',
    widgets: ['calendar', 'weather', 'plugin:Grill.html'],
    returnSeconds: 60,
    attention: [{ widget: 'plugin:Grill.html', entity: 'climate.pit', op: 'is_not', state: 'off' }],
    modes: {
      morning: { first: 'weather', returnSeconds: 30 },
      night: { widgets: ['calendar', 'plugin:Grill.html'], noJump: true, rotateSeconds: 20 },
      junk: { first: 'nope', widgets: ['nope'] },
      'bad id!': { first: 'weather' },
    },
  }] }).stacks[0];

  it('keeps only real changes', () => {
    expect(Object.keys(base.modes)).toEqual(['morning', 'night']);
    expect(base.modes.night).toEqual({ widgets: ['calendar', 'plugin:Grill.html'], noJump: true, rotateSeconds: 20 });
  });

  it('is as usual with no mode or a mode it has nothing for', () => {
    for (const id of [null, 'evening']) {
      const out = stackInMode(base, id);
      expect(out).toMatchObject({ widgets: base.widgets, first: 'calendar', returnSeconds: 60, rotateSeconds: 0 });
      expect(out.attention).toHaveLength(1);
    }
  });

  it('uses the mode: first widget, members, go-back time, no jumping, rotate', () => {
    expect(stackInMode(base, 'morning')).toMatchObject({ first: 'weather', returnSeconds: 30, rotateSeconds: 0 });
    const night = stackInMode(base, 'night');
    expect(night.widgets).toEqual(['calendar', 'plugin:Grill.html']);
    expect(night.attention).toEqual([]);
    expect(night.rotateSeconds).toBe(20);
  });

  it('sets and clears a mode', () => {
    const set = withModeSetting(base, 'evening', { first: 'plugin:Grill.html' });
    expect(set.modes.evening).toEqual({ first: 'plugin:Grill.html' });
    expect(withModeSetting(set, 'evening', { first: 'calendar' }).modes.evening).toBeUndefined();
    expect(withModeSetting(set, 'evening', null).modes.evening).toBeUndefined();
  });
});
