// Helpers behind "hide the dock when idle" (issue #77). On a wall display the
// dock is furniture nobody needs while the board is only being read, and it
// covers the bottom of a widget. After a configured idle time it fades out,
// and any touch, key, scroll or mouse move brings it back.
//
// The dock is the only way to Admin, so the reveal is any activity on the
// window, never a hot corner or a particular target.

export const MIN_DOCK_HIDE_MINUTES = 1;
export const MAX_DOCK_HIDE_MINUTES = 240;

// Every idle feature watches the same events, on window.
export const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

// Parses the configured minutes into an integer >= 0. 0 (or an empty,
// negative or non-numeric input) means DISABLED, never "hide immediately",
// which would leave a display with no dock to reach Admin from.
export const normalizeDockHideMinutes = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  const floored = Math.floor(parsed);
  if (floored <= 0) return 0;
  return Math.min(MAX_DOCK_HIDE_MINUTES, Math.max(MIN_DOCK_HIDE_MINUTES, floored));
};

// Millisecond timeout for setTimeout, or null when disabled so callers skip
// arming the timer at all.
export const dockHideTimeoutMs = (minutes) => {
  const n = normalizeDockHideMinutes(minutes);
  return n > 0 ? n * 60 * 1000 : null;
};

// Whether the window needs activity listeners at all. The screensaver and the
// dock share one set; phones get neither feature (issue #118), so no listeners.
export const wantsActivityListeners = ({ isMobile, screensaverEnabled, dockHideMs }) =>
  !isMobile && (screensaverEnabled === true || dockHideMs != null);

// When both are on and the dock waits as long as the screensaver or longer,
// the screensaver always comes first and the dock never visibly hides. Not a
// fault, but Admin says so rather than leave it to be discovered.
export const screensaverPreemptsDock = ({ screensaverEnabled, screensaverMinutes, dockHideMinutes }) => {
  const dock = normalizeDockHideMinutes(dockHideMinutes);
  return screensaverEnabled === true && dock > 0 && dock >= Number(screensaverMinutes);
};

// The dock's idle timer. `poke()` on activity shows the dock and restarts the
// countdown; `setSuspended(true)` (Admin open, phone) shows it and stops
// counting until released. `onChange(hidden)` fires only when the state flips.
export function createDockIdleTimer({
  timeoutMs,
  onChange,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null;
  let hidden = false;
  let suspended = false;

  const set = (next) => {
    if (next === hidden) return;
    hidden = next;
    onChange(hidden);
  };
  const disarm = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const arm = () => {
    disarm();
    if (timeoutMs == null || suspended) return;
    timer = setTimer(() => {
      timer = null;
      set(true);
    }, timeoutMs);
  };

  return {
    poke() {
      set(false);
      arm();
    },
    setSuspended(next) {
      suspended = next;
      set(false);
      arm();
    },
    dispose() {
      disarm();
    },
  };
}
