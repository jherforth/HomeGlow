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

  // Kitchen Pi, production, 2026-09-26: the weather widget was enabled on a board
  // where chores already held the right-hand column, and the two ended up on the
  // same cell. A single placement pass only knows the widgets it has already
  // walked, so weather (no saved layout, and earlier in app.jsx's fixed order)
  // was put in the first free cell, which chores then claimed back from its saved
  // layout. The stored result was weather(8,0,4x3) under chores(8,0,4x9).
  const calendarSaved = {
    id: 'calendar-widget',
    defaultPosition: { x: 0, y: 0 }, defaultSize: { width: 8, height: 5 },
    minWidth: 2, minHeight: 2, savedLayout: { x: 0, y: 0, w: 8, h: 6 },
  };
  const weatherUnsaved = {
    id: 'weather-widget',
    defaultPosition: { x: 8, y: 0 }, defaultSize: { width: 4, height: 3 },
    minWidth: 2, minHeight: 2,
  };
  const choresSaved = {
    id: 'chores-widget',
    defaultPosition: { x: 0, y: 5 }, defaultSize: { width: 6, height: 4 },
    minWidth: 2, minHeight: 2, savedLayout: { x: 8, y: 0, w: 4, h: 9 },
  };

  it('keeps an unsaved widget clear of a saved one that comes later in the array', () => {
    const out = buildLayout([calendarSaved, weatherUnsaved, choresSaved], 12, false);
    expect(overlaps(out)).toBeNull();
    // chores keeps its saved cell; weather is the one that has to move
    expect(out.find((i) => i.i === 'chores-widget')).toMatchObject({ x: 8, y: 0, w: 4, h: 9 });
  });

  it('stays collision free for every input ordering', () => {
    const permute = (items) => (items.length <= 1 ? [items] : items.flatMap(
      (item, idx) => permute([...items.slice(0, idx), ...items.slice(idx + 1)]).map((rest) => [item, ...rest])
    ));
    const orderings = permute([calendarSaved, weatherUnsaved, choresSaved]);
    expect(orderings).toHaveLength(6);
    orderings.forEach((ordering) => {
      const out = buildLayout(ordering, 12, false);
      expect(overlaps(out), ordering.map((w) => w.id).join(' then ')).toBeNull();
    });
  });

  // A new device is seeded with config_json '{}', so on first run nothing has a
  // saved layout and this function decides the whole board. Filling gaps from the
  // top must reproduce the arrangement app.jsx declares, rather than stacking the
  // widgets down the left edge, which on a 1080p wall display would push more
  // than half of them off screen.
  it('tiles a fresh board into the declared default arrangement', () => {
    const core = [
      { id: 'calendar', defaultPosition: { x: 0, y: 0 }, defaultSize: { width: 8, height: 5 }, minWidth: 2, minHeight: 2 },
      { id: 'weather', defaultPosition: { x: 8, y: 0 }, defaultSize: { width: 4, height: 3 }, minWidth: 2, minHeight: 2 },
      { id: 'chores', defaultPosition: { x: 0, y: 5 }, defaultSize: { width: 6, height: 4 }, minWidth: 2, minHeight: 2 },
      { id: 'photos', defaultPosition: { x: 6, y: 5 }, defaultSize: { width: 6, height: 4 }, minWidth: 2, minHeight: 2 },
    ];
    const out = buildLayout(core, 12, false);
    expect(overlaps(out)).toBeNull();
    core.forEach((widget) => {
      expect(out.find((i) => i.i === widget.id)).toMatchObject(widget.defaultPosition);
    });
    expect(Math.max(...out.map((i) => i.y + i.h))).toBe(9);
  });

  it('appends below the lowest edge when no gap fits', () => {
    const block = { ...plugin('full'), savedLayout: { x: 0, y: 0, w: 12, h: 7 } };
    const [, added] = buildLayout([block, plugin('added')], 12, false);
    expect(added.y).toBe(7);
    expect(added.x).toBe(0);
  });

  it('never places an item past the right edge', () => {
    const out = buildLayout([plugin('a'), plugin('b'), plugin('c')], 12, false);
    out.forEach((i) => expect(i.x + i.w).toBeLessThanOrEqual(12));
  });

  it('re-places a saved position that collides with an already-claimed one', () => {
    // Regression for overlapping saved data (e.g. saved at a narrower width
    // before edge-based scaling): the colliding widget is treated as unsaved
    // and moved to a free cell instead of stacking on top of the first.
    const a = { ...plugin('a'), savedLayout: { x: 0, y: 0, w: 6, h: 4 } };
    const b = { ...plugin('b'), savedLayout: { x: 4, y: 0, w: 6, h: 4 } };
    const out = buildLayout([a, b], 12, false);
    expect(overlaps(out)).toBeNull();
    // The first widget keeps its saved spot; the colliding one is re-placed.
    expect(out[0]).toMatchObject({ x: 0, y: 0, w: 6, h: 4 });
    expect(out[1]).not.toMatchObject({ x: 4, y: 0 });
  });

  // Core widgets take buildLayout's default minimum of 3 (12-col units).
  const core = (id, x, w) => ({
    id,
    defaultPosition: { x: 0, y: 0 },
    defaultSize: { width: 4, height: 3 },
    savedLayout: { x, y: 0, w, h: 3 },
  });

  it('keeps three 4-wide widgets in one row at 8 columns', () => {
    // At 8 columns the row is 3+2+3. With the minimum left in 12-col units the
    // middle widget was clamped back to 3 and the third pushed to a new row.
    const out = buildLayout([core('a', 0, 4), core('b', 4, 4), core('c', 8, 4)], 8, false);
    expect(overlaps(out)).toBeNull();
    out.forEach((i) => expect(i.y).toBe(0));
    expect(out.map((i) => i.x + i.w)).toEqual([3, 5, 8]);
  });

  it('keeps every row of widgets that fits 12 columns in one row at 8 columns', () => {
    const rows = [];
    for (let a = 3; a <= 9; a += 1) {
      for (let b = 3; a + b <= 12; b += 1) {
        rows.push([a, b]);
        for (let c = 3; a + b + c <= 12; c += 1) rows.push([a, b, c]);
      }
    }
    for (const widths of rows) {
      let x = 0;
      const widgets = widths.map((w, k) => {
        const widget = core(`w${k}`, x, w);
        x += w;
        return widget;
      });
      const out = buildLayout(widgets, 8, true);
      expect(overlaps(out), widths.join('+')).toBeNull();
      out.forEach((i) => expect(i.y, widths.join('+')).toBe(0));
    }
  });
});
