import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPAND_IDLE_MINUTES,
  DOUBLE_TAP_MS,
  FRAME_ACTIVITY_MESSAGE_TYPE,
  FRAME_DOUBLE_TAP_MESSAGE_TYPE,
  FRAME_EXPAND_MESSAGE_TYPE,
  acceptFrameExpandMessage,
  buildFrameExpandMessage,
  createDoubleTapDetector,
  expandIdleTimeoutMs,
  expandedRect,
  frameExpandSetting,
  isWidgetExpandable,
  nextSizeOnDoubleTap,
  normalizeExpandIdleMinutes,
  normalizeExpandMethod,
  normalizeExpandOff,
  setWidgetExpandAllowed,
} from './widgetExpand.js';
import { DEFAULT_SCREENSAVER_SETTINGS, normalizeScreensaverSettings } from './interfaceSettings.js';

describe('settings', () => {
  it('is off by default, so no display changes on upgrade', () => {
    expect(DEFAULT_SCREENSAVER_SETTINGS.expandWidgets).toBe(false);
    const settings = normalizeScreensaverSettings({});
    expect(settings.expandWidgets).toBe(false);
    expect(settings.expandMethod).toBe('doubleTap');
    expect(settings.expandIdleMinutes).toBe(DEFAULT_EXPAND_IDLE_MINUTES);
    expect(settings.expandOff).toEqual([]);
  });

  it('cleans up whatever was stored', () => {
    const settings = normalizeScreensaverSettings({
      expandWidgets: 'true',
      expandMethod: 'shake',
      expandIdleMinutes: '5',
      expandOff: ['calendar', 'calendar', 7, '', 'plugin:Grill.html'],
    });
    expect(settings.expandWidgets).toBe(false);
    expect(settings.expandMethod).toBe('doubleTap');
    expect(settings.expandIdleMinutes).toBe(5);
    expect(settings.expandOff).toEqual(['calendar', 'plugin:Grill.html']);
  });

  it('keeps the button method', () => {
    expect(normalizeExpandMethod('button')).toBe('button');
  });

  it('reads the auto-return time: 0 is never, missing is the default, the rest is clamped', () => {
    expect(normalizeExpandIdleMinutes(0)).toBe(0);
    expect(normalizeExpandIdleMinutes(-3)).toBe(0);
    expect(normalizeExpandIdleMinutes('abc')).toBe(0);
    expect(normalizeExpandIdleMinutes(undefined)).toBe(DEFAULT_EXPAND_IDLE_MINUTES);
    expect(normalizeExpandIdleMinutes(2.7)).toBe(2);
    expect(normalizeExpandIdleMinutes(999)).toBe(60);
    expect(expandIdleTimeoutMs(0)).toBe(null);
    expect(expandIdleTimeoutMs(2)).toBe(120000);
  });

  it('keeps only names in the left-out list', () => {
    expect(normalizeExpandOff('calendar')).toEqual([]);
    expect(normalizeExpandOff(['weather', null])).toEqual(['weather']);
  });
});

describe('which widgets expand', () => {
  const on = normalizeScreensaverSettings({ expandWidgets: true, expandOff: ['photos'] });

  it('none while the display has it off', () => {
    expect(isWidgetExpandable({ settings: normalizeScreensaverSettings({}), widgetName: 'calendar' })).toBe(false);
  });

  it('every widget not left out', () => {
    expect(isWidgetExpandable({ settings: on, widgetName: 'calendar' })).toBe(true);
    expect(isWidgetExpandable({ settings: on, widgetName: 'plugin:Grill.html' })).toBe(true);
    expect(isWidgetExpandable({ settings: on, widgetName: 'photos' })).toBe(false);
  });

  it('never a plugin whose manifest says "expand": false', () => {
    expect(isWidgetExpandable({ settings: on, widgetName: 'plugin:Grill.html', manifestExpand: false })).toBe(false);
  });

  it('turns a widget on and off in the list', () => {
    expect(setWidgetExpandAllowed(['photos'], 'calendar', false)).toEqual(['photos', 'calendar']);
    expect(setWidgetExpandAllowed(['photos', 'calendar'], 'calendar', true)).toEqual(['photos']);
    expect(setWidgetExpandAllowed(['photos'], 'photos', false)).toEqual(['photos']);
  });
});

describe('sizes', () => {
  it('a double-tap goes to the top half and back', () => {
    expect(nextSizeOnDoubleTap('normal')).toBe('half');
    expect(nextSizeOnDoubleTap('half')).toBe('normal');
    expect(nextSizeOnDoubleTap('full')).toBe('normal');
  });

  it('half is always the top half of the page, inside the theme gap', () => {
    expect(expandedRect('half', { width: 2560, height: 1440, gap: 16 })).toEqual({ top: 16, left: 16, width: 2528, height: 696 });
  });

  it('full is the whole page, inside the theme gap', () => {
    expect(expandedRect('full', { width: 2560, height: 1440, gap: 16 })).toEqual({ top: 16, left: 16, width: 2528, height: 1408 });
  });

  it('normal has no rectangle', () => {
    expect(expandedRect('normal', { width: 100, height: 100 })).toBe(null);
  });
});

describe('double-tap detector', () => {
  it('two close, quick taps are a double-tap', () => {
    const detector = createDoubleTapDetector();
    expect(detector.tap({ x: 100, y: 100, at: 0 })).toBe('single');
    expect(detector.tap({ x: 110, y: 95, at: DOUBLE_TAP_MS - 1 })).toBe('double');
  });

  it('a third tap starts over', () => {
    const detector = createDoubleTapDetector();
    detector.tap({ x: 0, y: 0, at: 0 });
    detector.tap({ x: 0, y: 0, at: 100 });
    expect(detector.tap({ x: 0, y: 0, at: 200 })).toBe('single');
  });

  it('slow or far-apart taps are singles', () => {
    const detector = createDoubleTapDetector();
    detector.tap({ x: 0, y: 0, at: 0 });
    expect(detector.tap({ x: 0, y: 0, at: DOUBLE_TAP_MS + 1 })).toBe('single');
    expect(detector.tap({ x: 200, y: 0, at: DOUBLE_TAP_MS + 50 })).toBe('single');
  });

  it('forgets on reset', () => {
    const detector = createDoubleTapDetector();
    detector.tap({ x: 0, y: 0, at: 0 });
    detector.reset();
    expect(detector.tap({ x: 0, y: 0, at: 10 })).toBe('single');
  });
});

describe('plugin frames', () => {
  const frame = {};
  const origin = 'http://homeglow.local';

  it("hears double-taps and touches from the wrapper's own frame and origin only", () => {
    const from = (data, overrides = {}) => ({ source: frame, origin, data, ...overrides });
    expect(acceptFrameExpandMessage(from({ type: FRAME_DOUBLE_TAP_MESSAGE_TYPE }), frame, origin)).toBe('doubleTap');
    expect(acceptFrameExpandMessage(from({ type: FRAME_ACTIVITY_MESSAGE_TYPE }), frame, origin)).toBe('activity');
    expect(acceptFrameExpandMessage(from({ type: FRAME_DOUBLE_TAP_MESSAGE_TYPE }, { source: {} }), frame, origin)).toBe(null);
    expect(acceptFrameExpandMessage(from({ type: FRAME_DOUBLE_TAP_MESSAGE_TYPE }, { origin: 'http://evil' }), frame, origin)).toBe(null);
    expect(acceptFrameExpandMessage(from({ type: 'homeglow:touch' }), frame, origin)).toBe(null);
  });

  it('tells the plugin its size', () => {
    expect(buildFrameExpandMessage('half')).toEqual({ type: FRAME_EXPAND_MESSAGE_TYPE, size: 'half' });
    expect(buildFrameExpandMessage('huge')).toEqual({ type: FRAME_EXPAND_MESSAGE_TYPE, size: 'normal' });
  });

  it('tells the plugin how it expands, or false', () => {
    expect(frameExpandSetting(true, 'button')).toBe('button');
    expect(frameExpandSetting(true, undefined)).toBe('doubleTap');
    expect(frameExpandSetting(false, 'button')).toBe(false);
  });
});
