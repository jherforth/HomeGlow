import { layoutItemFromNormalized } from './gridLayout.js';

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
  const scaledFor = (widget) => {
    const minW = widget.minWidth || 3;
    const minH = widget.minHeight || 2;
    const source = widget.savedLayout
      ? {
        x: widget.savedLayout.x ?? widget.defaultPosition.x,
        y: widget.savedLayout.y ?? widget.defaultPosition.y,
        w: widget.savedLayout.w || widget.defaultSize.width,
        h: widget.savedLayout.h || widget.defaultSize.height,
        minW,
        minH,
      }
      : {
        x: widget.defaultPosition.x,
        y: widget.defaultPosition.y,
        w: widget.defaultSize.width,
        h: widget.defaultSize.height,
        minW,
        minH,
      };
    return layoutItemFromNormalized(source, cols);
  };

  const scaled = new Map(widgets.map((widget) => [widget.id, scaledFor(widget)]));

  // Pass 1: claim every saved position.
  const placed = widgets
    .filter((widget) => widget.savedLayout)
    .map((widget) => {
      const item = scaled.get(widget.id);
      return { x: item.x, y: item.y, w: item.w, h: item.h };
    });

  const collides = (x, y, w, h) => placed.some(
    (p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y
  );

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

  // Pass 2: fill gaps with whatever has no saved position, in widget order.
  return widgets.map((widget) => {
    const item = scaled.get(widget.id);
    const pos = widget.savedLayout
      ? { x: item.x, y: item.y }
      : findFreePosition(item.w, item.h);

    if (!widget.savedLayout) {
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
