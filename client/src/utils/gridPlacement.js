import { layoutItemFromNormalized } from './gridLayout.js';

// The 12-col rectangle a widget's saved layout describes, filled in exactly as
// buildLayout reads it; null when the widget has none.
function savedSourceFor(widget) {
  if (!widget.savedLayout) return null;
  return {
    x: widget.savedLayout.x ?? widget.defaultPosition.x,
    y: widget.savedLayout.y ?? widget.defaultPosition.y,
    w: widget.savedLayout.w || widget.defaultSize.width,
    h: widget.savedLayout.h || widget.defaultSize.height,
    minW: widget.minWidth || 3,
    minH: widget.minHeight || 2,
  };
}

// Widget id → saved 12-col rectangle, for every widget that has one. What a
// save compares the live layout against, so untouched widgets keep their
// stored values (see layoutToNormalized).
export function savedSourcesById(widgets) {
  const sources = new Map();
  widgets.forEach((widget) => {
    const source = savedSourceFor(widget);
    if (source) sources.set(widget.id, source);
  });
  return sources;
}

// Build a complete grid layout for a set of widgets.
//
// One entry per widget, never overlapping. A widget with a saved layout keeps
// it; one without is placed in the first free cell rather than at its default
// position, because defaults are not unique — every plugin widget declares
// (0,0) at 6x4, so honouring them naively stacks the whole plugin set in one
// place.
//
// EVERY SAVED POSITION IS CLAIMED BEFORE ANY GAP IS FILLED. The two passes
// below are the whole point, and collapsing them reintroduces a real bug: a
// single pass only knows about the widgets it has already walked, so a widget
// with no saved layout could be dropped into a cell that a *later* widget's
// saved layout occupies. app.jsx pushes in a fixed order — calendar, weather,
// chores, photos, then plugins — so enabling the weather widget on a board
// where chores already holds the right-hand column put the two on top of each
// other, and the save that followed made the overlap permanent. Nothing could
// then select the buried widget to move it, because a click lands on whichever
// one renders later.
//
// `widget.savedLayout` is already scoped to the active tab by the caller, which
// is what makes this safe to call during a tab change: it describes the tab
// being rendered, not whatever the previous layout state happened to hold.
export function buildLayout(widgets, cols, locked) {
  // Scale each widget's source rectangle into live column units up front, so
  // both passes compare like with like.
  const scaledFor = (widget) => layoutItemFromNormalized(
    savedSourceFor(widget) ?? {
      x: widget.defaultPosition.x,
      y: widget.defaultPosition.y,
      w: widget.defaultSize.width,
      h: widget.defaultSize.height,
      minW: widget.minWidth || 3,
      minH: widget.minHeight || 2,
    },
    cols
  );

  const scaled = new Map(widgets.map((widget) => [widget.id, scaledFor(widget)]));

  const collidesWith = (placedList, x, y, w, h) => placedList.some(
    (p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y
  );

  // Pass 1: claim every saved position that doesn't collide with one already
  // claimed. A saved position that overlaps an already-placed widget is treated
  // as unsaved and re-placed in Pass 2 — this self-repairs layouts whose saved
  // data overlaps (e.g. saved at a narrower width before edge-based scaling),
  // instead of shuffling on every edit-mode toggle.
  const placed = [];
  const needsPlacement = new Set();
  for (const widget of widgets) {
    if (!widget.savedLayout) continue;
    const item = scaled.get(widget.id);
    if (collidesWith(placed, item.x, item.y, item.w, item.h)) {
      needsPlacement.add(widget.id);
    } else {
      placed.push({ x: item.x, y: item.y, w: item.w, h: item.h });
    }
  }

  const collides = (x, y, w, h) => collidesWith(placed, x, y, w, h);

  // One row past everything claimed so far. A rectangle starting here cannot
  // collide with anything, which is what makes the search below terminate.
  const lowestEdge = () => placed.reduce((low, p) => Math.max(low, p.y + p.h), 0);

  const findFreePosition = (w, h) => {
    // Scanning to the lowest edge *inclusive* is exhaustive: the last row tried
    // is always empty, so this returns a real gap when one exists and otherwise
    // appends below. The bound is the data rather than a magic row count; the
    // previous fixed 200-row limit fell back to (0,0), which manufactured the
    // very overlap this function exists to prevent.
    const limit = lowestEdge();
    for (let row = 0; row <= limit; row += 1) {
      for (let col = 0; col <= cols - w; col += 1) {
        if (!collides(col, row, w, h)) return { x: col, y: row };
      }
    }
    // Only reachable when the widget is wider than the grid, so no column
    // offset fits. Below everything is still the safest answer.
    return { x: 0, y: limit };
  };

  // Pass 2: fill gaps with whatever has no saved position (or whose saved
  // position collided and was treated as unsaved), in widget order.
  return widgets.map((widget) => {
    const item = scaled.get(widget.id);
    const hasValidSaved = widget.savedLayout && !needsPlacement.has(widget.id);
    const pos = hasValidSaved
      ? { x: item.x, y: item.y }
      : findFreePosition(item.w, item.h);

    if (!hasValidSaved) {
      placed.push({ x: pos.x, y: pos.y, w: item.w, h: item.h });
    }

    return {
      i: widget.id,
      x: pos.x,
      y: pos.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
      static: locked,
    };
  });
}
