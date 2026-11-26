import { describe, it, expect } from 'vitest';
import { pluginFrameAllow, permissionsOf, pendingPermissions, withPermission } from './pluginPermissions.js';

// Issue #402: a plugin's frame gets the microphone only once it is granted.
describe('pluginFrameAllow', () => {
  it('allows only the location by default', () => {
    expect(pluginFrameAllow()).toBe('geolocation');
    expect(pluginFrameAllow([])).toBe('geolocation');
    expect(pluginFrameAllow(null)).toBe('geolocation');
  });

  it('adds the microphone once granted', () => {
    expect(pluginFrameAllow(['microphone'])).toBe('geolocation; microphone');
  });

  it('ignores names it does not know, and repeats', () => {
    expect(pluginFrameAllow(['camera', 'microphone', 'microphone'])).toBe('geolocation; microphone');
  });
});

describe('permissionsOf and pendingPermissions', () => {
  it('reads a plugin with no permissions as asking for nothing', () => {
    expect(permissionsOf({})).toEqual({ requested: [], granted: [] });
    expect(pendingPermissions({ permissions: null })).toEqual([]);
  });

  it('lists what is asked for and not yet granted', () => {
    expect(pendingPermissions({ permissions: { requested: ['microphone'], granted: [] } })).toEqual(['microphone']);
    expect(pendingPermissions({ permissions: { requested: ['microphone'], granted: ['microphone'] } })).toEqual([]);
  });
});

describe('withPermission', () => {
  it('switches one permission on and off, leaving the others', () => {
    expect(withPermission([], 'microphone', true)).toEqual(['microphone']);
    expect(withPermission(['microphone'], 'microphone', true)).toEqual(['microphone']);
    expect(withPermission(['microphone'], 'microphone', false)).toEqual([]);
    expect(withPermission(['other', 'microphone'], 'microphone', false)).toEqual(['other']);
  });
});
