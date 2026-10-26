// A row that scrolls sideways shows no scrollbar on a touch panel, so a column
// cut off at the edge reads as broken rather than "more this way". Fading the
// edge there is the hint. Each side fades only while there is more to see on
// it, so a row that fits, or one scrolled to an end, keeps a hard edge.
export const EDGE_FADE_PX = 24;

/** The CSS mask-image for a horizontal scroller in this state. */
export function edgeFadeMask({ scrollLeft, scrollWidth, clientWidth }, px = EDGE_FADE_PX) {
  // A pixel of slack: zoomed and high-DPI pages report fractional positions.
  const left = scrollLeft > 1;
  const right = scrollLeft + clientWidth < scrollWidth - 1;
  if (!left && !right) return 'none';
  const start = left ? `transparent, #000 ${px}px` : '#000';
  const end = right ? `#000 calc(100% - ${px}px), transparent` : '#000';
  return `linear-gradient(to right, ${start}, ${end})`;
}
