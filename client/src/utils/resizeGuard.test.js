import { describe, it, expect } from 'vitest';
import { itemsOverlap, findResizeCollisions, canCommitResize } from './resizeGuard.js';

const item = (i, x, y, w, h) => ({ i, x, y, w, h });

describe('itemsOverlap', () => {
  it('detects a shared cell', () => {
    expect(itemsOverlap(item('a', 0, 0, 2, 2), item('b', 1, 1, 2, 2))).toBe(true);
  });

  it('treats touching edges as clear', () => {
    expect(itemsOverlap(item('a', 0, 0, 2, 2), item('b', 2, 0, 2, 2))).toBe(false);
    expect(itemsOverlap(item('a', 0, 0, 2, 2), item('b', 0, 2, 2, 2))).toBe(false);
  });
});

describe('findResizeCollisions', () => {
  it('never reports the candidate against itself', () => {
    const layout = [item('a', 0, 0, 4, 2)];
    expect(findResizeCollisions(layout, item('a', 0, 0, 6, 2))).toEqual([]);
  });

  it('reports every item the candidate lands on', () => {
    const layout = [item('a', 0, 0, 2, 2), item('b', 2, 0, 2, 2), item('c', 4, 0, 2, 2)];
    const hits = findResizeCollisions(layout, item('a', 0, 0, 6, 2)).map((l) => l.i);
    expect(hits).toEqual(['b', 'c']);
  });
});

describe('canCommitResize', () => {
  it('allows growth into free space', () => {
    const layout = [item('a', 0, 0, 2, 2), item('b', 6, 0, 2, 2)];
    expect(canCommitResize(layout, item('a', 0, 0, 2, 2), item('a', 0, 0, 4, 2))).toBe(true);
  });

  it('refuses growth onto a neighbour', () => {
    const layout = [item('a', 0, 0, 2, 2), item('b', 2, 0, 2, 2)];
    expect(canCommitResize(layout, item('a', 0, 0, 2, 2), item('a', 0, 0, 3, 2))).toBe(false);
  });

  it('refuses growth left or up onto a neighbour', () => {
    const layout = [item('a', 4, 0, 2, 2), item('b', 2, 0, 2, 2)];
    expect(canCommitResize(layout, item('a', 4, 0, 2, 2), item('a', 3, 0, 3, 2))).toBe(false);
  });

  // Shrinking has to stay available even from an already-overlapping layout,
  // or a dashboard corrupted by this bug can never be repaired by hand.
  it('always allows shrinking, even while overlapping', () => {
    const layout = [item('a', 4, 0, 5, 5), item('b', 8, 0, 4, 5)];
    expect(canCommitResize(layout, item('a', 4, 0, 5, 5), item('a', 4, 0, 4, 5))).toBe(true);
  });

  // The production shape from the incident: chores had been grown until it
  // sat on top of weather, and the overlap was persisted.
  it('would have refused the resize that overlapped chores onto weather', () => {
    const layout = [
      item('chores-widget', 4, 0, 4, 5),
      item('weather-widget', 8, 0, 4, 5),
      item('countdown', 0, 0, 4, 2),
    ];
    const before = item('chores-widget', 4, 0, 4, 5);
    const after = item('chores-widget', 4, 0, 5, 5);
    expect(canCommitResize(layout, before, after)).toBe(false);
  });
});
