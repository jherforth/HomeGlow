import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_EVENTS,
  createDockIdleTimer,
  dockHideTimeoutMs,
  normalizeDockHideMinutes,
  screensaverPreemptsDock,
  wantsActivityListeners,
} from './dockIdleHide.js';
import { DEFAULT_SCREENSAVER_SETTINGS, normalizeScreensaverSettings } from './interfaceSettings.js';

describe('dock idle hide settings', () => {
  it('reads 0, empty, negative and non-numeric as off', () => {
    for (const raw of [0, '0', '', null, undefined, -3, '-1', 'abc', NaN, Infinity, 0.5]) {
      expect(normalizeDockHideMinutes(raw)).toBe(0);
      expect(dockHideTimeoutMs(raw)).toBeNull();
    }
  });

  it('keeps whole minutes within range', () => {
    expect(normalizeDockHideMinutes('5')).toBe(5);
    expect(normalizeDockHideMinutes(2.9)).toBe(2);
    expect(normalizeDockHideMinutes(1000)).toBe(240);
    expect(dockHideTimeoutMs(3)).toBe(3 * 60 * 1000);
  });

  it('is off by default, and a stored value is cleaned on read', () => {
    expect(DEFAULT_SCREENSAVER_SETTINGS.dockHideMinutes).toBe(0);
    expect(normalizeScreensaverSettings({}).dockHideMinutes).toBe(0);
    expect(normalizeScreensaverSettings({ dockHideMinutes: '10' }).dockHideMinutes).toBe(10);
    expect(normalizeScreensaverSettings({ dockHideMinutes: -2 }).dockHideMinutes).toBe(0);
  });

  it('notes when the screensaver always arrives first', () => {
    const on = { screensaverEnabled: true, screensaverMinutes: 5 };
    expect(screensaverPreemptsDock({ ...on, dockHideMinutes: 5 })).toBe(true);
    expect(screensaverPreemptsDock({ ...on, dockHideMinutes: 2 })).toBe(false);
    expect(screensaverPreemptsDock({ ...on, dockHideMinutes: 0 })).toBe(false);
    expect(screensaverPreemptsDock({ ...on, screensaverEnabled: false, dockHideMinutes: 10 })).toBe(false);
  });
});

describe('activity listeners', () => {
  it('watches the window for touch, mouse, keys and scroll', () => {
    expect(ACTIVITY_EVENTS).toEqual(['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']);
  });

  it('are wanted when either idle feature is on, and never on a phone', () => {
    const ms = dockHideTimeoutMs(5);
    expect(wantsActivityListeners({ isMobile: false, screensaverEnabled: false, dockHideMs: null })).toBe(false);
    expect(wantsActivityListeners({ isMobile: false, screensaverEnabled: true, dockHideMs: null })).toBe(true);
    expect(wantsActivityListeners({ isMobile: false, screensaverEnabled: false, dockHideMs: ms })).toBe(true);
    expect(wantsActivityListeners({ isMobile: false, screensaverEnabled: true, dockHideMs: ms })).toBe(true);
    expect(wantsActivityListeners({ isMobile: true, screensaverEnabled: true, dockHideMs: ms })).toBe(false);
  });
});

describe('dock idle timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const start = (timeoutMs) => {
    const changes = [];
    const timer = createDockIdleTimer({ timeoutMs, onChange: (hidden) => changes.push(hidden) });
    return { timer, changes };
  };

  it('hides after the idle time and comes back on the next activity', () => {
    const { timer, changes } = start(60_000);
    timer.poke();
    vi.advanceTimersByTime(59_999);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
    timer.poke();
    expect(changes).toEqual([true, false]);
  });

  it('restarts the countdown on every activity', () => {
    const { timer, changes } = start(60_000);
    timer.poke();
    vi.advanceTimersByTime(50_000);
    timer.poke();
    vi.advanceTimersByTime(50_000);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([true]);
  });

  it('never hides when off', () => {
    const { timer, changes } = start(null);
    timer.poke();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(changes).toEqual([]);
  });

  it('shows the dock and stops counting while suspended, as with Admin open', () => {
    const { timer, changes } = start(60_000);
    timer.poke();
    vi.advanceTimersByTime(60_000);
    timer.setSuspended(true);
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(changes).toEqual([true, false]);
    timer.setSuspended(false);
    vi.advanceTimersByTime(60_000);
    expect(changes).toEqual([true, false, true]);
  });

  it('stops on dispose', () => {
    const { timer, changes } = start(60_000);
    timer.poke();
    timer.dispose();
    vi.advanceTimersByTime(60_000);
    expect(changes).toEqual([]);
  });
});
