// Expanding a widget on a wall display: a widget grows to the top half of the
// page, or to the whole page, and later goes back to its place on the grid.
// A per-display setting, saved with the screensaver's, and off by default so
// no display changes on upgrade. Phones never get it: they show one list of
// widgets, each already the width of the screen.
//
// Two ways to expand, chosen per display:
// - 'doubleTap': double-tap a widget for the top half, double-tap again to go
//   back. So that a double-tap can win, a single tap on a widget's plain area
//   (not a button or field) waits DOUBLE_TAP_MS before it goes through.
// - 'button': a small expand button fades in on every widget for a few
//   seconds after the screen is touched. No tap is ever delayed.
// Either way, a half-size widget shows a button that takes it to the whole
// page, and tapping the dimmed page around a half-size widget sends it back.
// After `expandIdleMinutes` with no touch, an expanded widget goes back on
// its own (0 = never).
//
// Each widget can be left out (Admin, per display), and a plugin can leave
// itself out with "expand": false in its manifest, for one whose own double
// tap or drag would fight with this.

export const EXPAND_SIZES = ['normal', 'half', 'full'];
export const EXPAND_METHODS = ['doubleTap', 'button'];

export const DEFAULT_EXPAND_METHOD = 'doubleTap';
export const DEFAULT_EXPAND_IDLE_MINUTES = 2;
export const MAX_EXPAND_IDLE_MINUTES = 60;
// The choices Admin offers for the auto-return time. 0 is "Off".
export const EXPAND_IDLE_CHOICES = [0, 1, 2, 5, 10, 30];

// Two taps make a double-tap when the second lands within this long of the
// first, and within DOUBLE_TAP_SLOP pixels of it.
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_SLOP = 40;

// How long the expand buttons stay up after the screen is touched, in button
// mode.
export const BUTTON_REVEAL_MS = 5000;

// postMessage types between the dashboard and a plugin frame. The settings
// ride the existing touch-settings message (see twoFingerSwipe.js); these go
// the other way, from the frame's touch script.
export const FRAME_DOUBLE_TAP_MESSAGE_TYPE = 'homeglow:double-tap';
export const FRAME_ACTIVITY_MESSAGE_TYPE = 'homeglow:frame-activity';
// From the dashboard to the plugin page: how big the plugin is shown now.
// The SDK passes it on to HomeGlow.onExpand handlers.
export const FRAME_EXPAND_MESSAGE_TYPE = 'homeglow:expand';

export const normalizeExpandMethod = (raw) => (EXPAND_METHODS.includes(raw) ? raw : DEFAULT_EXPAND_METHOD);

// Whole minutes, 0 to MAX_EXPAND_IDLE_MINUTES. 0 (or anything unreadable
// that is not missing) means never go back on its own; a missing value takes
// the default.
export const normalizeExpandIdleMinutes = (raw) => {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_EXPAND_IDLE_MINUTES;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(MAX_EXPAND_IDLE_MINUTES, Math.max(1, Math.floor(parsed)));
};

// The widgets left out, by widget name ('calendar', 'plugin:Grill.html').
export const normalizeExpandOff = (raw) => {
  if (!Array.isArray(raw)) return [];
  const names = raw.filter((name) => typeof name === 'string' && name.length > 0 && name.length <= 200);
  return [...new Set(names)].slice(0, 200);
};

export const expandIdleTimeoutMs = (minutes) => {
  const n = normalizeExpandIdleMinutes(minutes);
  return n > 0 ? n * 60 * 1000 : null;
};

export const isExpandSize = (size) => EXPAND_SIZES.includes(size);

// A double-tap from normal goes to the top half; from either expanded size,
// back to normal.
export const nextSizeOnDoubleTap = (size) => (size === 'normal' || !isExpandSize(size) ? 'half' : 'normal');

/**
 * Whether one widget can expand on this display.
 * - settings: the display's normalized screensaver settings
 * - widgetName: 'calendar', 'plugin:Grill.html', ...
 * - manifestExpand: the plugin manifest's "expand" value, if any
 */
export const isWidgetExpandable = ({ settings, widgetName, manifestExpand } = {}) => {
  if (!settings || settings.expandWidgets !== true) return false;
  if (!widgetName) return false;
  if (manifestExpand === false) return false;
  return !normalizeExpandOff(settings.expandOff).includes(widgetName);
};

// Turn a widget on or off in the left-out list.
export const setWidgetExpandAllowed = (off, widgetName, allowed) => {
  const list = normalizeExpandOff(off).filter((name) => name !== widgetName);
  return allowed ? list : [...list, widgetName];
};

/**
 * Where an expanded widget sits, in CSS pixels of the viewport. `gap` is the
 * theme's gap between widgets, kept around the edges so the widget still looks
 * like a card. Half is always the top half.
 */
export const expandedRect = (size, { width, height, gap = 16 }) => {
  const g = Math.max(0, gap);
  if (size === 'full') {
    return { top: g, left: g, width: Math.max(0, width - 2 * g), height: Math.max(0, height - 2 * g) };
  }
  if (size === 'half') {
    return { top: g, left: g, width: Math.max(0, width - 2 * g), height: Math.max(0, Math.round(height / 2) - g - g / 2) };
  }
  return null;
};

/**
 * Tells single taps from double-taps, for one surface (a widget).
 *
 * tap({ x, y, at }) returns:
 * - 'double' when this tap completes a double-tap (the earlier tap's pending
 *   single-tap action should be dropped),
 * - 'single' when it is a first tap; the caller holds its action and lets it
 *   through after DOUBLE_TAP_MS unless a 'double' arrives first.
 * reset() forgets the last tap (a button was pressed, the widget changed size).
 */
export function createDoubleTapDetector({ windowMs = DOUBLE_TAP_MS, slop = DOUBLE_TAP_SLOP } = {}) {
  let last = null;
  return {
    tap({ x, y, at }) {
      if (last && at - last.at <= windowMs && Math.hypot(x - last.x, y - last.y) <= slop) {
        last = null;
        return 'double';
      }
      last = { x, y, at };
      return 'single';
    },
    reset() {
      last = null;
    },
  };
}

// Anything that should act on the first tap and never count toward a
// double-tap: a button, a link, a field, a switch. Matches WidgetContainer's
// list of interactive targets.
export const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, label, [role="button"], [role="slider"], [role="tab"], [role="checkbox"], [role="switch"], [contenteditable="true"], .MuiButtonBase-root, .MuiInputBase-root, .MuiSwitch-root, .MuiToggleButton-root, .MuiSlider-root';

export const isInteractiveElement = (target) => !!target?.closest?.(INTERACTIVE_SELECTOR);

// Marks a click the dashboard replays after holding it, so the hold lets it
// through the second time.
export const REPLAYED_CLICK_FLAG = '__homeglowReplayedClick';

/**
 * Replay a held click on the element it was meant for, once the double-tap
 * window has passed. Returns false when the element has left the page.
 */
export const replayClick = (target, { clientX = 0, clientY = 0 } = {}) => {
  if (!target || !target.isConnected) return false;
  const view = target.ownerDocument?.defaultView || undefined;
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX, clientY, detail: 1, view });
  event[REPLAYED_CLICK_FLAG] = true;
  target.dispatchEvent(event);
  return true;
};

// What a plugin frame is told about expanding, with the touch settings.
// false when this plugin can't expand here.
export const frameExpandSetting = (expandable, method) => (expandable ? normalizeExpandMethod(method) : false);

/**
 * A double-tap or a touch reported by a plugin frame, or null for anything
 * else. Trust rests on the frame and origin, as with the other frame messages.
 */
export const acceptFrameExpandMessage = (event, expectedSource, expectedOrigin) => {
  if (!event || !expectedSource || event.source !== expectedSource) return null;
  if (expectedOrigin && event.origin !== expectedOrigin) return null;
  const data = event.data;
  if (!data || typeof data !== 'object') return null;
  if (data.type === FRAME_DOUBLE_TAP_MESSAGE_TYPE) return 'doubleTap';
  if (data.type === FRAME_ACTIVITY_MESSAGE_TYPE) return 'activity';
  return null;
};

export const buildFrameExpandMessage = (size) => ({
  type: FRAME_EXPAND_MESSAGE_TYPE,
  size: isExpandSize(size) ? size : 'normal',
});

// The window event a plugin wrapper raises for its frame's double-taps and
// touches, so the widget grid (which owns expanding) hears about them without
// the wrapper knowing its own grid id.
export const FRAME_EXPAND_EVENT = 'homeglow:frame-expand';
export const emitFrameExpand = (element, kind) => {
  if (!element) return;
  element.dispatchEvent(new CustomEvent(FRAME_EXPAND_EVENT, { bubbles: true, detail: { kind } }));
};
