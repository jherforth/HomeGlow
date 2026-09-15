import { describe, it, expect } from 'vitest';
import { buildLayout } from './gridPlacement';

const plugin = (id) => ({
  id,
  defaultPosition: { x: 0, y: 0 },
  defaultSize: { width: 6, height: 4 },
  minWidth: 2,
  minHeight: 2,
});

const overlaps = (items) => {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]; const b = items[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        return [a.i, b.i];
      }
    }
  }
  return null;
};

describe('buildLayout', () => {
  // The regression this helper exists to prevent: every plugin widget declares
  // defaultPosition (0,0) and defaultSize 6x4, so placing them at their defaults
  // stacks the entire plugin set in one cell.
  it('does not stack widgets that share identical defaults', () => {
    const out = buildLayout([plugin('a'), plugin('b'), plugin('c')], 12, false);
    expect(out).toHaveLength(3);
    expect(overlaps(out)).toBeNull();
  });

  it('keeps a saved layout rather than re-placing it', () => {
    const w = { ...plugin('a'), savedLayout: { x: 6, y: 9, w: 6, h: 4 } };
    const [item] = buildLayout([w], 12, false);
    expect({ x: item.x, y: item.y, w: item.w, h: item.h }).toEqual({ x: 6, y: 9, w: 6, h: 4 });
  });

  it('mixes saved and unsaved widgets without collisions', () => {
    const saved = { ...plugin('saved'), savedLayout: { x: 0, y: 0, w: 12, h: 5 } };
    const out = buildLayout([saved, plugin('new1'), plugin('new2')], 12, false);
    expect(overlaps(out)).toBeNull();
    // the unsaved ones must go below the full-width saved one, not on top of it
    expect(out[1].y).toBeGreaterThanOrEqual(5);
    expect(out[2].y).toBeGreaterThanOrEqual(5);
  });

  it('returns exactly one entry per widget, in order', () => {
    const out = buildLayout([plugin('a'), plugin('b')], 12, false);
    expect(out.map((i) => i.i)).toEqual(['a', 'b']);
  });

  it('marks items static to match the lock state', () => {
    expect(buildLayout([plugin('a')], 12, true)[0].static).toBe(true);
    expect(buildLayout([plugin('a')], 12, false)[0].static).toBe(false);
  });

  it('never places an item past the right edge', () => {
    const out = buildLayout([plugin('a'), plugin('b'), plugin('c')], 12, false);
    out.forEach((i) => expect(i.x + i.w).toBeLessThanOrEqual(12));
  });
});
