// Who a bonus chore is offered to (issue #403).
//
// A chore's `claim_user_ids` column holds a JSON list of user ids:
//   NULL     everyone, which is how every chore behaved before;
//   '[]'     nobody: the people it was for have all been deleted, and it
//            waits for an admin to pick again rather than opening up to
//            everyone;
//   '[3,4]'  those people only.
// The list belongs to the chore, so every schedule of it, and a sticky
// chore's card, follows it. It limits what is done from the dashboard:
// claiming from the pool and transferring to someone. An admin assigning the
// chore by hand is not held to it.

/** The stored column as a list of user ids, or null for everyone. */
function parseClaimUserIds(stored) {
  if (stored === null || stored === undefined || stored === '') return null;
  let list = stored;
  if (typeof stored === 'string') {
    try { list = JSON.parse(stored); } catch { return null; }
  }
  if (!Array.isArray(list)) return null;
  return [...new Set(list.filter((id) => Number.isInteger(id) && id > 0))];
}

/**
 * What a request sent as `claim_user_ids`, checked and ready to store.
 * `userExists(id)` says whether a user id is real. Returns `{ value }` (a
 * JSON string, or null for everyone) or `{ error }`. An empty list is
 * nobody, as it is stored.
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
  return { value: JSON.stringify(ids) };
}

/** Whether a chore whose stored list is `stored` is offered to `userId`. */
function mayClaim(stored, userId) {
  const ids = parseClaimUserIds(stored);
  return ids === null || ids.includes(Number(userId));
}

/**
 * The stored list with `userId` taken out. A list left empty stays a list:
 * nobody, not everyone.
 */
function withoutUser(stored, userId) {
  const ids = parseClaimUserIds(stored);
  if (ids === null) return null;
  return JSON.stringify(ids.filter((id) => id !== Number(userId)));
}

module.exports = { parseClaimUserIds, normalizeClaimUserIds, mayClaim, withoutUser };
