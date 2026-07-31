/** Canonical column count used when persisting layouts to the API. */
export const NORMALIZED_GRID_COLS = 12;

/**
 * Clamp a layout item so it fits within the given column count.
 */
export function clampLayoutItem(item, cols) {
  const minW = Math.min(Math.max(1, item.minW ?? 1), cols);
  const minH = Math.max(1, item.minH ?? 1);
  const w = Math.max(minW, Math.min(cols, item.w ?? minW));
  const x = Math.max(0, Math.min(item.x ?? 0, cols - w));
  const h = Math.max(minH, item.h ?? minH);
  const y = Math.max(0, item.y ?? 0);

  return {
    ...item,
    x,
    y,
    w,
    h,
    minW,
    minH,
  };
}

/**
 * Proportionally scale x/w from one column count to another, then clamp.
 * Row units (y/h) are unchanged — rowHeight is constant across breakpoints.
 */
export function scaleLayoutItem(item, fromCols, toCols) {
  if (!fromCols || !toCols || fromCols === toCols) {
    return clampLayoutItem(item, toCols || fromCols || NORMALIZED_GRID_COLS);
  }

  const scale = toCols / fromCols;
  return clampLayoutItem(
    {
      ...item,
      x: Math.round((item.x ?? 0) * scale),
      w: Math.round((item.w ?? 1) * scale),
    },
    toCols
  );
}

/** Convert a layout item from the live grid into normalized (12-col) units for storage. */
export function layoutItemToNormalized(item, fromCols) {
  return scaleLayoutItem(item, fromCols, NORMALIZED_GRID_COLS);
}

/** Convert a stored normalized (12-col) layout item into the live grid's column units. */
export function layoutItemFromNormalized(item, toCols) {
  return scaleLayoutItem(item, NORMALIZED_GRID_COLS, toCols);
}
