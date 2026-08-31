// Helpers behind the calendar's "return to today after idle" feature. Wall
// displays that sit on last month look current and are not; a bounded idle
// timer swings the view back to today after the household has stopped
// touching the calendar for a while.

export const DEFAULT_IDLE_RETURN_MINUTES = 20;
export const MIN_IDLE_RETURN_MINUTES = 1;
export const MAX_IDLE_RETURN_MINUTES = 240;

// Parses the configured minutes into an integer >= 0. A value of 0 (or an
// empty / negative / non-numeric input) means DISABLED — auto-return is off
// entirely rather than "return immediately", which would make the calendar
// impossible to navigate away from today.
export const normalizeIdleReturnMinutes = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  const floored = Math.floor(parsed);
  if (floored <= 0) return 0;
  return Math.min(MAX_IDLE_RETURN_MINUTES, Math.max(MIN_IDLE_RETURN_MINUTES, floored));
};

export const isIdleReturnEnabled = (minutes) => normalizeIdleReturnMinutes(minutes) > 0;

// Millisecond timeout to hand to setTimeout, or null when disabled — callers
// use null to skip arming the timer at all.
export const idleReturnTimeoutMs = (minutes) => {
  const n = normalizeIdleReturnMinutes(minutes);
  return n > 0 ? n * 60 * 1000 : null;
};

// True when two Date-likes represent the same local calendar day. Guards the
// button's disabled state and prevents the idle timer from firing a no-op
// setCurrentDate when the widget is already on today.
export const isSameLocalCalendarDay = (a, b) => {
  if (a == null || b == null) return false;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
};
