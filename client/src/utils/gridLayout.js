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
 *
 * The left and right edges are scaled and rounded independently, and the width
 * is derived from them. Rounding x and w separately can push x+w past the grid
 * width (e.g. 8-col x=5 w=3 → 12-col x=8 w=5 = 13 columns), which overlaps the
 * neighbor and shuffles on every edit-mode toggle. Edge-based rounding keeps
 * touching widgets touching and never overlapping.
 */
export function scaleLayoutItem(item, fromCols, toCols) {
  if (!fromCols || !toCols || fromCols === toCols) {
    return clampLayoutItem(item, toCols || fromCols || NORMALIZED_GRID_COLS);
  }

  const scale = toCols / fromCols;
  const left = Math.round((item.x ?? 0) * scale);
  const right = Math.round(((item.x ?? 0) + (item.w ?? 1)) * scale);
  return clampLayoutItem(
    {
      ...item,
      x: left,
      w: Math.max(1, right - left),
      // A minimum is a size too, so it scales with the columns. Left in 12-col
      // units, the clamp below widens a scaled-down widget back into its
      // neighbour: three 4-wide widgets in a row become 3+2+3 at 8 columns,
      // and an unscaled minimum of 3 pushes the third onto the next row.
      // Rounded down so a minimum never forces a widget wider than its share.
      ...(item.minW != null ? { minW: Math.max(1, Math.floor(item.minW * scale)) } : {}),
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
