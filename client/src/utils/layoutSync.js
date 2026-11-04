// react-grid-layout fires `onLayoutChange` whenever its children change, not
// only when a person drags or resizes something. Switching tabs swaps the whole
// child set, so the grid emits a layout for the *new* tab while the component's
// layout state still describes the *old* one — and saving that mixture writes
// one tab's arrangement over another's.
//
// The state and the tab it was built for must agree before a layout change can
// be trusted. `layoutTab` is the tab the current layout state was rebuilt for;
// it is null until the first rebuild completes.

export function shouldAcceptLayoutChange({ locked, layoutTab, activeTab }) {
  // A locked dashboard has no drag or resize affordances, so any layout event is
  // the grid reacting to something other than a person.
  if (locked) return false;

  // No layout has been built yet — nothing to compare an incoming change against.
  if (layoutTab === null || layoutTab === undefined) return false;

  // The layout state belongs to a different tab than the one now active: a tab
  // change is in flight and the rebuild has not landed. Anything the grid emits
  // here describes neither tab correctly.
  return layoutTab === activeTab;
}

// Same-tab refetch reconciliation (mirror jitter, 2026-11-03). A rebuild
// used to replace the live layout with server values unconditionally, so a
// settings bump landing between a resize click and its debounced save
// visibly snapped the widget to the older server position for ~300ms
// (reproduced on :3001: resize + PATCH inside the debounce window jumped
// the widget to the PATCHed row, then back when the save landed). The
// server copy is older than an in-progress gesture, so it must not win
// over live positions the user has touched but not yet saved.
//
// `built` is the fresh server layout, `live` the current layout state,
// `touched` the ids moved/resized since their save settled. Returns the
// layout to render and the pruned touched set: an id survives only while
// it is still present on both sides and live still differs from server —
// a converged touch (its save landed) and a server-removed widget both
// drop, so protection never outlives the gesture it guards. Untouched
// items take server values, so a legitimate remote change still lands;
// server-added items appear and server-removed items drop, because the
// merge maps over `built`.
export function reconcileLayoutWithLive(built, live, touched) {
  const liveById = new Map((live || []).map((item) => [item.i, item]));
  const touchedSet = touched instanceof Set ? touched : new Set(touched || []);
  const layout = (built || []).map((item) => {
    const liveItem = liveById.get(item.i);
    if (liveItem && touchedSet.has(item.i)) return liveItem;
    return item;
  });
  const pruned = new Set();
  for (const id of touchedSet) {
    const serverItem = (built || []).find((item) => item.i === id);
    const liveItem = liveById.get(id);
    if (!serverItem || !liveItem) continue;
    if (serverItem.x !== liveItem.x || serverItem.y !== liveItem.y
      || serverItem.w !== liveItem.w || serverItem.h !== liveItem.h) {
      pruned.add(id);
    }
  }
  return { layout, touched: pruned };
}
