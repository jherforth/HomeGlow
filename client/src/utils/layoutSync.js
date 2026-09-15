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
