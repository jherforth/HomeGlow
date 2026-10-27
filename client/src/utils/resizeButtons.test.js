import { describe, it, expect } from 'vitest';
import { resizeButtonMetrics, widgetPixelSize, RESIZE_BUTTON_MAX, RESIZE_BUTTON_MIN } from './resizeButtons.js';

const grid = { containerWidth: 1440, cols: 12, rowHeight: 100, gap: 16 };
// Do the four pairs stay apart? Top row against the side columns, and the
// side columns against the top and bottom rows.
const fits = (size, m) => {
  const row = 2 * m.box + m.gap;
  return row <= size.width - 2 * (m.inset + m.box) && row <= size.height - 2 * (m.inset + m.box);
};

describe('resize buttons', () => {
  it('stay their normal size on a normal widget', () => {
    expect(resizeButtonMetrics(widgetPixelSize({ w: 4, h: 3 }, grid)).box).toBe(RESIZE_BUTTON_MAX);
  });

  it('shrink on small widgets so the pairs never overlap', () => {
    for (const units of [{ w: 1, h: 1 }, { w: 1, h: 2 }, { w: 2, h: 1 }, { w: 2, h: 2 }]) {
      const size = widgetPixelSize(units, grid);
      const m = resizeButtonMetrics(size);
      expect(m.box).toBeLessThanOrEqual(RESIZE_BUTTON_MAX);
      expect(fits(size, m)).toBe(true);
    }
    expect(resizeButtonMetrics(widgetPixelSize({ w: 1, h: 1 }, grid)).box).toBeLessThan(RESIZE_BUTTON_MAX);
  });

  it('never get smaller than a fingertip can still hit', () => {
    expect(resizeButtonMetrics({ width: 40, height: 40 }).box).toBe(RESIZE_BUTTON_MIN);
  });

  it('works out a widget size in pixels', () => {
    expect(Math.round(widgetPixelSize({ w: 1, h: 1 }, grid).width)).toBe(105);
    expect(widgetPixelSize({ w: 1, h: 1 }, grid).height).toBe(100);
    expect(widgetPixelSize({ w: 2, h: 2 }, grid).height).toBe(216);
  });
});
