// The week rules for "once a week, any day" chores (services/weeklyChores.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { weekStartOf, weekEndOf, weeklyChildDueOn, STICKY_DURATIONS } = require('../services/weeklyChores');

test('a week runs Sunday to Saturday, from any day in it', () => {
  // 2026-11-01 is a Sunday.
  for (const day of ['2026-11-01', '2026-11-04', '2026-11-07']) {
    assert.equal(weekStartOf(day), '2026-11-01', day);
    assert.equal(weekEndOf(day), '2026-11-07', day);
  }
  assert.equal(weekStartOf('2026-11-08'), '2026-11-08');
  // Across a month and a year.
  assert.equal(weekEndOf('2026-12-30'), '2027-01-02');
  assert.equal(weekStartOf('2027-01-01'), '2026-12-27');
});

test("a weekly chore's card is due on its last day only", () => {
  const card = { due_date: '2026-11-07' };
  assert.equal(weeklyChildDueOn(card, '2026-11-02'), false);
  assert.equal(weeklyChildDueOn(card, '2026-11-06'), false);
  assert.equal(weeklyChildDueOn(card, '2026-11-07'), true);
  // Without a date, it counts as any one-time chore does.
  assert.equal(weeklyChildDueOn({ due_date: null }, '2026-11-02'), true);
});

test('weekly is one of the sticky durations', () => {
  assert.deepEqual(STICKY_DURATIONS, ['until-completed', 'once-completed', 'weekly']);
});
