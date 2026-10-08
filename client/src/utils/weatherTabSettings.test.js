import { describe, expect, it } from 'vitest';
import { coordinateBackfill, hasChosenLocation, parseTabConfigJson, tabSettingsReady } from './weatherTabSettings.js';

describe('weather tab settings', () => {
  it('waits for the tabs: no config and no tab list means not loaded yet', () => {
    expect(tabSettingsReady(null, [])).toBe(false);
    expect(tabSettingsReady(null, undefined)).toBe(false);
    expect(tabSettingsReady('{"weather":{}}', [])).toBe(true);
    // The background prefetch can be on a tab with no config of its own.
    expect(tabSettingsReady(null, [{ number: 1, config_json: '{}' }])).toBe(true);
  });

  it('tells a chosen place from the default', () => {
    expect(hasChosenLocation({ locationQuery: '94040' })).toBe(true);
    expect(hasChosenLocation({ zipCode: '94040' })).toBe(true); // the older field
    expect(hasChosenLocation({ locationQuery: '  ' })).toBe(false);
    expect(hasChosenLocation({ layout_x: 8, layout_y: 0 })).toBe(false); // placed, never configured
    expect(hasChosenLocation(null)).toBe(false);
  });

  it('saves looked-up coordinates only for a chosen place without them', () => {
    const payload = { coordinates: { lat: 37.3855, lon: -122.088 }, resolvedName: 'Mountain View' };
    const chosen = { locationQuery: '94040', tempUnit: 'F', layoutMode: 'auto', coordinates: null, chosen: true };
    expect(coordinateBackfill(chosen, payload)).toEqual({
      locationQuery: '94040', tempUnit: 'F', layoutMode: 'auto', lat: 37.3855, lon: -122.088, resolvedName: 'Mountain View',
    });
    // The bug: the default, shown before the tabs loaded, was written over a saved place.
    expect(coordinateBackfill({ ...chosen, locationQuery: '14818', chosen: false }, payload)).toBeNull();
    expect(coordinateBackfill({ ...chosen, coordinates: { lat: 1, lon: 2 } }, payload)).toBeNull();
    expect(coordinateBackfill(chosen, { coordinates: null })).toBeNull();
  });

  it('reads a tab layout map from a string or an object, and nothing from junk', () => {
    expect(parseTabConfigJson('{"weather":{"locationQuery":"94040"}}')).toEqual({ weather: { locationQuery: '94040' } });
    expect(parseTabConfigJson({ weather: {} })).toEqual({ weather: {} });
    expect(parseTabConfigJson('not json')).toEqual({});
    expect(parseTabConfigJson('[1]')).toEqual({});
    expect(parseTabConfigJson(null)).toEqual({});
  });
});
