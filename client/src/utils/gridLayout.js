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

/**
 * Convert a whole live layout into normalized (12-col) units for storage,
 * keeping the stored value of every edge the live layout has not moved.
 *
 * `storedById` maps item id → the 12-col rectangle the live layout was built
 * from. Converting live units back to 12 columns is lossy below 12: a 12-col
 * edge at 4 shows at 3 on an 8-col tablet and converts back to 5. Converting
 * every item, every save, therefore nudged widgets nobody touched, and each
 * nudge was saved. An edge still where its stored value puts it keeps that
 * value exactly, so a save only changes what was actually moved.
 *
 * A moved edge that lands on a column line where a kept edge sits takes that
 * edge's stored value, so a widget dragged against an untouched neighbour
 * touches it in storage too instead of overlapping it by a column. A left edge
 * takes the largest such value and a right edge the smallest: neither can
 * then reach past a neighbour that ends or starts on the same line.
 */
export function layoutToNormalized(items, cols, storedById = new Map()) {
  const scale = NORMALIZED_GRID_COLS / cols;
  const plans = items.map((item) => {
    const left = item.x ?? 0;
    const right = left + (item.w ?? 1);
    const stored = storedById.get(item.i);
    const live = stored ? layoutItemFromNormalized(stored, cols) : null;
    return {
      item,
      left,
      right,
      keptLeft: live && live.x === left ? stored.x : null,
      keptRight: live && live.x + live.w === right ? stored.x + stored.w : null,
    };
  });

  // Live column line → stored values of the kept edges on it.
  const keptAt = new Map();
  const note = (line, value) => {
    if (value == null) return;
    if (!keptAt.has(line)) keptAt.set(line, []);
    keptAt.get(line).push(value);
  };
  plans.forEach(({ left, right, keptLeft, keptRight }) => {
    note(left, keptLeft);
    note(right, keptRight);
  });

  return plans.map(({ item, left, right, keptLeft, keptRight }) => {
    const x = keptLeft
      ?? (keptAt.has(left) ? Math.max(...keptAt.get(left)) : Math.round(left * scale));
    const end = keptRight
      ?? (keptAt.has(right) ? Math.min(...keptAt.get(right)) : Math.round(right * scale));
    // y/h are row units and need no conversion; this also scales the minimum.
    const normalized = layoutItemToNormalized(item, cols);
    return clampLayoutItem({ ...normalized, x, w: Math.max(1, end - x) }, NORMALIZED_GRID_COLS);
  });
}
