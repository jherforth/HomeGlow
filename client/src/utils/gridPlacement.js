import { layoutItemFromNormalized } from './gridLayout.js';

// Build a complete grid layout for a set of widgets.
//
// One entry per widget, never overlapping. A widget with a saved layout keeps
// it; one without is placed in the first free cell rather than at its default
// position, because defaults are not unique — every plugin widget declares
// (0,0) at 6x4, so honouring them naively stacks the whole plugin set in one
// place.
//
// `widget.savedLayout` is already scoped to the active tab by the caller, which
// is what makes this safe to call during a tab change: it describes the tab
// being rendered, not whatever the previous layout state happened to hold.
export function buildLayout(widgets, cols, locked) {
  const placed = [];

  const collides = (x, y, w, h) => placed.some(
    (p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y
  );

  const findFreePosition = (w, h) => {
    for (let row = 0; row < 200; row++) {
      for (let col = 0; col <= cols - w; col++) {
        if (!collides(col, row, w, h)) return { x: col, y: row };
      }
    }
    return { x: 0, y: 0 };
  };

  return widgets.map((widget) => {
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

    const scaled = layoutItemFromNormalized(source, cols);
    const pos = widget.savedLayout
      ? { x: scaled.x, y: scaled.y }
      : findFreePosition(scaled.w, scaled.h);

    const item = {
      i: widget.id,
      x: pos.x,
      y: pos.y,
      w: scaled.w,
      h: scaled.h,
      minW: scaled.minW,
      minH: scaled.minH,
      static: locked,
    };
    placed.push({ x: item.x, y: item.y, w: item.w, h: item.h });
    return item;
  });
}
