import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_GRID_COLS,
  clampLayoutItem,
  layoutItemFromNormalized,
  layoutItemToNormalized,
  scaleLayoutItem,
} from './gridLayout.js';

describe('clampLayoutItem', () => {
  it('caps width to the column count', () => {
    expect(clampLayoutItem({ x: 0, y: 0, w: 8, h: 5, minW: 2, minH: 2 }, 4)).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 5,
      minW: 2,
      minH: 2,
    });
  });

  it('shifts x left when the item would overflow', () => {
    expect(clampLayoutItem({ x: 2, y: 0, w: 3, h: 2, minW: 1, minH: 1 }, 4)).toEqual({
      x: 1,
      y: 0,
      w: 3,
      h: 2,
      minW: 1,
      minH: 1,
    });
  });
});

describe('scaleLayoutItem', () => {
  it('scales a half-width desktop widget to a usable mobile width', () => {
    // Calendar default: 8/12 ≈ two-thirds. On 4 cols → 3, so "+" can still grow to full width.
    const scaled = scaleLayoutItem(
      { x: 0, y: 0, w: 8, h: 5, minW: 2, minH: 2 },
      NORMALIZED_GRID_COLS,
      4
    );
    expect(scaled.w).toBe(3);
    expect(scaled.x).toBe(0);
    expect(scaled.x + scaled.w).toBeLessThan(4);
  });

  it('scales full-width desktop to full-width mobile', () => {
    const scaled = scaleLayoutItem(
      { x: 0, y: 0, w: 12, h: 5, minW: 2, minH: 2 },
      NORMALIZED_GRID_COLS,
      4
    );
    expect(scaled).toMatchObject({ x: 0, w: 4 });
  });

  it('scales mobile full-width back to desktop full-width', () => {
    const scaled = scaleLayoutItem(
      { x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 2 },
      4,
      NORMALIZED_GRID_COLS
    );
    expect(scaled).toMatchObject({ x: 0, w: 12 });
  });
});

describe('normalized conversion', () => {
  it('round-trips through normalized units', () => {
    const mobile = { x: 0, y: 1, w: 3, h: 5, minW: 2, minH: 2 };
    const stored = layoutItemToNormalized(mobile, 4);
    const restored = layoutItemFromNormalized(stored, 4);
    expect(restored).toMatchObject({ x: 0, w: 3, h: 5 });
  });

  it('lets a non-full mobile widget grow after loading a desktop layout', () => {
    const fromDesktop = layoutItemFromNormalized(
      { x: 0, y: 0, w: 8, h: 5, minW: 2, minH: 2 },
      4
    );
    expect(fromDesktop.x + fromDesktop.w).toBeLessThan(4);
  });
});
