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

  it('never lets x+w exceed the grid width when rounding (issue: 8-col to 12-col overlap)', () => {
    // The reported bug: weather at tablet width (x=5, w=3 in 8 cols) saved back
    // as x=7.5→8 and w=4.5→5 = 13 columns, one into the calendar. Rounding the
    // left and right edges and deriving the width keeps x+w within the grid.
    const scaled = scaleLayoutItem(
      { x: 5, y: 0, w: 3, h: 5, minW: 2, minH: 2 },
      8,
      NORMALIZED_GRID_COLS
    );
    expect(scaled.x + scaled.w).toBeLessThanOrEqual(NORMALIZED_GRID_COLS);
  });

  it('keeps touching widgets touching after scaling', () => {
    // Two widgets that exactly tile the 8-col grid must still tile the 12-col
    // grid without overlap or gap.
    const left = scaleLayoutItem({ x: 0, y: 0, w: 5, h: 5, minW: 2, minH: 2 }, 8, 12);
    const right = scaleLayoutItem({ x: 5, y: 0, w: 3, h: 5, minW: 2, minH: 2 }, 8, 12);
    expect(left.x + left.w).toBe(right.x);
    expect(right.x + right.w).toBeLessThanOrEqual(12);
  });

  it('scales the minimum width with the columns', () => {
    // A 12-col minimum of 3 is a quarter of the grid; at 8 columns that is 2.
    // Left at 3, the clamp would widen a 2-wide widget into its neighbour.
    const down = scaleLayoutItem({ x: 4, y: 0, w: 4, h: 3, minW: 3, minH: 2 }, 12, 8);
    expect(down).toMatchObject({ x: 3, w: 2, minW: 2 });
    const up = scaleLayoutItem({ x: 3, y: 0, w: 2, h: 3, minW: 2, minH: 2 }, 8, 12);
    expect(up.minW).toBe(3);
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
