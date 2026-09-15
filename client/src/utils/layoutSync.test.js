import { describe, it, expect } from 'vitest';
import { shouldAcceptLayoutChange } from './layoutSync';

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
