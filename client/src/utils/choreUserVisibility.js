// Per-device visibility for the Chores widget columns.
//
// Ordering is global (users.sort_order, admin-controlled). Visibility is
// per-device: each display stores the *hidden* user ids in its
// choreWidgetSettings blob. Storing what is hidden (not what is shown) means a
// user added later appears everywhere by default instead of being invisible
// until someone opts them in on every display.

// Filter a user list by a hidden-id list, preserving input order.
//
// Coerces stored ids to numbers so a JSON round-trip that turned them into
// strings still matches, and drops any id that no longer resolves to a live
// user (defensive against a user deleted while still in a device's hidden
// list — the display should just show the survivors, never crash).
export const filterVisibleUsers = (users, hiddenUserIds) => {
  if (!Array.isArray(users)) return [];
  if (!Array.isArray(hiddenUserIds) || hiddenUserIds.length === 0) {
    return users.slice();
  }
  const hidden = new Set(hiddenUserIds.map((id) => Number(id)));
  return users.filter((user) => !hidden.has(Number(user?.id)));
};

// Toggle a user id in the hidden list. Returns a new array — never mutates
// the input, and normalizes stored ids to numbers so equality is consistent
// with filterVisibleUsers.
export const toggleHiddenUserId = (hiddenUserIds, userId) => {
  const id = Number(userId);
  const current = Array.isArray(hiddenUserIds)
    ? hiddenUserIds.map((entry) => Number(entry))
    : [];
  if (current.includes(id)) {
    return current.filter((entry) => entry !== id);
  }
  return [...current, id];
};

// Sanitize a stored hidden list against the live user set: drop non-numeric
// entries, drop ids that no longer resolve, and dedupe. Used before persisting
// so stale ids do not accumulate over time.
export const pruneHiddenUserIds = (hiddenUserIds, users) => {
  if (!Array.isArray(hiddenUserIds)) return [];
  const liveIds = new Set(
    (Array.isArray(users) ? users : []).map((user) => Number(user?.id))
  );
  const seen = new Set();
  const pruned = [];
  for (const entry of hiddenUserIds) {
    const id = Number(entry);
    if (!Number.isFinite(id)) continue;
    if (!liveIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    pruned.push(id);
  }
  return pruned;
};
