// A Stack turns on a quick sideways flick (components/StackWidget.jsx), but
// not when the flick starts on something that takes sideways drags itself: a
// slider, a text field, a list that scrolls sideways, an element that handles
// its own touch (a graph you scrub sets touch-action: none or pan-y), or
// anything marked data-no-flick. The same rule runs inside plugin frames
// (server/utils/pluginFrameTouch.js), written there in ES5.

// Inputs that take a drag (text, range, number…), not tick boxes and buttons.
export const NO_FLICK_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="file"]):not([type="color"]),'
  + 'textarea,select,[role="slider"],[contenteditable]:not([contenteditable="false"]),[data-no-flick]';

// touch-action that leaves sideways movement to the page's own script.
export const handlesSideways = (touchAction) => {
  const value = String(touchAction || 'auto').trim();
  if (value === 'auto' || value === 'manipulation') return false;
  return !/pan-(x|left|right)/.test(value);
};

// A real sideways scroll range: a list that scrolls up and down but is a
// pixel or two too wide doesn't count.
const SCROLL_RANGE_PX = 8;
const scrollsSideways = (el, style) => (style.overflowX === 'auto' || style.overflowX === 'scroll')
  && el.scrollWidth > el.clientWidth + SCROLL_RANGE_PX;

/**
 * Whether a flick starting on `target` belongs to what's under the finger
 * rather than to the Stack. Looks from `target` up to (not including) `stop`.
 */
export function ownsSideways(target, stop, getStyle = (el) => window.getComputedStyle(el)) {
  // Not inside the Stack on the page: a dialog or menu a widget in it opened
  // (React passes those touches up to the Stack all the same).
  if (stop && target && typeof stop.contains === 'function' && !stop.contains(target)) return true;
  for (let el = target; el && el !== stop && el.nodeType === 1; el = el.parentElement) {
    if (typeof document !== 'undefined' && (el === document.body || el === document.documentElement)) break;
    if (el.matches?.(NO_FLICK_SELECTOR)) return true;
    const style = getStyle(el);
    if (handlesSideways(style.touchAction) || scrollsSideways(el, style)) return true;
  }
  return false;
}
