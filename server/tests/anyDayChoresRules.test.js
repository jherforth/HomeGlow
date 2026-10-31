// The period rules for "any day" chores (services/anyDayChores.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { weekStartOf, weekEndOf, periodOf, anyDayChildDueOn, normalizeAnyDay, STICKY_DURATIONS } = require('../services/anyDayChores');

test('a week runs Sunday to Saturday, from any day in it', () => {
  // 2026-11-01 is a Sunday.
  for (const day of ['2026-11-01', '2026-11-04', '2026-11-07']) {
    assert.equal(weekStartOf(day), '2026-11-01', day);
    assert.equal(weekEndOf(day), '2026-11-07', day);
    assert.deepEqual(periodOf(day, '1w'), { start: '2026-11-01', end: '2026-11-07' });
  }
  assert.equal(weekEndOf('2026-12-30'), '2027-01-02');
  assert.equal(weekStartOf('2027-01-01'), '2026-12-27');
});

test('two weeks run from the week the schedule was made', () => {
  const anchor = '2026-11-04'; // its week starts Sunday 2026-11-01
  assert.deepEqual(periodOf('2026-11-01', '2w', anchor), { start: '2026-11-01', end: '2026-11-14' });
  assert.deepEqual(periodOf('2026-11-14', '2w', anchor), { start: '2026-11-01', end: '2026-11-14' });
  assert.deepEqual(periodOf('2026-11-15', '2w', anchor), { start: '2026-11-15', end: '2026-11-28' });
  assert.deepEqual(periodOf('2026-12-30', '2w', anchor), { start: '2026-12-27', end: '2027-01-09' });
});

test('months, quarters, halves and years follow the calendar', () => {
  assert.deepEqual(periodOf('2026-02-10', '1m'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodOf('2028-02-10', '1m'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(periodOf('2026-11-30', '3m'), { start: '2026-10-01', end: '2026-12-31' });
  assert.deepEqual(periodOf('2026-01-01', '3m'), { start: '2026-01-01', end: '2026-03-31' });
  assert.deepEqual(periodOf('2026-07-15', '6m'), { start: '2026-07-01', end: '2026-12-31' });
  assert.deepEqual(periodOf('2026-06-30', '6m'), { start: '2026-01-01', end: '2026-06-30' });
  assert.deepEqual(periodOf('2026-10-31', '1y'), { start: '2026-01-01', end: '2026-12-31' });
});

test("an any-day chore's card is due on its last day only", () => {
  const card = { due_date: '2026-11-07' };
  assert.equal(anyDayChildDueOn(card, '2026-11-02'), false);
  assert.equal(anyDayChildDueOn(card, '2026-11-07'), true);
  assert.equal(anyDayChildDueOn({ due_date: null }, '2026-11-02'), true);
});

test('"weekly" is an any-day chore once a week; any-day defaults to a week', () => {
  assert.deepEqual(normalizeAnyDay('weekly', null), { duration: 'any-day', interval: '1w' });
  assert.deepEqual(normalizeAnyDay('any-day', null), { duration: 'any-day', interval: '1w' });
  assert.deepEqual(normalizeAnyDay('any-day', '3m'), { duration: 'any-day', interval: '3m' });
  assert.deepEqual(normalizeAnyDay('once-completed', '2w'), { duration: 'once-completed', interval: '2w' });
  assert.deepEqual(STICKY_DURATIONS, ['until-completed', 'once-completed', 'any-day']);
});
