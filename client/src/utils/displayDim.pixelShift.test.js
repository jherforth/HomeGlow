import { describe, it, expect, afterEach } from 'vitest';
import {
  PIXEL_SHIFT_OFFSETS,
  PIXEL_SHIFT_INTERVAL_MS,
  pixelShiftOffset,
  initDisplayDim,
  updateDisplayDimming,
} from './displayDim.js';

// Pixel shift against image persistence on always-on displays: the whole
// dashboard drifts a few pixels on a slow cycle. 4px / 4 minutes matches
// the optimum in Samsung's signage manuals.
describe('pixel shift', () => {
  it('uses small offsets only', () => {
    expect(PIXEL_SHIFT_OFFSETS.length).toBeGreaterThan(1);
    for (const { x, y } of PIXEL_SHIFT_OFFSETS) {
      expect(Math.abs(x)).toBeLessThanOrEqual(4);
      expect(Math.abs(y)).toBeLessThanOrEqual(4);
    }
  });

  it('cycles deterministically and wraps', () => {
    expect(pixelShiftOffset(0)).toEqual(PIXEL_SHIFT_OFFSETS[0]);
    expect(pixelShiftOffset(PIXEL_SHIFT_OFFSETS.length)).toEqual(PIXEL_SHIFT_OFFSETS[0]);
    expect(pixelShiftOffset(-1)).toEqual(PIXEL_SHIFT_OFFSETS[PIXEL_SHIFT_OFFSETS.length - 1]);
  });

  it('steps slowly (minutes, not seconds)', () => {
    expect(PIXEL_SHIFT_INTERVAL_MS).toBeGreaterThanOrEqual(60 * 1000);
  });

  // The stubs stand in for the test runner's own globals while this test
  // runs, then hand them back: later files must not see a fake document.
  const savedDocument = globalThis.document;
  const savedWindow = globalThis.window;
  afterEach(() => {
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  });

  it('shifts only when enabled, on the 4-minute cadence', () => {
    const root = { style: {}, dataset: {} };
    const bodyStyle = {};
    const el = { style: {}, classList: { toggle() {} } };
    let tick;
    globalThis.document = {
      documentElement: el,
      body: { style: bodyStyle, appendChild() {} },
      head: { appendChild() {} },
      getElementById: (id) => (id === 'root' ? root : {}),
      createElement: () => ({ style: {}, addEventListener() {} }),
    };
    globalThis.window = {
      addEventListener() {},
      setInterval: (fn) => { tick = fn; return 1; },
    };

    initDisplayDim();
    updateDisplayDimming({ enabled: false, pixelShift: true, day: 0.7, night: 0.03, after: 20, nightStart: 0, nightEnd: 6 });
    for (let i = 0; i < PIXEL_SHIFT_INTERVAL_MS / 1000 - 1; i++) tick();
    expect(root.style.left).toBeFalsy();
    expect(root.style.transform).toBeFalsy();
    tick();
    // Relative offsets, never a transform: a transform on #root would make
    // it the containing block for the fixed dock, screensaver and theme
    // scene, so the shift must not set one.
    expect(root.style.position).toBe('relative');
    expect(root.style.left).toBe('4px');
    expect(root.style.top).toBe('3px');
    expect(root.style.transform).toBeFalsy();
    expect(root.dataset.pixelShift).toBe('on');
    expect(bodyStyle.overflowX).toBe('hidden');

    // Switching off resets everything at once — the test must not clear
    // the offset itself first, or the reset it is meant to cover is masked.
    updateDisplayDimming({ enabled: false, pixelShift: false, day: 0.7, night: 0.03, after: 20, nightStart: 0, nightEnd: 6 });
    expect(root.style.position).toBe('');
    expect(root.style.left).toBe('');
    expect(root.style.top).toBe('');
    expect(root.style.transition).toBe('');
    expect(root.dataset.pixelShift).toBeUndefined();
    expect(bodyStyle.overflowX).toBe('');
    for (let i = 0; i < PIXEL_SHIFT_INTERVAL_MS / 1000; i++) tick();
    expect(root.style.left).toBe('');
    expect(root.style.top).toBe('');
  });
});
