import { describe, it, expect } from 'vitest';
import { mergeDeviceOverrides, mergeHouseholdAppearance } from './appearanceSave.js';
import { DEFAULT_DIMMING } from './appearance.js';

const storedHousehold = {
  theme: 'classic',
  dimming: { ...DEFAULT_DIMMING, enabled: true, day: 0.5 },
};

const storedOverrides = {
  theme: 'fern',
  dimming: { ...DEFAULT_DIMMING, enabled: true, day: 0.4 },
};

describe('mergeHouseholdAppearance', () => {
  it('keeps the stored dimming when the partial does not mention it', () => {
    // The review's check: save dimming, then save Appearance without
    // reloading — the Appearance card's partial has no dimming, so the
    // freshly stored dimming must survive untouched.
    const next = mergeHouseholdAppearance(storedHousehold, { theme: 'harbor-fog' });
    expect(next.theme).toBe('harbor-fog');
    expect(next.dimming).toEqual(storedHousehold.dimming);
  });

  it('replaces the dimming when the partial sets it', () => {
    const dimming = { ...DEFAULT_DIMMING, enabled: true, day: 0.8 };
    const next = mergeHouseholdAppearance(storedHousehold, { dimming });
    expect(next.dimming).toEqual(dimming);
    expect(next.theme).toBe('classic');
  });
});

describe('mergeDeviceOverrides', () => {
  it('keeps a stored dimming override when the partial does not mention it', () => {
    const next = mergeDeviceOverrides(storedOverrides, { theme: 'storm' });
    expect(next.theme).toBe('storm');
    expect(next.dimming).toEqual(storedOverrides.dimming);
  });

  it('replaces the dimming override when the partial sets it', () => {
    const dimming = { ...DEFAULT_DIMMING, enabled: false };
    const next = mergeDeviceOverrides(storedOverrides, { dimming });
    expect(next.dimming).toEqual(dimming);
    expect(next.theme).toBe('fern');
  });

  it('drops the override for a field marked use-household, and only that field', () => {
    const next = mergeDeviceOverrides(storedOverrides, {}, ['dimming']);
    expect(next).not.toHaveProperty('dimming');
    expect(next.theme).toBe('fern');
  });
});
