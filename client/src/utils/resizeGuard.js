// The grid is configured to block overlaps — compactType null plus
// preventCollision — so react-grid-layout refuses a DRAG that would land a
// widget on top of another one. The resize buttons in WidgetContainer do not
// go through that path: they mutate the layout item directly, so nothing
// checked whether the larger widget still fit. A widget grown into its
// neighbour's cells was persisted, and the overlap then survived reloads.
//
// That asymmetry is the bug. A drag into occupied space is refused; a resize
// into the same space was accepted. Worse, the resulting overlap consumes the
// free cells a drag needs, so a dashboard that has been resized a few times
// stops accepting moves at all — the grid looks frozen, with no error, because
// a refused drag reports nothing.
//
// These helpers restate react-grid-layout's own collision rule so the resize
// path can apply it before committing. Kept free of React and of the grid
// library so the decision is unit-testable on its own.

/** Do two layout items share at least one cell? Touching edges do not count. */
export function itemsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Every item in `layout` that `candidate` would sit on top of.
 * The candidate is matched by `i` and never collides with itself.
 */
export function findResizeCollisions(layout, candidate) {
  return layout.filter(
    (item) => item.i !== candidate.i && itemsOverlap(candidate, item)
  );
}

/**
 * Whether a resize may be committed.
 *
 * Shrinking is always allowed: it can only free cells, and refusing it would
 * trap a widget that is already overlapping — which is exactly the state this
 * bug leaves dashboards in, so the escape hatch has to keep working.
 */
export function canCommitResize(layout, previous, candidate) {
  if (!previous || !candidate) return false;

  const grew =
    candidate.w > previous.w ||
    candidate.h > previous.h ||
    candidate.x < previous.x ||
    candidate.y < previous.y;

  if (!grew) return true;

  return findResizeCollisions(layout, candidate).length === 0;
}
