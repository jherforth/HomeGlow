const test = require('node:test');
const assert = require('node:assert/strict');
const { dedupeCalendarEvents, normalizeTitle, titleSimilarity } = require('../utils/calendarDedup');

const BASE = new Date('2026-07-10T15:00:00.000Z').getTime();

function ev(id, sourceId, sourceName, title, startOffsetMin = 0, durationMin = 60, sourceColor = null) {
  const start = new Date(BASE + startOffsetMin * 60000);
  const end = new Date(start.getTime() + durationMin * 60000);
  return { id, source_id: sourceId, source_name: sourceName, source_color: sourceColor, title, start, end };
}

test('normalizeTitle strips calendar prefix, punctuation, and case', () => {
  assert.equal(normalizeTitle('[Family] Soccer Practice!'), 'soccer practice');
  assert.equal(normalizeTitle('(Work)  Stand-up'), 'stand up');
  assert.equal(normalizeTitle(null), '');
});

test('titleSimilarity: containment and exact match score 1', () => {
  assert.equal(titleSimilarity('Soccer', 'Soccer practice'), 1);
  assert.equal(titleSimilarity('Dentist', 'dentist'), 1);
  assert.ok(titleSimilarity('Dentist', 'Soccer') < 0.3);
});

test('merges the same event across two different sources', () => {
  const events = [
    ev('a1', 1, 'Family ICS', 'Soccer practice'),
    ev('a2', 2, 'Google', 'Soccer Practice - City Fields', 2),
  ];
  const out = dedupeCalendarEvents(events);
  assert.equal(out.length, 1);
  assert.equal(out[0].source_id, 1, 'lowest source_id survives');
  assert.equal(out[0].title, 'Soccer practice');
  assert.deepEqual(out[0].merged_from, [{ source_id: 2, source_name: 'Google', source_color: null }]);
});

test('merged_from carries each absorbed source color for the pie dot (issue #125)', () => {
  const events = [
    ev('c1', 1, 'Family', 'Flight to Denver', 0, 60, '#6e44ff'),
    ev('c2', 2, 'Mom', 'Flight to Denver', 0, 60, '#e91e63'),
    ev('c3', 3, 'Dad', 'Flight to Denver', 0, 60, '#ff9800'),
  ];
  const out = dedupeCalendarEvents(events);
  assert.equal(out.length, 1);
  assert.equal(out[0].source_color, '#6e44ff', 'winning source color untouched');
  assert.deepEqual(
    out[0].merged_from.map((m) => m.source_color),
    ['#e91e63', '#ff9800']
  );
});

test('never merges two events from the same source', () => {
  const events = [
    ev('d1', 1, 'Family ICS', 'Dishes'),
    ev('d2', 1, 'Family ICS', 'Dishes'),
  ];
  const out = dedupeCalendarEvents(events);
  assert.equal(out.length, 2);
  assert.ok(!out.some((e) => e.merged_from));
});

test('does not merge same title at clearly different times', () => {
  const events = [
    ev('b1', 1, 'Family ICS', 'Dentist', 0),
    ev('c1', 2, 'Google', 'Dentist', 120), // 2 hours later
  ];
  const out = dedupeCalendarEvents(events);
  assert.equal(out.length, 2);
});

test('does not merge different events at the same time', () => {
  const events = [
    ev('x1', 1, 'Family ICS', 'Piano lesson'),
    ev('y1', 2, 'Google', 'Grocery run'),
  ];
  const out = dedupeCalendarEvents(events);
  assert.equal(out.length, 2);
});

test('merges a 3-source cluster into one survivor listing both others', () => {
  const events = [
    ev('t3', 3, 'Apple', 'Team meeting', 1),
    ev('t1', 1, 'Family ICS', 'Team meeting'),
    ev('t2', 2, 'Google', 'Team Meeting', 3),
  ];
  const out = dedupeCalendarEvents(events);
  assert.equal(out.length, 1);
  assert.equal(out[0].source_id, 1);
  assert.deepEqual(
    out[0].merged_from.map((m) => m.source_id),
    [2, 3]
  );
});

test('respects the time tolerance boundary', () => {
  const withinTol = [ev('w1', 1, 'A', 'Event'), ev('w2', 2, 'B', 'Event', 4)];
  assert.equal(dedupeCalendarEvents(withinTol).length, 1, '4 min apart merges');

  const outsideTol = [ev('o1', 1, 'A', 'Event'), ev('o2', 2, 'B', 'Event', 10)];
  assert.equal(dedupeCalendarEvents(outsideTol).length, 2, '10 min apart does not');
});

test('output stays sorted by start time and does not mutate input', () => {
  const events = [
    ev('late', 1, 'A', 'Late thing', 120),
    ev('early', 2, 'B', 'Early thing', 0),
  ];
  const snapshot = JSON.stringify(events);
  const out = dedupeCalendarEvents(events);
  assert.equal(out[0].id, 'early');
  assert.equal(out[1].id, 'late');
  assert.equal(JSON.stringify(events), snapshot, 'input array/objects unchanged');
});

test('passes through arrays of 0 or 1 event unchanged', () => {
  assert.deepEqual(dedupeCalendarEvents([]), []);
  const one = [ev('solo', 1, 'A', 'Solo')];
  assert.equal(dedupeCalendarEvents(one).length, 1);
});
