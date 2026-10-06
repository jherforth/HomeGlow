import { describe, it, expect } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  activeTemporaryTheme,
  dockToggleAction,
  legacyLocalAppearance,
  nextSunTransition,
  normalizeDeviceAppearance,
  normalizeHouseholdAppearance,
  overridesFrom,
  pruneMatchingOverrides,
  readAppearanceCache,
  resolveAppearance,
  writeAppearanceCache,
} from './appearance.js';

const BERRY = { primary: '#ffeeee', secondary: '#38bdf8', accent: '#aa00aa' };
const SF = { enabled: true, locationQuery: 'San Francisco', lat: 37.77, lon: -122.42, resolvedName: 'San Francisco' };

function storage(entries) {
  const map = new Map(Object.entries(entries));
  return { getItem: (key) => (map.has(key) ? map.get(key) : null) };
}

describe('normalizeHouseholdAppearance', () => {
  it('fills every field from the defaults when nothing is stored', () => {
    expect(normalizeHouseholdAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
  });

  it('accepts the stored JSON string and keeps valid fields', () => {
    const stored = JSON.stringify({ mode: 'dark', colors: BERRY });
    expect(normalizeHouseholdAppearance(stored)).toEqual({ ...DEFAULT_APPEARANCE, mode: 'dark', colors: BERRY });
  });

  it('replaces an invalid mode with the default', () => {
    expect(normalizeHouseholdAppearance({ mode: 'sepia' }).mode).toBe('light');
  });

  it('does not share the default objects with callers', () => {
    normalizeHouseholdAppearance(undefined).colors.accent = '#000000';
    expect(normalizeHouseholdAppearance(undefined).colors.accent).toBe(DEFAULT_APPEARANCE.colors.accent);
  });
});

describe('normalizeDeviceAppearance', () => {
  it('keeps only the fields a display overrides', () => {
    expect(normalizeDeviceAppearance({ mode: 'auto' })).toEqual({ mode: 'auto' });
    expect(normalizeDeviceAppearance({ mode: 'nope', colors: 'red' })).toEqual({});
    expect(normalizeDeviceAppearance(null)).toEqual({});
  });
});

describe('resolveAppearance', () => {
  it('takes each field from the display when it overrides it, else the household', () => {
    const resolved = resolveAppearance({ mode: 'dark', colors: BERRY }, { mode: 'light' });
    expect(resolved.mode).toBe('light');
    expect(resolved.colors).toEqual(BERRY);
    expect(resolved.source).toEqual({ theme: 'household', mode: 'device', colors: 'household', autoDark: 'household' });
  });

  it('lets a display pick its own theme, and ignores unknown themes', () => {
    expect(resolveAppearance({ theme: 'starship' }, { theme: 'classic' }).theme).toBe('classic');
    expect(resolveAppearance({ theme: 'warp-core' }, {}).theme).toBe('classic');
  });
});

describe('overridesFrom', () => {
  it('keeps only what differs from the household', () => {
    const appearance = { mode: 'dark', colors: DEFAULT_APPEARANCE.colors, autoDark: SF };
    expect(overridesFrom(appearance, {})).toEqual({ mode: 'dark', autoDark: SF });
  });
});

describe('legacyLocalAppearance', () => {
  it('is null for a browser that never stored appearance', () => {
    expect(legacyLocalAppearance(storage({}))).toBeNull();
  });

  it('is null once uploaded', () => {
    expect(legacyLocalAppearance(storage({ themeMode: 'dark', appearanceMigrated: '1' }))).toBeNull();
  });

  it('reads the stored values with the old fallbacks', () => {
    const local = legacyLocalAppearance(storage({
      theme: 'dark',
      interfaceColors: JSON.stringify(BERRY),
      autoDarkModeSettings: JSON.stringify(SF),
    }));
    // No stored mode: the old app used the stored theme.
    expect(local).toEqual({ mode: 'dark', colors: BERRY, autoDark: SF });
  });

  it('does not mistake the render cache for a legacy browser', () => {
    // This app writes `theme` itself; a new browser has it and nothing else.
    expect(legacyLocalAppearance(storage({ theme: 'dark' }))).toBeNull();
  });

  it('leaves the auto-dark location alone unless this browser stored one', () => {
    const local = legacyLocalAppearance(storage({ interfaceColors: JSON.stringify(BERRY) }));
    expect(local).toEqual({ mode: 'light', colors: BERRY });
    // Its colors are uploaded; the household's location stays in force.
    expect(overridesFrom(local, { autoDark: SF })).toEqual({ colors: BERRY });
  });

  it('survives malformed JSON', () => {
    const local = legacyLocalAppearance(storage({ themeMode: 'auto', interfaceColors: '{bad' }));
    expect(local.mode).toBe('auto');
    expect(local.colors).toEqual(DEFAULT_APPEARANCE.colors);
  });

  it('keeps every display looking the same after the upload', () => {
    // A display's look before == household + its uploaded overrides after.
    const household = { mode: 'light', colors: BERRY };
    const local = legacyLocalAppearance(storage({ themeMode: 'auto', autoDarkModeSettings: JSON.stringify(SF) }));
    const resolved = resolveAppearance(household, overridesFrom(local, household));
    expect({ mode: resolved.mode, colors: resolved.colors, autoDark: resolved.autoDark }).toEqual(local);
  });
});

describe('pruneMatchingOverrides', () => {
  it('drops overrides the household now matches', () => {
    expect(pruneMatchingOverrides({ mode: 'dark', colors: BERRY }, { mode: 'dark' })).toEqual({ colors: BERRY });
  });
});

describe('nextSunTransition', () => {
  const sun = { sunrise: 1000, sunset: 5000 };
  it('is the next sunrise or sunset', () => {
    expect(nextSunTransition(sun, 500)).toBe(1000);
    expect(nextSunTransition(sun, 1000)).toBe(5000);
    expect(nextSunTransition(sun, 6000)).toBe(1000 + 86400);
  });

  it('is null where the sun does not cross the horizon', () => {
    expect(nextSunTransition({ alwaysUp: true }, 500)).toBeNull();
    expect(nextSunTransition(null, 500)).toBeNull();
  });
});

describe('activeTemporaryTheme', () => {
  it('holds until its end, then lapses', () => {
    expect(activeTemporaryTheme({ theme: 'dark', until: 2000 }, 1999)).toBe('dark');
    expect(activeTemporaryTheme({ theme: 'dark', until: 2000 }, 2000)).toBeNull();
    expect(activeTemporaryTheme({ theme: 'blue', until: 9e15 }, 0)).toBeNull();
    expect(activeTemporaryTheme(null, 0)).toBeNull();
  });
});

describe('dockToggleAction', () => {
  const sun = { sunrise: 1000, sunset: 5000 };

  it('on auto, shows the other theme until the next sunrise or sunset', () => {
    const action = dockToggleAction({
      household: { mode: 'auto', autoDark: SF }, device: {}, displayedTheme: 'light', temp: null, sun, nowMs: 2000 * 1000,
    });
    expect(action).toEqual({ type: 'temp', theme: 'dark', until: 5000 * 1000 });
  });

  it('on auto, a second tap ends the temporary theme', () => {
    const action = dockToggleAction({
      household: { mode: 'auto', autoDark: SF }, device: {}, displayedTheme: 'dark',
      temp: { theme: 'dark', until: 5000 * 1000 }, sun, nowMs: 2000 * 1000,
    });
    expect(action).toEqual({ type: 'clearTemp' });
  });

  it('on a fixed mode, overrides this display', () => {
    const action = dockToggleAction({ household: { mode: 'light' }, device: {}, displayedTheme: 'light', sun, nowMs: 0 });
    expect(action).toEqual({ type: 'deviceMode', mode: 'dark' });
  });

  it('switching back to the household mode removes the override', () => {
    const action = dockToggleAction({ household: { mode: 'light' }, device: { mode: 'dark' }, displayedTheme: 'dark', sun, nowMs: 0 });
    expect(action).toEqual({ type: 'clearDeviceMode' });
  });

  it('treats auto without a location as a fixed mode', () => {
    const action = dockToggleAction({ household: { mode: 'auto' }, device: {}, displayedTheme: 'light', sun, nowMs: 0 });
    expect(action).toEqual({ type: 'deviceMode', mode: 'dark' });
  });
});

describe('appearance cache', () => {
  function memoryStorage(entries = {}) {
    const map = new Map(Object.entries(entries));
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
    };
  }

  it('round-trips the resolved appearance', () => {
    const store = memoryStorage();
    writeAppearanceCache(store, { mode: 'dark', colors: BERRY, autoDark: SF, source: {} });
    expect(readAppearanceCache(store)).toEqual({ theme: 'classic', mode: 'dark', colors: BERRY, autoDark: SF });
  });

  it('falls back to the legacy values before the upload, then the defaults', () => {
    expect(readAppearanceCache(memoryStorage({ themeMode: 'dark' })).mode).toBe('dark');
    expect(readAppearanceCache(memoryStorage())).toEqual(DEFAULT_APPEARANCE);
  });

  it('never throws when storage does', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readAppearanceCache(blocked)).toEqual(DEFAULT_APPEARANCE);
    expect(() => writeAppearanceCache(blocked, DEFAULT_APPEARANCE)).not.toThrow();
  });
});
