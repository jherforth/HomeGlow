// Two-finger swipe between tabs, and blocking pinch zoom, on a wall display.
// Both are per-display settings, saved with the screensaver's, and off by
// default so no display changes on upgrade. Phones get neither: they show one
// list of widgets with no tabs, and their owners may need to zoom.
//
// One finger is left alone (it scrolls, drags and taps widgets), and so is a
// pinch: only two fingers travelling sideways together, quickly enough, change
// the tab. Fingers moving left go to the next tab and right to the previous
// one, like turning a page, wrapping around at the ends.
//
// Plugins are iframes, whose touches the dashboard never sees. Every plugin
// page carries a small script (server/utils/pluginFrameTouch.js) that, once the
// dashboard turns it on, reports two-finger touches as postMessages; the same
// detector below decides whether they made a swipe.

// How far the two fingers must travel sideways on average, in CSS pixels, each
// measured from where it landed.
export const SWIPE_MIN_DISTANCE = 70;
// A swipe finishes within this long of its first finger landing; a slow drag
// is something else.
export const SWIPE_MAX_MS = 1100;
// Fingers rarely land together. A second finger landing within this long of
// the first joins it in one gesture, and the first finger's travel before then
// counts; a second finger landing later starts the gesture afresh.
export const SWIPE_JOIN_MS = 600;
// The gesture must be this much more sideways than vertical.
export const SWIPE_MIN_SLOPE = 1.5;
// The fingers' spread changing by more than this share of the starting spread
// makes the gesture a pinch, never a swipe.
export const PINCH_SPREAD_SHARE = 0.4;
// Sideways travel after which the page stops the browser's own handling of the
// gesture (scrolling, zooming), so the swipe doesn't also nudge the page.
export const CLAIM_DISTANCE = 20;

// The touch-action the page gets while pinch zoom is blocked: panning in both
// directions still scrolls, double-tap and pinch don't zoom.
export const BLOCK_PINCH_TOUCH_ACTION = 'pan-x pan-y';

// postMessage types between the dashboard and a plugin frame.
export const FRAME_TOUCH_SETTINGS_MESSAGE_TYPE = 'homeglow:touch-settings';
export const FRAME_TOUCH_MESSAGE_TYPE = 'homeglow:touch';

const spreadOf = (points) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

const isPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

// The [{id, x, y}] of a TouchList, in the coordinates of its own document.
// Only distances are ever used, so a frame's coordinates and the page's never
// need to be reconciled. With `landings` (id -> {x, y, at}, kept by the
// caller), each point also says where and when its finger landed: x0, y0 and
// downAt.
export const touchPoints = (touches, landings = null) => {
  const points = [];
  if (!touches) return points;
  for (let i = 0; i < touches.length; i += 1) {
    const touch = touches[i];
    const id = Number.isFinite(touch.identifier) ? touch.identifier : i;
    const point = { id, x: touch.clientX, y: touch.clientY };
    const landed = landings && landings.get(id);
    if (landed) Object.assign(point, { x0: landed.x, y0: landed.y, downAt: landed.at });
    points.push(point);
  }
  return points;
};

// Where a point's finger is measured from. Fingers matched by id; a point
// without one is matched by its place in the list.
const keyOf = (point, index) => (Number.isFinite(point.id) ? `id:${point.id}` : `at:${index}`);

/**
 * One gesture detector per touch source (the page, or one plugin frame).
 *
 * - `start(points, now)`: fingers went down; `points` are all fingers now down.
 * - `move(points)`: fingers moved. Returns true once the gesture is clearly a
 *   sideways two-finger swipe, so the caller can preventDefault the event.
 * - `end(fingersLeft, now)`: a finger lifted. Returns +1 (next tab) or -1
 *   (previous tab) when that completed a swipe, otherwise 0.
 * - `cancel()`: forget the gesture.
 */
export function createSwipeDetector({
  minDistance = SWIPE_MIN_DISTANCE,
  maxMs = SWIPE_MAX_MS,
  minSlope = SWIPE_MIN_SLOPE,
} = {}) {
  let gesture = null;

  return {
    start(points, now) {
      if (!Array.isArray(points)) return;
      if (points.length === 2 && points.every(isPoint)) {
        // A second finger that joins soon enough makes one gesture with the
        // first, timed and measured from when and where each landed.
        const landed = points.map((p) => (Number.isFinite(p.downAt) ? p.downAt : now));
        const joined = now - Math.min(...landed) <= SWIPE_JOIN_MS;
        const origins = new Map(points.map((p, i) => [keyOf(p, i), joined && isPoint({ x: p.x0, y: p.y0 })
          ? { x: p.x0, y: p.y0 }
          : { x: p.x, y: p.y }]));
        gesture = { origins, dx: 0, dy: 0, spread: spreadOf(points), at: joined ? Math.min(...landed) : now, pinch: false };
      } else if (points.length > 2) {
        // Three or more fingers are someone else's gesture.
        gesture = null;
      }
    },

    move(points) {
      if (!gesture || !Array.isArray(points) || points.length !== 2 || !points.every(isPoint)) return false;
      const origins = points.map((p, i) => gesture.origins.get(keyOf(p, i)));
      // Not the two fingers the gesture started with.
      if (origins.some((o) => !o)) return false;
      gesture.dx = ((points[0].x - origins[0].x) + (points[1].x - origins[1].x)) / 2;
      gesture.dy = ((points[0].y - origins[0].y) + (points[1].y - origins[1].y)) / 2;
      if (Math.abs(spreadOf(points) - gesture.spread) > gesture.spread * PINCH_SPREAD_SHARE) {
        gesture.pinch = true;
      }
      return !gesture.pinch
        && Math.abs(gesture.dx) > CLAIM_DISTANCE
        && Math.abs(gesture.dx) > Math.abs(gesture.dy);
    },

    end(fingersLeft, now) {
      // Lifting one finger of three still leaves a gesture that isn't ours.
      if (!gesture || fingersLeft > 1) return 0;
      const done = gesture;
      gesture = null;
      if (done.pinch || now - done.at > maxMs) return 0;
      if (Math.abs(done.dx) < minDistance) return 0;
      if (Math.abs(done.dx) < Math.abs(done.dy) * minSlope) return 0;
      return done.dx < 0 ? 1 : -1;
    },

    cancel() {
      gesture = null;
    },
  };
}

/**
 * The tab number a swipe lands on: the next (+1) or previous (-1) tab in the
 * dock's order, wrapping around. Null when there is nowhere to go (fewer than
 * two tabs, or no direction).
 */
export const swipeTargetTab = (tabs, activeTab, direction) => {
  if (!Array.isArray(tabs) || tabs.length < 2 || (direction !== 1 && direction !== -1)) return null;
  const numbers = tabs.map((tab) => tab?.number ?? tab?.id);
  const at = numbers.indexOf(activeTab);
  // A tab that's gone (deleted on another display) counts as the first one.
  const from = at === -1 ? 0 : at;
  return numbers[(from + direction + numbers.length) % numbers.length];
};

/**
 * The message the dashboard posts into each plugin frame, telling its touch
 * script what to do on this display.
 */
export const buildFrameTouchSettingsMessage = ({ swipe, blockPinchZoom }) => ({
  type: FRAME_TOUCH_SETTINGS_MESSAGE_TYPE,
  swipe: swipe === true,
  blockPinchZoom: blockPinchZoom === true,
});

/**
 * A plugin frame's report of a touch, or null when the message is anything
 * else. Trust is anchored on the frame, as for the plugin's other messages: it
 * must come from this wrapper's own iframe and from the origin its document
 * was loaded from. The points are checked because they come from a page the
 * household installed, not from HomeGlow.
 */
export const acceptFrameTouchMessage = (event, expectedSource, expectedOrigin) => {
  if (!event || !expectedSource) return null;
  if (event.source !== expectedSource || event.origin !== expectedOrigin) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== FRAME_TOUCH_MESSAGE_TYPE) return null;
  if (!['start', 'move', 'end', 'cancel'].includes(data.phase)) return null;
  // Each point is {id, x, y}, and on a start also where its finger landed and
  // how long ago (x0, y0, age in ms): the frame's clock isn't the page's.
  const points = (Array.isArray(data.points) ? data.points.slice(0, 10).filter(isPoint) : []).map((p) => {
    const point = { x: p.x, y: p.y };
    if (Number.isInteger(p.id)) point.id = p.id;
    if (isPoint({ x: p.x0, y: p.y0 }) && Number.isFinite(p.age) && p.age >= 0) {
      Object.assign(point, { x0: p.x0, y0: p.y0, age: Math.min(p.age, 60000) });
    }
    return point;
  });
  const fingers = Number.isInteger(data.fingers) && data.fingers >= 0 ? data.fingers : points.length;
  return { phase: data.phase, points, fingers };
};

// A plugin frame's touch, handed from its wrapper to the dashboard's swipe
// handler as a window event: the wrapper knows the frame, the dashboard knows
// the tabs.
export const FRAME_TOUCH_EVENT = 'homeglow:frame-touch';

export const emitFrameTouch = (sourceKey, touch) => {
  window.dispatchEvent(new CustomEvent(FRAME_TOUCH_EVENT, { detail: { sourceKey, ...touch } }));
};

/**
 * Listens for two-finger swipes on `target` (the window): touches on the page
 * itself, and the plugin frames' touches their wrappers relay as
 * FRAME_TOUCH_EVENT. Each source has its own detector, so a finger on a plugin
 * and a finger beside it never make one gesture. `onSwipe(direction)` gets +1
 * (next tab) or -1 (previous tab). `ignore(event)` is asked when two fingers go
 * down, and true leaves that gesture alone; for a frame's touch the event is
 * null. Returns a function that removes every listener.
 */
export function attachTwoFingerSwipe({ target, onSwipe, ignore = () => false, now = () => Date.now() }) {
  const detectors = new Map();
  const detectorFor = (key) => {
    if (!detectors.has(key)) detectors.set(key, createSwipeDetector());
    return detectors.get(key);
  };
  const page = detectorFor('page');
  // Where and when each finger on the page landed, by touch id.
  const landings = new Map();
  const finish = (direction) => {
    if (direction) onSwipe(direction);
  };

  const onStart = (event) => {
    const at = now();
    const changed = event.changedTouches || [];
    for (let i = 0; i < changed.length; i += 1) {
      landings.set(changed[i].identifier, { x: changed[i].clientX, y: changed[i].clientY, at });
    }
    const points = touchPoints(event.touches, landings);
    if (points.length === 2 && ignore(event)) {
      page.cancel();
      return;
    }
    page.start(points, at);
  };
  const onMove = (event) => {
    if (page.move(touchPoints(event.touches)) && event.cancelable) event.preventDefault();
  };
  const forgetLifted = (event) => {
    const changed = event.changedTouches || [];
    for (let i = 0; i < changed.length; i += 1) landings.delete(changed[i].identifier);
  };
  const onEnd = (event) => {
    forgetLifted(event);
    finish(page.end(event.touches ? event.touches.length : 0, now()));
  };
  const onCancel = (event) => {
    forgetLifted(event);
    page.cancel();
  };

  const onFrameTouch = (event) => {
    const detail = event?.detail;
    if (!detail || typeof detail.sourceKey !== 'string') return;
    const detector = detectorFor(`frame:${detail.sourceKey}`);
    if (detail.phase === 'start') {
      if (detail.points.length === 2 && ignore(null)) {
        detector.cancel();
        return;
      }
      const at = now();
      const points = detail.points.map((p) => (Number.isFinite(p.age) ? { ...p, downAt: at - p.age } : p));
      detector.start(points, at);
    } else if (detail.phase === 'move') {
      detector.move(detail.points);
    } else if (detail.phase === 'end') {
      finish(detector.end(detail.fingers, now()));
    } else {
      detector.cancel();
    }
  };

  // Capture, so a widget that stops a touch's propagation can't swallow the
  // swipe. Only touchmove is active: it is the one that may need to stop the
  // browser scrolling or zooming the page under a swipe.
  const passive = { capture: true, passive: true };
  const active = { capture: true, passive: false };
  target.addEventListener('touchstart', onStart, passive);
  target.addEventListener('touchmove', onMove, active);
  target.addEventListener('touchend', onEnd, passive);
  target.addEventListener('touchcancel', onCancel, passive);
  target.addEventListener(FRAME_TOUCH_EVENT, onFrameTouch);

  return () => {
    target.removeEventListener('touchstart', onStart, passive);
    target.removeEventListener('touchmove', onMove, active);
    target.removeEventListener('touchend', onEnd, passive);
    target.removeEventListener('touchcancel', onCancel, passive);
    target.removeEventListener(FRAME_TOUCH_EVENT, onFrameTouch);
  };
}
