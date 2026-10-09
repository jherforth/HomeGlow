import { describe, expect, it } from 'vitest';
import {
  categoryOf, choreKey, filterOptions, filterRows, groupRows, rangeStart, sortRows,
} from './choreHistoryView.js';

let nextId = 1;
const row = (fields) => ({
  id: nextId++, user_id: 1, username: 'Ana', chore_id: 10, title: 'Feed the cat',
  kind: 'completion', clam_value: 0, date: '2026-10-01', created_at: '2026-10-01T18:00:00Z', ...fields,
});

const ana = { user_id: 1, username: 'Ana' };
const ben = { user_id: 2, username: 'Ben' };
const cat = { chore_id: 10, title: 'Feed the cat' };
const dishes = { chore_id: 11, title: 'Dishes' };

describe('chore history view', () => {
  it('starts a range so that it holds that many days, today included', () => {
    const today = new Date(2026, 9, 8);
    expect(rangeStart('7', today)).toBe('2026-10-02');
    expect(rangeStart('30', today)).toBe('2026-09-09');
    expect(rangeStart('90', new Date(2026, 0, 15))).toBe('2025-10-18');
    expect(rangeStart('all', today)).toBeNull();
  });

  it('files each kind under the category the view shows', () => {
    expect(['completion', 'missed', 'daily_bonus', 'transfer_bonus', 'adjustment', 'spent']
      .map((kind) => categoryOf({ kind }))).toEqual(['done', 'missed', 'bonus', 'bonus', 'adjustment', 'adjustment']);
  });

  it('knows a chore by its id, and by its title once the schedule is gone', () => {
    expect(choreKey({ chore_id: 10, title: 'Feed the cat' })).toBe('chore:10');
    expect(choreKey({ chore_id: 10, title: 'Feed the kitten' })).toBe('chore:10');
    expect(choreKey({ chore_id: null, title: 'Feed the cat' })).toBe('title:Feed the cat');
  });

  it('lists people and chores once each, a renamed chore under its newest name', () => {
    const rows = [
      row({ ...ana, ...cat, title: 'Feed cat', date: '2026-09-01' }),
      row({ ...ben, ...cat, date: '2026-10-01' }),
      row({ ...ana, ...dishes }),
      row({ ...ana, chore_id: null, title: 'Old chore' }),
    ];
    const { people, chores } = filterOptions(rows);
    expect(people).toEqual([{ key: 'person:1', label: 'Ana' }, { key: 'person:2', label: 'Ben' }]);
    expect(chores.map((c) => c.label)).toEqual(['Dishes', 'Feed the cat', 'Old chore']);
  });

  it('filters by person, chore and category, with missed on its own switch', () => {
    const rows = [
      row({ ...ana, ...cat }),
      row({ ...ana, ...cat, kind: 'missed' }),
      row({ ...ben, ...cat }),
      row({ ...ana, ...dishes }),
      row({ ...ana, chore_id: null, title: 'Regular chores', kind: 'daily_bonus', clam_value: 2 }),
    ];
    expect(filterRows(rows)).toHaveLength(5);
    expect(filterRows(rows, { person: 'person:1', chore: 'chore:10' }).map((r) => r.kind)).toEqual(['completion', 'missed']);
    expect(filterRows(rows, { person: 'person:1', chore: 'chore:10', showMissed: false }).map((r) => r.kind)).toEqual(['completion']);
    expect(filterRows(rows, { categories: ['bonus'], showMissed: false }).map((r) => r.kind)).toEqual(['daily_bonus']);
  });

  it('sorts by each column, newest first on a tie', () => {
    const older = row({ ...ben, date: '2026-09-01', clam_value: 5 });
    const newer = row({ ...ana, date: '2026-10-01', clam_value: 1 });
    const newerSameDay = row({ ...ana, date: '2026-10-01', created_at: '2026-10-01T20:00:00Z', clam_value: 1 });
    const rows = [older, newer, newerSameDay];
    expect(sortRows(rows)).toEqual([newerSameDay, newer, older]);
    expect(sortRows(rows, { by: 'date', direction: 'asc' })).toEqual([older, newer, newerSameDay]);
    expect(sortRows(rows, { by: 'person', direction: 'asc' })).toEqual([newerSameDay, newer, older]);
    expect(sortRows(rows, { by: 'clams', direction: 'desc' })).toEqual([older, newerSameDay, newer]);
  });

  it('answers "the last 5 times Ana fed the cat"', () => {
    const rows = [
      ...[1, 2, 3, 4, 5, 6, 7].map((day) => row({ ...ana, ...cat, date: `2026-10-0${day}` })),
      row({ ...ana, ...cat, kind: 'missed', date: '2026-09-30' }),
      row({ ...ben, ...cat, date: '2026-10-08' }),
      row({ ...ana, ...dishes, date: '2026-10-02' }),
    ];
    const groups = groupRows(sortRows(filterRows(rows)), 'personChore');
    expect(groups.map((g) => `${g.person}/${g.chore}`)).toEqual(['Ben/Feed the cat', 'Ana/Feed the cat', 'Ana/Dishes']);
    const anaCat = groups[1];
    expect(anaCat.done).toBe(7);
    expect(anaCat.missed).toBe(1);
    expect(anaCat.lastDate).toBe('2026-10-07');
    expect(anaCat.rows.slice(0, 5).map((r) => r.date)).toEqual(
      ['2026-10-07', '2026-10-06', '2026-10-05', '2026-10-04', '2026-10-03']);
  });

  it('totals clams per group and labels a group by its newest row', () => {
    const rows = [
      row({ ...ana, ...cat, title: 'Feed cat', date: '2026-09-01', clam_value: 1 }),
      row({ ...ana, ...cat, date: '2026-10-01', clam_value: 2 }),
      row({ ...ben, ...cat, date: '2026-09-15', clam_value: 4 }),
    ];
    const byChore = groupRows(rows, 'chore');
    expect(byChore).toHaveLength(1);
    expect(byChore[0]).toMatchObject({ chore: 'Feed the cat', person: null, clams: 7, done: 3 });
    expect(groupRows(rows, 'person').map((g) => [g.person, g.chore, g.clams])).toEqual([['Ana', null, 3], ['Ben', null, 4]]);
    expect(groupRows(rows, 'none')).toEqual([]);
  });
});
