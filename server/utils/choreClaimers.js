// Who may claim a bonus chore from the pool (issue #403).
//
// A schedule's `claim_user_ids` column holds a JSON list of user ids, or NULL
// for everyone. An empty list is stored as NULL: "no one may take it" is what
// hiding the schedule is for. A sticky chore's card (parent_schedule_id) has
// no list of its own and follows its parent's, so changing the schedule
// changes the card already on the dashboard.

/** The stored column as a list of user ids, or null for everyone. */
function parseClaimUserIds(stored) {
  if (stored === null || stored === undefined || stored === '') return null;
  let list = stored;
  if (typeof stored === 'string') {
    try { list = JSON.parse(stored); } catch { return null; }
  }
  if (!Array.isArray(list)) return null;
  const ids = [...new Set(list.filter((id) => Number.isInteger(id) && id > 0))];
  return ids.length ? ids : null;
}

/**
 * What a request sent as `claim_user_ids`, checked and ready to store.
 * `userExists(id)` says whether a user id is real. Returns `{ value }` (a
 * JSON string, or null for everyone) or `{ error }`.
 */
function normalizeClaimUserIds(raw, userExists) {
  if (raw === null || raw === undefined) return { value: null };
  if (!Array.isArray(raw)) return { error: 'claim_user_ids must be a list of user ids, or null for everyone.' };
  const ids = [];
  for (const entry of raw) {
    const id = typeof entry === 'string' && entry.trim() !== '' ? Number(entry) : entry;
    if (!Number.isInteger(id) || id <= 0) return { error: `Invalid user id in claim_user_ids: ${JSON.stringify(entry)}` };
    if (!userExists(id)) return { error: `Unknown user id in claim_user_ids: ${id}` };
    if (!ids.includes(id)) ids.push(id);
  }
  return { value: ids.length ? JSON.stringify(ids) : null };
}

/** Whether `userId` may claim a schedule whose stored list is `stored`. */
function mayClaim(stored, userId) {
  const ids = parseClaimUserIds(stored);
  return ids === null || ids.includes(Number(userId));
}

/** The stored list with `userId` taken out; null (everyone) once it is empty. */
function withoutUser(stored, userId) {
  const ids = parseClaimUserIds(stored);
  if (ids === null) return null;
  const left = ids.filter((id) => id !== Number(userId));
  return left.length ? JSON.stringify(left) : null;
}

module.exports = { parseClaimUserIds, normalizeClaimUserIds, mayClaim, withoutUser };
