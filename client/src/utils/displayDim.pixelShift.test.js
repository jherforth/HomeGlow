import { describe, it, expect } from 'vitest';
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

  it('shifts only when enabled, on the 4-minute cadence', () => {
    const root = { style: {}, dataset: {} };
    const el = { style: {}, classList: { toggle() {} } };
    let tick;
    globalThis.document = {
      documentElement: el,
      body: { style: {}, appendChild() {} },
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
    expect(root.style.transform).toBeFalsy();
    tick();
    expect(root.style.transform).toBe('translate(4px, 3px)');

    updateDisplayDimming({ enabled: false, pixelShift: false, day: 0.7, night: 0.03, after: 20, nightStart: 0, nightEnd: 6 });
    root.style.transform = '';
    for (let i = 0; i < PIXEL_SHIFT_INTERVAL_MS / 1000; i++) tick();
    expect(root.style.transform).toBe('');
  });
});
