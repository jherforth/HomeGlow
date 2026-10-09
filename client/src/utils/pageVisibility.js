// Whether the page is on screen, and when that changes.
//
// Chrome prerenders a page while its address is still being typed. A
// prerendered page is hidden, and when it is shown Chrome fires
// `prerenderingchange`, not always `visibilitychange`. Watching only the
// latter left a page opened that way believing it was hidden until reloaded:
// the theme's scenery never drew.

export const isPageVisible = (doc) => doc.visibilityState !== 'hidden';

const EVENTS = ['visibilitychange', 'prerenderingchange'];

/** Calls `onChange(visible)` whenever visibility may have changed. Returns the unsubscribe. */
export function watchPageVisibility(doc, onChange) {
  const handle = () => onChange(isPageVisible(doc));
  EVENTS.forEach((event) => doc.addEventListener(event, handle));
  return () => EVENTS.forEach((event) => doc.removeEventListener(event, handle));
}
