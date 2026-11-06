import { describe, it, expect } from 'vitest';
import {
  MAX_FOLLOWUPS,
  defaultChoreForm,
  followupFormError,
  followupRowFromRule,
  followupRuleFromRow,
  newFollowupRow,
} from './choreFollowups.js';

// The admin console's New Chore dialog and the widget's Add Chore dialog
// are the same component (ChoreFormDialog.jsx); these are its form helpers.
// A follow-up row must survive the round trip to the server's minutes and
// back, and an invalid row must be caught before anything is saved.
describe('followup row <-> rule', () => {
  it('a row with no delay stores 0 minutes and reads back as "now"', () => {
    const row = { followup_chore_id: 5, user_ids: [1], timing: 'now', amount: 1, unit: 'hours' };
    expect(followupRuleFromRow(row)).toEqual({ followup_chore_id: 5, user_ids: [1], delay_minutes: 0 });
    expect(followupRowFromRule({ followup_chore_id: 5, user_ids: [1], delay_minutes: 0 })).toEqual(row);
  });

  it('whole hours round-trip as hours, odd minutes as minutes', () => {
    expect(followupRowFromRule({ followup_chore_id: 5, user_ids: [1], delay_minutes: 120 }))
      .toEqual({ followup_chore_id: 5, user_ids: [1], timing: 'after', amount: 2, unit: 'hours' });
    expect(followupRowFromRule({ followup_chore_id: 5, user_ids: [1], delay_minutes: 90 }))
      .toEqual({ followup_chore_id: 5, user_ids: [1], timing: 'after', amount: 90, unit: 'minutes' });
    expect(followupRuleFromRow({ followup_chore_id: 5, user_ids: [1], timing: 'after', amount: 2, unit: 'hours' }).delay_minutes).toBe(120);
    expect(followupRuleFromRow({ followup_chore_id: 5, user_ids: [1], timing: 'after', amount: 90, unit: 'minutes' }).delay_minutes).toBe(90);
  });

  it('a new row starts empty, untimed, with one hour', () => {
    expect(newFollowupRow()).toEqual({ followup_chore_id: '', user_ids: [], timing: 'now', amount: 1, unit: 'hours' });
    expect(MAX_FOLLOWUPS).toBe(3);
  });

  it('a new chore form starts blank with a zero clam value', () => {
    expect(defaultChoreForm).toEqual({ title: '', description: '', clam_value: 0, icon: '' });
  });
});

describe('followupFormError', () => {
  const valid = { followup_chore_id: 5, user_ids: [1, 2], timing: 'after', amount: 2, unit: 'hours' };

  it('no rows is fine', () => {
    expect(followupFormError([])).toBe('');
  });

  it('a valid row is fine', () => {
    expect(followupFormError([valid])).toBe('');
  });

  it('a row with no chore to give names the row', () => {
    expect(followupFormError([{ ...valid, followup_chore_id: '' }]))
      .toEqual({ key: 'chores:followups.errorChore', n: 1 });
  });

  it('a row with nobody to give it to names the row', () => {
    expect(followupFormError([{ ...valid, user_ids: [] }]))
      .toEqual({ key: 'chores:followups.errorPeople', n: 1 });
  });

  it('a delay of zero or over a week is not a delay', () => {
    expect(followupFormError([{ ...valid, amount: 0 }]))
      .toEqual({ key: 'chores:followups.errorDelay', n: 1 });
    expect(followupFormError([{ ...valid, amount: 200, unit: 'hours' }]))
      .toEqual({ key: 'chores:followups.errorDelay', n: 1 });
  });

  it('the first bad row is the one named', () => {
    expect(followupFormError([valid, { ...valid, followup_chore_id: '' }]))
      .toEqual({ key: 'chores:followups.errorChore', n: 2 });
  });
});
