import { describe, it, expect } from 'vitest';
import { pluginGridSize } from './pluginGridSize.js';

describe('a plugin widget size on the dashboard', () => {
  it('is 6 by 4, at least 2 by 2, unless the plugin says otherwise', () => {
    expect(pluginGridSize({ manifest: {} })).toEqual({ defaultSize: { width: 6, height: 4 }, minWidth: 2, minHeight: 2 });
    expect(pluginGridSize({})).toEqual({ defaultSize: { width: 6, height: 4 }, minWidth: 2, minHeight: 2 });
  });

  it('follows the manifest', () => {
    expect(pluginGridSize({ manifest: { size: { minWidth: 1, minHeight: 1, width: 2, height: 3 } } }))
      .toEqual({ defaultSize: { width: 2, height: 3 }, minWidth: 1, minHeight: 1 });
  });

  it('lets a Home Assistant panel go down to one square, even one saved before panels said so', () => {
    expect(pluginGridSize({ source: 'builder', manifest: { id: 'ha-kitchen' } }))
      .toEqual({ defaultSize: { width: 6, height: 4 }, minWidth: 1, minHeight: 1 });
  });

  it('never starts smaller than its minimum, and ignores sizes that are not whole squares', () => {
    expect(pluginGridSize({ manifest: { size: { minWidth: 3, width: 1, height: 0.5 } } }))
      .toEqual({ defaultSize: { width: 3, height: 4 }, minWidth: 3, minHeight: 2 });
  });
});
