// The ➖/➕ resize buttons around a selected widget, sized to the widget.
//
// Eight buttons sit in four pairs: a row of two on the top and bottom edges
// and a column of two on the left and right. On a small widget, a full-size
// button (40px) would put the pairs on top of each other, so each button
// shrinks until the top row fits between the side columns:
// 2 buttons + gap <= width - 2 side columns - 2 insets (and the same for the
// height). Never below 18px, never above the normal 40px.

export const RESIZE_BUTTON_MAX = 40;
export const RESIZE_BUTTON_MIN = 18;

/** A widget's size in pixels on the grid, from its grid units. */
export function widgetPixelSize({ w, h }, { containerWidth, cols, rowHeight, gap }) {
  const colWidth = (containerWidth - gap * (cols - 1)) / cols;
  return { width: w * colWidth + (w - 1) * gap, height: h * rowHeight + (h - 1) * gap };
}

/** Button size, font size, inset from the widget's edge and gap between a pair, in px. */
export function resizeButtonMetrics({ width, height }) {
  const side = Math.min(width, height);
  // 4 buttons across (two in the row, one column each side), 2 insets and a
  // gap: 4b + 2i + g <= side, with i and g each a fifth of b, so b <= side / 4.6.
  const box = Math.floor(Math.max(RESIZE_BUTTON_MIN, Math.min(RESIZE_BUTTON_MAX, side / 4.6)));
  const space = Math.max(2, Math.min(8, Math.floor(box / 5)));
  return { box, font: Math.round(box * 0.55), inset: space, gap: space };
}
