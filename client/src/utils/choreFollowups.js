// Follow-ups (issue #241): "when this is done, give that chore to them".
// The admin console's New Chore dialog and the widget's Add Chore dialog
// are the same component (ChoreFormDialog.jsx); these are its form helpers,
// kept pure so they can be tested without rendering the dialog.

export const defaultChoreForm = { title: '', description: '', clam_value: 0, icon: '' };

export const MAX_FOLLOWUPS = 3;

export const newFollowupRow = () => ({ followup_chore_id: '', user_ids: [], timing: 'now', amount: 1, unit: 'hours' });

// The server stores a delay in minutes; the form shows whole hours when it can.
export const followupRowFromRule = (rule) => {
  const minutes = rule.delay_minutes || 0;
  if (!minutes) return { followup_chore_id: rule.followup_chore_id, user_ids: rule.user_ids, timing: 'now', amount: 1, unit: 'hours' };
  const hours = minutes % 60 === 0;
  return {
    followup_chore_id: rule.followup_chore_id,
    user_ids: rule.user_ids,
    timing: 'after',
    amount: hours ? minutes / 60 : minutes,
    unit: hours ? 'hours' : 'minutes',
  };
};

export const followupRuleFromRow = (row) => ({
  followup_chore_id: row.followup_chore_id,
  user_ids: row.user_ids,
  delay_minutes: row.timing === 'after' ? Math.round(Number(row.amount) * (row.unit === 'hours' ? 60 : 1)) : 0,
});

// What the form can check before anything is saved; the server checks the
// rest (loops, people who no longer exist). Returns '' when the rows are
// fine, or { key, n } for the caller to translate.
export function followupFormError(rows) {
  for (const [index, row] of rows.entries()) {
    const n = index + 1;
    if (!row.followup_chore_id) return { key: 'chores:followups.errorChore', n };
    if (!row.user_ids.length) return { key: 'chores:followups.errorPeople', n };
    const minutes = followupRuleFromRow(row).delay_minutes;
    if (row.timing === 'after' && (!(minutes > 0) || minutes > 7 * 24 * 60)) return { key: 'chores:followups.errorDelay', n };
  }
  return '';
}
