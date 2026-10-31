import { describe, expect, it } from 'vitest';
import { choreMatches, historyRowIsFor, routineIsFor, routineMatch, scheduleMatches, splitMatch, textMatches, validPerson } from './choresPageSearch.js';

const steps = [{ id: 1, label: 'Brush Teeth' }, { id: 2, label: 'Make Bed' }];
const morning = { id: 7, name: 'School-day Morning', user_id: 3, steps: [1, 2] };

describe('choresPageSearch', () => {
  it('matches text ignoring case and outer spaces; nothing typed matches everything', () => {
    expect(textMatches('Brush Teeth', ' TEE ')).toBe(true);
    expect(textMatches('Brush Teeth', 'bed')).toBe(false);
    expect(textMatches('Brush Teeth', '   ')).toBe(true);
  });

  it('a chore matches on its title or description', () => {
    expect(choreMatches({ title: 'Wash Hair', description: 'with shampoo' }, 'hair')).toBe(true);
    expect(choreMatches({ title: 'Wash Hair', description: 'with shampoo' }, 'SHAM')).toBe(true);
    expect(choreMatches({ title: 'Wash Hair' }, 'car')).toBe(false);
    expect(choreMatches({ title: 'Wash Hair' }, '')).toBe(true);
  });

  it('a routine matches on its name, or on a step and says which', () => {
    expect(routineMatch(morning, steps, 'morning')).toEqual({ matches: true, step: null });
    expect(routineMatch(morning, steps, 'teeth')).toEqual({ matches: true, step: 'Brush Teeth' });
    expect(routineMatch(morning, steps, 'trumpet')).toEqual({ matches: false, step: null });
    expect(routineMatch(morning, steps, '')).toEqual({ matches: true, step: null });
  });

  it('a step in the library but not in the routine is no match', () => {
    expect(routineMatch({ ...morning, steps: [2] }, steps, 'teeth').matches).toBe(false);
  });

  it('a schedule matches on its title, and a routine\'s on its steps too', () => {
    expect(scheduleMatches({ title: 'Wash Hair' }, [morning], steps, 'hair')).toBe(true);
    expect(scheduleMatches({ title: 'Wash Hair' }, [morning], steps, 'teeth')).toBe(false);
    expect(scheduleMatches({ title: 'School-day Morning', routine: { id: 7 } }, [morning], steps, 'teeth')).toBe(true);
    expect(scheduleMatches({ title: 'School-day Morning', routine: { id: 99 } }, [morning], steps, 'teeth')).toBe(false);
  });

  it('splits text around its first match, keeping its case', () => {
    expect(splitMatch('Brush Teeth', 'tee')).toEqual({ before: 'Brush ', match: 'Tee', after: 'th' });
    expect(splitMatch('Brush Teeth', 'bed')).toEqual({ before: 'Brush Teeth', match: '', after: '' });
    expect(splitMatch('Brush Teeth', '')).toEqual({ before: 'Brush Teeth', match: '', after: '' });
    // A letter whose lowercase is longer doesn't shift the mark.
    expect(splitMatch('İpek Teeth', 'teeth')).toEqual({ before: 'İpek ', match: 'Teeth', after: '' });
    // A search for punctuation is only text.
    expect(splitMatch('Feed (dog)', '(d')).toEqual({ before: 'Feed ', match: '(d', after: 'og)' });
  });

  it('keeps a chip that still names someone, else falls back to all', () => {
    const users = [{ id: 3 }];
    expect(validPerson('3', users)).toBe('3');
    expect(validPerson(3, users)).toBe('3');
    expect(validPerson('9', users)).toBe('all');
    expect(validPerson('all', users)).toBe('all');
    expect(validPerson('bonus', users)).toBe('bonus');
    expect(validPerson(null, users)).toBe('all');
  });

  it('a routine belongs to one person; the bonus chip has none', () => {
    expect(routineIsFor(morning, 'all')).toBe(true);
    expect(routineIsFor(morning, '3')).toBe(true);
    expect(routineIsFor(morning, '4')).toBe(false);
    expect(routineIsFor(morning, 'bonus')).toBe(false);
  });
});

describe('scheduleMatches', () => {
  it('matches the description a row shows, once something is typed', () => {
    const schedule = { title: 'Wash Hair', description: 'with shampoo' };
    expect(scheduleMatches(schedule, [], [], 'shampoo')).toBe(true);
    expect(scheduleMatches(schedule, [], [], 'soap')).toBe(false);
  });
});

describe('historyRowIsFor', () => {
  const row = { user_id: 3, kind: 'completion', clam_value: 2 };
  it('follows the chips: all, a person, or a bonus chore whoever did it', () => {
    expect(historyRowIsFor(row, 'all')).toBe(true);
    expect(historyRowIsFor(row, '3')).toBe(true);
    expect(historyRowIsFor(row, '4')).toBe(false);
    expect(historyRowIsFor(row, 'bonus')).toBe(true);
    expect(historyRowIsFor({ ...row, clam_value: 0 }, 'bonus')).toBe(false);
    expect(historyRowIsFor({ ...row, kind: 'daily_bonus' }, 'bonus')).toBe(false);
  });
});
