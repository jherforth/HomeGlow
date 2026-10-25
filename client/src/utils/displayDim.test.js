import { describe, it, expect } from 'vitest';
import {
  activeDimTarget,
  initDisplayDim,
  isNightAt,
  setDimmingPaused,
  updateDisplayDimming,
} from './displayDim.js';
import { DEFAULT_DIMMING } from './appearance.js';

const atHour = (h) => new Date(2026, 0, 1, h, 0, 0);

describe('isNightAt', () => {
  it('applies the window start-inclusive, end-exclusive', () => {
    expect(isNightAt(0, 6, atHour(0))).toBe(true);
    expect(isNightAt(0, 6, atHour(5))).toBe(true);
    expect(isNightAt(0, 6, atHour(6))).toBe(false);
    expect(isNightAt(0, 6, atHour(12))).toBe(false);
  });

  it('wraps past midnight', () => {
    expect(isNightAt(22, 7, atHour(23))).toBe(true);
    expect(isNightAt(22, 7, atHour(3))).toBe(true);
    expect(isNightAt(22, 7, atHour(7))).toBe(false);
    expect(isNightAt(22, 7, atHour(12))).toBe(false);
  });

  it('never applies when start equals end', () => {
    expect(isNightAt(6, 6, atHour(3))).toBe(false);
    expect(isNightAt(6, 6, atHour(6))).toBe(false);
  });

  it('reads the hour in the household timezone, not the device clock', () => {
    // 08:00 UTC on Jan 1 is midnight in Los Angeles (PST, UTC-8) — inside
    // the 00:00-06:00 window there, outside it in UTC.
    const morningUtc = new Date(Date.UTC(2026, 0, 1, 8, 0, 0));
    expect(isNightAt(0, 6, morningUtc, 'America/Los_Angeles')).toBe(true);
    expect(isNightAt(0, 6, morningUtc, 'UTC')).toBe(false);
  });

  it('falls back to local hours for a zone Intl does not know', () => {
    const date = new Date(Date.UTC(2026, 0, 1, 8, 0, 0));
    expect(isNightAt(0, 6, date, 'Bogus/Zone')).toBe(isNightAt(0, 6, date));
  });
});

describe('activeDimTarget', () => {
  it('is null when dimming is disabled', () => {
    expect(activeDimTarget({ ...DEFAULT_DIMMING, enabled: false }, atHour(2))).toBeNull();
    expect(activeDimTarget(null, atHour(2))).toBeNull();
  });

  it('picks the day or night level by the hour', () => {
    const config = { ...DEFAULT_DIMMING, enabled: true, day: 0.7, night: 0.03 };
    expect(activeDimTarget(config, atHour(12))).toBe(0.7);
    expect(activeDimTarget(config, atHour(2))).toBe(0.03);
  });

  it('picks the level by the household timezone hour', () => {
    const config = { ...DEFAULT_DIMMING, enabled: true, day: 0.7, night: 0.03, nightStart: 0, nightEnd: 6 };
    const morningUtc = new Date(Date.UTC(2026, 0, 1, 8, 0, 0));
    expect(activeDimTarget(config, morningUtc, 'America/Los_Angeles')).toBe(0.03);
    expect(activeDimTarget(config, morningUtc, 'UTC')).toBe(0.7);
  });
});

describe('live dimming with a stubbed DOM', () => {
  it('applies settings live, pauses while Admin is open, and wakes on plugin activity', () => {
    const el = { style: {}, classList: { toggle() {} } };
    const listeners = {};
    let tick;
    const pluginWindow = {};
    globalThis.document = {
      querySelectorAll: (selector) => (selector === 'iframe' ? [{ contentWindow: pluginWindow }] : []),
      documentElement: el,
      body: { style: {}, appendChild() {} },
      head: { appendChild() {} },
      getElementById: () => ({}),
      createElement: () => ({ style: {}, addEventListener() {} }),
    };
    globalThis.window = {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      setInterval: (fn) => { tick = fn; return 1; },
    };

    initDisplayDim();
    // Enabled with a zero delay dims immediately. An equal start/end window
    // never counts as night, so the day target applies whatever time the
    // test runs at.
    const immediate = { enabled: true, day: 0.7, night: 0.03, after: 0, nightStart: 6, nightEnd: 6 };
    updateDisplayDimming(immediate);
    expect(el.style.filter).toBe('brightness(0.7)');

    // Pausing (Admin open) undims at once, and the interval tick while
    // paused leaves it undimmed.
    setDimmingPaused(true);
    expect(el.style.filter).toBe('');
    tick();
    expect(el.style.filter).toBe('');
    // Unpausing restarts the idle clock, so it stays undimmed until the
    // next tick, when the zero delay dims again.
    setDimmingPaused(false);
    expect(el.style.filter).toBe('');
    tick();
    expect(el.style.filter).toBe('brightness(0.7)');

    // A plugin frame reporting use wakes the panel. The same message from a
    // window that isn't a frame on this page, or another message type from
    // the frame, does not.
    listeners.message({ data: { type: 'homeglow:activity' }, source: {} });
    expect(el.style.filter).toBe('brightness(0.7)');
    listeners.message({ data: { type: 'homeglow:frame-activity' }, source: pluginWindow });
    expect(el.style.filter).toBe('brightness(0.7)');
    listeners.message({ data: { type: 'homeglow:activity' }, source: pluginWindow });
    expect(el.style.filter).toBe('');
    updateDisplayDimming(immediate);
    expect(el.style.filter).toBe('brightness(0.7)');

    // Disabling clears the filter without a reload.
    updateDisplayDimming({ enabled: false });
    expect(el.style.filter).toBe('');
  });
});
