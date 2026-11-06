// Container-width measurement for the dashboard grid (WidgetContainer).
//
// The grid's width is the container element's own width, so it has to be
// re-measured whenever that element changes size — not just on window
// resize. In mirror the canvas starts at the 1280 fallback width and
// widens to the target's real width once its viewport arrives; that
// widening is not a window resize, so a window-only listener leaves the
// grid laid out at the fallback size (the weather widget then lands
// compact at 294px instead of medium at 332px).
//
// The watcher reports only when the measured width actually changes, so a
// resize storm or a state update that leaves the width alone never
// re-runs the layout rebuild. The container is width:100% of its parent,
// so changing the grid's width prop never changes the container's own
// width — the observer cannot feed itself.

export function measureContainerWidth(element) {
  if (!element || typeof window === 'undefined') return null;
  const computed = window.getComputedStyle(element);
  const paddingLeft = parseFloat(computed.paddingLeft) || 0;
  const paddingRight = parseFloat(computed.paddingRight) || 0;
  return Math.max(0, element.clientWidth - paddingLeft - paddingRight);
}

// Responsive grid columns, matching the breakpoints WidgetContainer has
// always used.
export function gridColsForWidth(width) {
  if (width < 600) return 4; // Mobile: 4 columns
  if (width < 960) return 8; // Tablet: 8 columns
  return 12; // Desktop: 12 columns
}

export function createContainerWidthWatcher({ element, onChange }) {
  let lastWidth = null;
  let observer = null;

  const check = () => {
    const width = measureContainerWidth(element);
    if (width === null || width === lastWidth) return;
    lastWidth = width;
    onChange(width);
  };

  // Initial measure, so the grid is right on first paint even if the
  // observer never fires.
  check();

  if (typeof ResizeObserver !== 'undefined' && element) {
    observer = new ResizeObserver(check);
    observer.observe(element);
  }

  // Window resize stays as a fallback for environments without
  // ResizeObserver; the change guard above makes the duplicate harmless
  // where both fire.
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', check);
  }

  return {
    disconnect() {
      if (observer) observer.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', check);
      }
    },
  };
}
