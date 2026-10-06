import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_GRID_COLS,
  clampLayoutItem,
  layoutItemFromNormalized,
  layoutItemToNormalized,
  layoutToNormalized,
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

describe('layoutToNormalized', () => {
  // Three 4-wide widgets across a 12-col row. On an 8-col tablet they show as
  // 0..3, 3..5 and 5..8; converted back one by one they would become 0..5,
  // 5..8 and 8..12 — every width changed by a save that touched nothing.
  const stored = new Map([
    ['a', { x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 }],
    ['b', { x: 4, y: 0, w: 4, h: 3, minW: 2, minH: 2 }],
    ['c', { x: 8, y: 0, w: 4, h: 3, minW: 2, minH: 2 }],
  ]);
  const liveAt = (cols, ids = [...stored.keys()]) =>
    ids.map((i) => ({ i, ...layoutItemFromNormalized(stored.get(i), cols) }));
  const edges = (items) => Object.fromEntries(items.map((item) => [item.i, [item.x, item.w, item.y, item.h]]));

  it('saves untouched widgets exactly as they were stored', () => {
    const live = liveAt(8);
    expect(edges(live)).toEqual({ a: [0, 3, 0, 3], b: [3, 2, 0, 3], c: [5, 3, 0, 3] });
    // What converting each widget on its own does.
    expect(layoutItemToNormalized(live[1], 8)).toMatchObject({ x: 5, w: 3 });

    expect(edges(layoutToNormalized(live, 8, stored))).toEqual({
      a: [0, 4, 0, 3], b: [4, 4, 0, 3], c: [8, 4, 0, 3],
    });
  });

  it('keeps the width of a widget that only changed height or row', () => {
    const live = liveAt(8).map((item) => {
      if (item.i === 'b') return { ...item, h: 5 };
      if (item.i === 'c') return { ...item, y: 4 };
      return item;
    });
    expect(edges(layoutToNormalized(live, 8, stored))).toEqual({
      a: [0, 4, 0, 3], b: [4, 4, 0, 5], c: [8, 4, 4, 3],
    });
  });

  it('stores a widget dragged against an untouched neighbour touching it, not overlapping', () => {
    // 'd' dropped at 1..3 on the tablet, flush against 'b' (3..5). Converted
    // alone its right edge is 5 — a column into 'b', which starts at 4.
    const live = [...liveAt(8, ['b', 'c']), { i: 'd', x: 1, y: 0, w: 2, h: 3, minW: 1, minH: 2 }];
    expect(layoutItemToNormalized(live[2], 8)).toMatchObject({ x: 2, w: 3 });
    expect(edges(layoutToNormalized(live, 8, stored)).d).toEqual([2, 2, 0, 3]);

    // Flush against the right of 'a' (0..3): starts where 'a' ends, at 4.
    const rightOfA = [...liveAt(8, ['a']), { i: 'd', x: 3, y: 0, w: 2, h: 3, minW: 1, minH: 2 }];
    expect(edges(layoutToNormalized(rightOfA, 8, stored)).d).toEqual([4, 4, 0, 3]);
  });

  it('converts a widget with no stored layout as before', () => {
    const fresh = { i: 'new', x: 3, y: 6, w: 3, h: 2, minW: 1, minH: 2 };
    const [saved] = layoutToNormalized([fresh], 8, stored);
    expect(saved).toMatchObject(layoutItemToNormalized(fresh, 8));
  });

  it('saves a 12-col layout as it is', () => {
    const live = [{ i: 'a', x: 1, y: 0, w: 5, h: 3, minW: 2, minH: 2 }, ...liveAt(12, ['b', 'c'])];
    expect(edges(layoutToNormalized(live, 12, stored))).toEqual({
      a: [1, 5, 0, 3], b: [4, 4, 0, 3], c: [8, 4, 0, 3],
    });
  });

  it('turning a phone between 4 and 8 columns loses nothing', () => {
    const portrait = liveAt(4);
    const throughStored = layoutToNormalized(portrait, 4, stored)
      .map((item) => layoutItemFromNormalized(item, 8));
    expect(edges(throughStored)).toEqual(edges(liveAt(8)));
    // Column to column re-rounds through the coarse grid: 'b' becomes 2..6.
    expect(scaleLayoutItem(portrait[1], 4, 8)).toMatchObject({ x: 2, w: 4 });
  });
});
