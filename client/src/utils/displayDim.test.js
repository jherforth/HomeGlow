import { describe, it, expect } from 'vitest';
import {
  activeDimTarget,
  initDisplayDim,
  isNightAt,
  resolveDimmingConfig,
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
});

describe('resolveDimmingConfig', () => {
  it('uses the settings as-is when no URL parameters are present', () => {
    expect(resolveDimmingConfig({ settings: { enabled: true, day: 0.5 }, search: '' }))
      .toEqual({ ...DEFAULT_DIMMING, enabled: true, day: 0.5 });
  });

  it('is disabled by default', () => {
    expect(resolveDimmingConfig({})).toEqual(DEFAULT_DIMMING);
  });

  it('layers URL parameters on top of the settings and enables dimming', () => {
    const config = resolveDimmingConfig({
      settings: { enabled: false, day: 0.5, night: 0.1, after: 30, nightStart: 1, nightEnd: 5 },
      search: '?dim=0.6&dimAfter=10',
    });
    expect(config).toEqual({
      enabled: true, day: 0.6, night: 0.1, after: 10, nightStart: 1, nightEnd: 5,
    });
  });

  it('ignores malformed URL values instead of breaking', () => {
    const config = resolveDimmingConfig({ settings: { enabled: true }, search: '?dim=bright&nightStart=ten' });
    expect(config.day).toBe(DEFAULT_DIMMING.day);
    expect(config.nightStart).toBe(DEFAULT_DIMMING.nightStart);
    expect(config.enabled).toBe(true);
  });

  it('clamps URL levels and hours', () => {
    const config = resolveDimmingConfig({ search: '?dim=2&dimNight=-1&nightStart=30' });
    expect(config.day).toBe(1);
    expect(config.night).toBe(0);
    expect(config.nightStart).toBe(23);
  });
});

describe('live dimming with a stubbed DOM', () => {
  it('applies settings live and clears the filter when disabled', () => {
    const el = { style: {}, classList: { toggle() {} } };
    globalThis.document = {
      documentElement: el,
      body: { style: {}, appendChild() {} },
      head: { appendChild() {} },
      getElementById: () => ({}),
      createElement: () => ({ style: {}, addEventListener() {} }),
    };
    globalThis.window = {
      location: { search: '' },
      addEventListener() {},
      setInterval: () => 1,
    };

    initDisplayDim();
    // Enabled with a zero delay dims immediately. An equal start/end window
    // never counts as night, so the day target applies whatever time the
    // test runs at.
    updateDisplayDimming({ enabled: true, day: 0.7, night: 0.03, after: 0, nightStart: 6, nightEnd: 6 });
    expect(el.style.filter).toBe('brightness(0.7)');
    // Disabling clears the filter without a reload.
    updateDisplayDimming({ enabled: false });
    expect(el.style.filter).toBe('');
  });
});
