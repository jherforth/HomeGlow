// Press and hold, for a touchscreen that otherwise treats every touch as a
// tap. A press that stays put for `holdMs` is a hold; lifting earlier, or
// sliding more than `slopPx`, is not. The caller feeds pointer events in and
// learns two things: when a hold happens (`onHold`), and whether the release
// that follows belongs to one (`up()` returns true), so the click the browser
// sends after it can be ignored instead of acting as a tap.

export const HOLD_MS = 450;
export const HOLD_SLOP_PX = 12;

export function createPressHold({
  onHold,
  holdMs = HOLD_MS,
  slopPx = HOLD_SLOP_PX,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let start = null;
  let held = false;

  const cancel = () => {
    if (timer) clearTimer(timer);
    timer = null;
    start = null;
  };

  return {
    /** The pointer landed at x, y on `target` (anything the caller wants back). */
    down(x, y, target) {
      cancel();
      held = false;
      start = { x, y, target };
      timer = setTimer(() => {
        timer = null;
        held = true;
        onHold?.(target, { x, y });
      }, holdMs);
    },
    /** The pointer moved; sliding past the slop turns the press into a drag. */
    move(x, y) {
      if (!start || !timer) return;
      if (Math.hypot(x - start.x, y - start.y) > slopPx) cancel();
    },
    /** The pointer lifted. True when this release ends a hold. */
    up() {
      const wasHeld = held;
      cancel();
      held = false;
      return wasHeld;
    },
    /** Lost the pointer (pointercancel, blur): forget the press. */
    cancel() {
      cancel();
      held = false;
    },
  };
}
