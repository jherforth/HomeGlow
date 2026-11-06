const test = require('node:test');
const assert = require('node:assert/strict');
const { carryStack, takeStack, unstack, entriesForHome } = require('../utils/stackEntries');

const normalize = (layout) => {
  const n = (v) => (Number.isFinite(Number.parseInt(v, 10)) ? Number.parseInt(v, 10) : null);
  if (!layout || typeof layout !== 'object') return { layout_x: null, layout_y: null, layout_w: null, layout_h: null };
  return { layout_x: n(layout.layout_x), layout_y: n(layout.layout_y), layout_w: n(layout.layout_w), layout_h: n(layout.layout_h) };
};
const spot = (x, y, w, h) => ({ layout_x: x, layout_y: y, layout_w: w, layout_h: h });

const tabWithStack = () => ({
  'stack:abcd': spot(0, 0, 6, 4),
  weather: { ...spot(0, 0, 6, 4), in_stack: 'abcd', location: 'Chicago', units: 'metric' },
  calendar: { ...spot(6, 0, 6, 4), in_stack: 'abcd', view: 'week' },
  chores: spot(0, 4, 12, 3),
});

test('moving a Stack takes its widgets and their settings along, all at once', () => {
  const source = tabWithStack();
  const target = { photos: spot(0, 0, 12, 4) };
  const out = carryStack(source, target, { stackId: 'abcd', members: ['weather', 'calendar'], layout: spot(0, 4, 6, 4) }, normalize);
  assert.equal(out.ok, true);
  assert.deepEqual(Object.keys(source).sort(), ['chores'], 'nothing of the Stack is left behind to show on its own');
  assert.deepEqual(target['stack:abcd'], spot(0, 4, 6, 4));
  assert.equal(target.weather.location, 'Chicago');
  assert.equal(target.weather.units, 'metric');
  assert.equal(target.weather.in_stack, 'abcd');
  assert.equal(target.calendar.view, 'week');
  assert.equal(target.calendar.layout_x, null, 'an old spot means nothing on another tab');
});

test('copying a Stack copies its widgets, settings included, and leaves the original', () => {
  const source = tabWithStack();
  const before = JSON.parse(JSON.stringify(source));
  const target = {};
  assert.equal(carryStack(source, target, { stackId: 'abcd', members: ['weather', 'calendar'], copy: true }, normalize).ok, true);
  assert.deepEqual(source, before);
  assert.equal(target.weather.location, 'Chicago');
  assert.equal(target.weather.in_stack, 'abcd');
});

test('a widget already on the target tab goes into the Stack there; the moved one leaves', () => {
  const source = tabWithStack();
  const target = { weather: { ...spot(3, 3, 6, 4), location: 'Denver' } };
  carryStack(source, target, { stackId: 'abcd', members: ['weather', 'calendar'] }, normalize);
  assert.equal(target.weather.location, 'Denver', 'the target tab keeps its own settings');
  assert.equal(target.weather.in_stack, 'abcd');
  assert.equal('weather' in source, false);
});

test('a widget of the Stack with no entry anywhere gets a blank marked one', () => {
  const source = { 'stack:abcd': spot(0, 0, 6, 4) };
  const target = {};
  carryStack(source, target, { stackId: 'abcd', members: ['weather'] }, normalize);
  assert.deepEqual(target.weather, { ...normalize(null), in_stack: 'abcd' });
});

test('onto a tab that already has the Stack: refused, or merged when asked', () => {
  const source = tabWithStack();
  const target = { 'stack:abcd': spot(0, 0, 6, 4), weather: { ...spot(0, 0, 6, 4), in_stack: 'abcd' }, calendar: { in_stack: 'abcd' } };
  const before = JSON.parse(JSON.stringify({ source, target }));
  const refused = carryStack(source, target, { stackId: 'abcd', members: ['weather', 'calendar'] }, normalize);
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 409);
  assert.deepEqual({ source, target }, before, 'nothing changed');

  const merged = carryStack(source, target, { stackId: 'abcd', members: ['weather', 'calendar'], merge: true, layout: spot(6, 6, 6, 4) }, normalize);
  assert.equal(merged.ok, true);
  assert.deepEqual(Object.keys(source), ['chores'], 'the Stack and its widgets all left the old tab');
  assert.deepEqual(target['stack:abcd'], spot(6, 6, 6, 4));
});

test("a widget marked for a Stack it's no longer in stays put, unmarked", () => {
  const source = { ...tabWithStack(), chores: { ...spot(6, 0, 6, 4), in_stack: 'abcd', list: 'kids' } };
  const target = {};
  carryStack(source, target, { stackId: 'abcd', members: ['weather', 'calendar'] }, normalize);
  assert.deepEqual(source.chores, { ...spot(6, 0, 6, 4), list: 'kids' }, 'still shown where it was');
  assert.equal('chores' in target, false);

  const map = { ...tabWithStack(), chores: { ...spot(6, 0, 6, 4), in_stack: 'abcd' } };
  const removed = takeStack(map, 'abcd', ['weather', 'calendar']);
  assert.equal('chores' in removed, false);
  assert.deepEqual(map.chores, spot(6, 0, 6, 4));
});

test('removing a Stack takes exactly it and its marked widgets, and hands them back', () => {
  const map = { ...tabWithStack(), clock: { ...spot(0, 9, 4, 2), in_stack: 'zzzz' } };
  const removed = takeStack(map, 'abcd');
  assert.deepEqual(Object.keys(map).sort(), ['chores', 'clock']);
  assert.equal(removed.weather.location, 'Chicago');
  assert.equal(removed.calendar.view, 'week');
  assert.ok('stack:abcd' in removed);
});

test('unstacking unmarks, keeps settings, adds missing widgets and places them', () => {
  const map = tabWithStack();
  unstack(map, {
    stackId: 'abcd',
    members: ['weather', 'calendar', 'clock'],
    layouts: [{ widget_name: 'weather', ...spot(0, 0, 6, 4) }, { widget_name: 'nothere', ...spot(1, 1, 1, 1) }],
  }, normalize);
  assert.equal('stack:abcd' in map, false);
  assert.equal(map.weather.in_stack, undefined);
  assert.equal(map.weather.location, 'Chicago');
  assert.equal(map.calendar.in_stack, undefined);
  assert.deepEqual(map.clock, normalize(null));
  assert.equal('nothere' in map, false);
});

test('a deleted tab hands Home its Stack with the widgets still in it', () => {
  const home = { clock: spot(0, 0, 4, 2) };
  const added = entriesForHome(tabWithStack(), home, normalize);
  assert.equal(added.weather.in_stack, 'abcd');
  assert.equal(added.calendar.in_stack, 'abcd');
  assert.equal(added.chores.in_stack, undefined);
  assert.equal(added.weather.location, undefined, 'only positions travel to Home, as before');
});

test('a deleted tab whose Stack is already on Home: its widgets join the one there', () => {
  const home = { 'stack:abcd': spot(0, 0, 6, 4) };
  const added = entriesForHome(tabWithStack(), home, normalize);
  assert.equal('stack:abcd' in added, false);
  assert.equal(added.weather.in_stack, 'abcd');
});

test('a widget marked for a Stack that is nowhere on Home shows on its own there', () => {
  const source = { weather: { ...spot(0, 0, 6, 4), in_stack: 'gone' } };
  const added = entriesForHome(source, {}, normalize);
  assert.equal(added.weather.in_stack, undefined);
});

const { release, holdsSomething } = require('../utils/stackEntries');

test('taking widgets out of a Stack keeps those with a spot or settings, drops blank ones', () => {
  const map = {
    weather: { ...spot(0, 0, 6, 4), in_stack: 'abcd' },
    calendar: { ...normalize(null), in_stack: 'abcd', view: 'week' },
    clock: { ...normalize(null), in_stack: 'abcd' },
    chores: { ...spot(0, 4, 6, 4), in_stack: 'zzzz' },
  };
  const changed = release(map, 'abcd', ['weather', 'calendar', 'clock', 'chores', 'photos']);
  assert.deepEqual(changed.sort(), ['calendar', 'clock', 'weather']);
  assert.deepEqual(map.weather, spot(0, 0, 6, 4));
  assert.equal(map.calendar.view, 'week');
  assert.equal(map.calendar.in_stack, undefined);
  assert.equal('clock' in map, false, 'made only for the Stack: gone');
  assert.equal(map.chores.in_stack, 'zzzz', "another Stack's widget is left alone");
  assert.equal(holdsSomething({ ...normalize(null), in_stack: 'x' }), false);
});

test('a Stack taken off a tab in Admin: widgets with something of their own come back', () => {
  const map = { ...tabWithStack(), clock: { ...normalize(null), in_stack: 'abcd' } };
  unstack(map, { stackId: 'abcd', members: ['weather', 'calendar', 'clock', 'photos'], dropBlank: true }, normalize);
  assert.equal('stack:abcd' in map, false);
  assert.equal(map.weather.location, 'Chicago');
  assert.equal(map.weather.in_stack, undefined);
  assert.equal('clock' in map, false);
  assert.equal('photos' in map, false, 'nothing new is added');
});
