// A Stack and the widgets shown in it, on one tab, change together.
//
// A tab's layout map holds one entry per widget: its place and its per-tab
// settings (Weather's location, the calendar's view). A widget shown in a
// Stack keeps its entry, marked `in_stack` with the Stack's id. These helpers
// work on the maps only (no database), so a route can apply them in one
// transaction: the display never sees a Stack moved without its widgets, and
// a failure half way leaves nothing changed.

const stackKey = (stackId) => `stack:${stackId}`;
const STACK_ID = /^[a-z0-9]{4,24}$/;
const isStackId = (value) => typeof value === 'string' && STACK_ID.test(value);
const isEntry = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const MAX_MEMBERS = 12;
const memberNames = (members) => (Array.isArray(members) ? members : [])
  .filter((name) => typeof name === 'string' && name && name.length <= 200 && !name.startsWith('stack:'))
  .slice(0, MAX_MEMBERS);

/**
 * A Stack's widgets as saved in the device's settings (`widgetStacks`), or
 * null when there's no such Stack. The server goes by this, never by the
 * list a display sends, which can be out of date after an edit in Admin.
 */
function savedMembers(deviceSettings, stackId) {
  const stacks = deviceSettings?.widgetStacks?.stacks;
  const stack = Array.isArray(stacks) ? stacks.find((item) => item && item.id === stackId) : null;
  return stack ? memberNames(stack.widgets) : null;
}

/**
 * Move (or copy) a Stack from one tab's map to another's, with its widgets'
 * entries. `members` is the Stack's widgets. `layout` is where the Stack
 * lands (normalized by `normalize`), or null to be placed on arrival.
 * With `merge`, a Stack already on the target tab stays there (moved to
 * `layout` if given) and only the source side is taken away.
 * Returns { ok: true } or { ok: false, status, error }; on failure the maps
 * are untouched.
 */
function carryStack(sourceMap, targetMap, { stackId, members, copy = false, layout = null, merge = false }, normalize) {
  const key = stackKey(stackId);
  const entry = sourceMap[key];
  if (!isEntry(entry)) return { ok: false, status: 404, error: 'Assignment not found' };
  const already = isEntry(targetMap[key]);
  if (already && !merge) return { ok: false, status: 409, error: 'Widget is already on that tab' };

  if (already) {
    if (layout && typeof layout === 'object') targetMap[key] = { ...targetMap[key], ...normalize(layout) };
  } else {
    targetMap[key] = { ...entry, ...normalize(layout && typeof layout === 'object' ? layout : null) };
  }
  if (!copy) delete sourceMap[key];

  // A widget still marked for it here but no longer in it (taken out in
  // Admin, and that didn't fully save) shows on its own here: it stays,
  // just unmarked, rather than being carried off.
  unmarkStrays(sourceMap, stackId, members);
  memberNames(members).forEach((name) => {
    const here = sourceMap[name];
    const carried = isEntry(here) && here.in_stack === stackId;
    if (isEntry(targetMap[name])) {
      // On that tab already: it shows in the Stack there.
      if (targetMap[name].in_stack !== stackId) targetMap[name] = { ...targetMap[name], in_stack: stackId };
      if (!copy && carried) delete sourceMap[name];
    } else if (carried) {
      // Its settings come along; its old spot means nothing on another tab.
      targetMap[name] = { ...here, ...normalize(null), in_stack: stackId };
      if (!copy) delete sourceMap[name];
    } else {
      targetMap[name] = { ...normalize(null), in_stack: stackId };
    }
  });
  return { ok: true };
}

/**
 * Take a Stack off a tab with the widgets shown in it there. Returns the
 * entries taken ({ name: entry }), the Stack's first, so Undo can put every
 * one of them back exactly.
 */
function takeStack(map, stackId, members = null) {
  // Known widgets of it: one marked but no longer in it stays, unmarked.
  if (Array.isArray(members)) unmarkStrays(map, stackId, members);
  const removed = {};
  const key = stackKey(stackId);
  if (isEntry(map[key])) {
    removed[key] = map[key];
    delete map[key];
  }
  Object.keys(map).forEach((name) => {
    if (isEntry(map[name]) && map[name].in_stack === stackId) {
      removed[name] = map[name];
      delete map[name];
    }
  });
  return removed;
}

/** Entries marked for the Stack that aren't in `members`: unmarked in place. */
function unmarkStrays(map, stackId, members) {
  const keep = new Set(memberNames(members));
  Object.keys(map).forEach((name) => {
    if (keep.has(name) || !isEntry(map[name]) || map[name].in_stack !== stackId) return;
    const next = { ...map[name] };
    delete next.in_stack;
    map[name] = next;
  });
}

const LAYOUT_KEYS = new Set(['layout_x', 'layout_y', 'layout_w', 'layout_h', 'in_stack']);
/**
 * Whether an entry holds anything of the widget's own on this tab: a spot it
 * had, or per-tab settings. A blank one was only ever made for the Stack.
 */
const holdsSomething = (entry) => isEntry(entry) && (
  (entry.layout_x != null && entry.layout_w != null)
  || Object.keys(entry).some((key) => !LAYOUT_KEYS.has(key))
);

/** A widget leaving a Stack on this tab: back on its own when its entry holds something, else gone. */
function releaseOne(map, name) {
  if (holdsSomething(map[name])) {
    const next = { ...map[name] };
    delete next.in_stack;
    map[name] = next;
  } else {
    delete map[name];
  }
}

/**
 * Widgets taken out of a Stack on a tab (Admin): each one marked for it there
 * comes back on its own if its entry holds something (a spot, settings), and
 * goes if the entry was only made for the Stack. Returns the names changed.
 */
function release(map, stackId, names) {
  const changed = [];
  memberNames(names).forEach((name) => {
    if (!isEntry(map[name]) || map[name].in_stack !== stackId) return;
    releaseOne(map, name);
    changed.push(name);
  });
  return changed;
}

/**
 * Split a Stack on a tab back into its widgets: the Stack's entry goes, its
 * widgets' entries are unmarked (settings kept), a widget of it with no entry
 * here gets one, and `layouts` ([{ widget_name, layout_x, ... }]) place them.
 * With `dropBlank` (the Stack taken off the tab in Admin), only widgets with
 * something of their own here come back; blank entries go, none are added.
 */
function unstack(map, { stackId, members, layouts, dropBlank = false }, normalize) {
  delete map[stackKey(stackId)];
  Object.keys(map).forEach((name) => {
    if (!isEntry(map[name]) || map[name].in_stack !== stackId) return;
    if (dropBlank) {
      releaseOne(map, name);
    } else {
      const next = { ...map[name] };
      delete next.in_stack;
      map[name] = next;
    }
  });
  if (!dropBlank) {
    memberNames(members).forEach((name) => {
      if (!isEntry(map[name])) map[name] = { ...normalize(null) };
    });
  }
  (Array.isArray(layouts) ? layouts : []).forEach((item) => {
    const name = item?.widget_name;
    if (typeof name !== 'string' || !isEntry(map[name])) return;
    map[name] = { ...map[name], ...normalize(item) };
  });
}

/**
 * What a deleted tab hands to Home: each entry Home doesn't have, as a
 * position only (as before), but a widget shown in a Stack stays in it when
 * that Stack ends up on Home too, rather than showing twice.
 */
function entriesForHome(sourceMap, homeMap, normalize) {
  const added = {};
  Object.entries(sourceMap).forEach(([name, entry]) => {
    if (name in homeMap) return;
    added[name] = normalize(entry);
  });
  Object.entries(sourceMap).forEach(([name, entry]) => {
    if (!(name in added) || !isEntry(entry) || !entry.in_stack) return;
    const key = stackKey(entry.in_stack);
    if (key in homeMap || key in added) added[name] = { ...added[name], in_stack: entry.in_stack };
  });
  return added;
}

module.exports = { stackKey, isStackId, savedMembers, holdsSomething, carryStack, takeStack, release, unstack, entriesForHome };
