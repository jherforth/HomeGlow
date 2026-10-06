/**
 * Row pitch in px: one row's height plus the gap below it. Fixed, so a theme's
 * gap never moves a widget off its grid lines; a widget spanning h rows is
 * h * GRID_PITCH - gap tall, whatever the gap.
 */
export const GRID_PITCH = 116;

/** The gaps a theme may choose (--hg-grid-gap). Anything else falls back. */
export const GRID_GAPS = [0, 8, 16, 24];

export const DEFAULT_GRID_GAP = 16;

export function gridMetricsFromGap(raw) {
  const parsed = Number.parseFloat(raw);
  const gap = GRID_GAPS.includes(parsed) ? parsed : DEFAULT_GRID_GAP;
  return { gap, rowHeight: GRID_PITCH - gap };
}

/** Read the active theme's gap from the root element's --hg-grid-gap. */
export function readGridMetrics(root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root || typeof getComputedStyle !== 'function') {
    return gridMetricsFromGap();
  }
  return gridMetricsFromGap(getComputedStyle(root).getPropertyValue('--hg-grid-gap'));
}
