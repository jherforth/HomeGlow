import { describe, expect, it } from 'vitest';
import { nearestFreeCell, pickDockTarget } from './useCarryToTab.jsx';

describe('nearestFreeCell', () => {
  it('keeps a free spot', () => {
    expect(nearestFreeCell({ x: 6, y: 2, w: 6, h: 4 }, [{ x: 0, y: 0, w: 6, h: 6 }])).toEqual({ x: 6, y: 2, w: 6, h: 4 });
  });
  it('moves off a taken spot to the closest free one', () => {
    expect(nearestFreeCell({ x: 2, y: 1, w: 6, h: 4 }, [{ x: 0, y: 0, w: 6, h: 6 }])).toEqual({ x: 6, y: 1, w: 6, h: 4 });
  });
  it('goes below a full row', () => {
    expect(nearestFreeCell({ x: 0, y: 0, w: 12, h: 2 }, [{ x: 0, y: 0, w: 12, h: 3 }])).toEqual({ x: 0, y: 3, w: 12, h: 2 });
  });
});

describe('pickDockTarget', () => {
  const rect = (left) => ({ left, right: left + 44, top: 1000, bottom: 1044 });
  const items = [{ value: 1, rect: rect(100) }, { value: 2, rect: rect(160) }, { value: 'add', rect: rect(220) }];

  it('picks the tab under the finger', () => {
    expect(pickDockTarget(182, 1022, items)).toBe(2);
  });
  it('picks the nearest tab just off its icon, above or below the dock', () => {
    expect(pickDockTarget(152, 960, items)).toBe(1);
    expect(pickDockTarget(156, 1090, items)).toBe(2);
  });
  it('picks nothing far from the dock', () => {
    expect(pickDockTarget(182, 900, items)).toBeNull();
    expect(pickDockTarget(400, 1022, items)).toBeNull();
  });
});
