import { describe, it, expect } from 'vitest';
import { shouldAcceptLayoutChange, reconcileLayoutWithLive } from './layoutSync';

const item = (i, x, y, w, h) => ({ i, x, y, w, h });

describe('reconcileLayoutWithLive', () => {
  it('keeps live positions for touched items and takes server values elsewhere', () => {
    const { layout, touched } = reconcileLayoutWithLive(
      [item('a', 0, 0, 6, 4), item('b', 6, 0, 6, 4)],
      [item('a', 0, 0, 6, 4), item('b', 6, 8, 6, 4)],
      new Set(['b']),
    );
    expect(layout).toEqual([item('a', 0, 0, 6, 4), item('b', 6, 8, 6, 4)]);
    expect([...touched]).toEqual(['b']);
  });

  it('is a plain server rebuild when nothing is touched', () => {
    const built = [item('a', 0, 8, 6, 4)];
    const { layout, touched } = reconcileLayoutWithLive(
      built,
      [item('a', 0, 0, 6, 4)],
      new Set(),
    );
    expect(layout).toEqual(built);
    expect(touched.size).toBe(0);
  });

  it('lets a server-added widget appear and drops a server-removed one (and its touch)', () => {
    const { layout, touched } = reconcileLayoutWithLive(
      [item('a', 0, 0, 6, 4), item('c', 6, 0, 6, 4)],
      [item('a', 0, 0, 6, 4), item('b', 6, 0, 6, 4)],
      new Set(['b']),
    );
    expect(layout.map((x) => x.i)).toEqual(['a', 'c']);
    expect(touched.size).toBe(0);
  });

  it('prunes a touch once live and server converge (its save landed)', () => {
    const { layout, touched } = reconcileLayoutWithLive(
      [item('a', 0, 5, 6, 4)],
      [item('a', 0, 5, 6, 4)],
      new Set(['a']),
    );
    expect(layout).toEqual([item('a', 0, 5, 6, 4)]);
    expect(touched.size).toBe(0);
  });

  it('keeps a touched item that live no longer renders out of the layout', () => {
    const { layout } = reconcileLayoutWithLive(
      [item('a', 0, 0, 6, 4)],
      [],
      new Set(['a']),
    );
    expect(layout).toEqual([item('a', 0, 0, 6, 4)]);
  });
});

describe('shouldAcceptLayoutChange', () => {
  it('accepts a change when the layout state belongs to the active tab', () => {
    expect(shouldAcceptLayoutChange({ locked: false, layoutTab: 1, activeTab: 1 })).toBe(true);
  });

  it('rejects everything while locked, where there is no drag affordance', () => {
    expect(shouldAcceptLayoutChange({ locked: true, layoutTab: 1, activeTab: 1 })).toBe(false);
  });

  // The bug: unlocked, mid tab change, the grid emits a layout for the new tab
  // while state still holds the old one. Accepting it writes one tab over another.
  it('rejects a change while a tab switch is in flight', () => {
    expect(shouldAcceptLayoutChange({ locked: false, layoutTab: 2, activeTab: 1 })).toBe(false);
    expect(shouldAcceptLayoutChange({ locked: false, layoutTab: 1, activeTab: 2 })).toBe(false);
  });

  it('rejects before the first rebuild has established a tab', () => {
    expect(shouldAcceptLayoutChange({ locked: false, layoutTab: null, activeTab: 1 })).toBe(false);
    expect(shouldAcceptLayoutChange({ locked: false, layoutTab: undefined, activeTab: 1 })).toBe(false);
  });

  // Tab 0 is falsy; a truthiness check instead of an explicit null check would
  // reject a legitimate change on it.
  it('accepts tab 0, which is falsy but valid', () => {
    expect(shouldAcceptLayoutChange({ locked: false, layoutTab: 0, activeTab: 0 })).toBe(true);
  });

  it('does not coerce a numeric tab to its string form', () => {
    expect(shouldAcceptLayoutChange({ locked: false, layoutTab: 1, activeTab: '1' })).toBe(false);
  });
});
