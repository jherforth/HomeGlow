// Appearance (mode, interface colors, auto-dark location) resolves through a
// cascade: the household sets the default, and a display may override any
// field. The household value lives in the settings table under
// APPEARANCE_SETTING_KEY; a display's overrides live in its device settings
// under `appearance`, holding only the fields it overrides.
//
// Before this, each browser kept its own copy in localStorage. That copy is
// uploaded once as the display's overrides (see legacyLocalAppearance), and a
// resolved copy stays in localStorage only as a render cache, so a reload does
// not flash the default colors while the settings load.

import {
  DEFAULT_AUTO_DARK_MODE_SETTINGS,
  DEFAULT_INTERFACE_COLORS,
  normalizeAutoDarkModeSettings,
  normalizeInterfaceColors,
} from './interfaceSettings.js';

export const APPEARANCE_SETTING_KEY = 'appearance';
export const APPEARANCE_FIELDS = ['mode', 'colors', 'autoDark'];
export const MODES = ['light', 'dark', 'auto'];

export const DEFAULT_APPEARANCE = {
  mode: 'light',
  colors: { ...DEFAULT_INTERFACE_COLORS },
  autoDark: { ...DEFAULT_AUTO_DARK_MODE_SETTINGS },
};

// Pre-cascade localStorage keys, and the marker set once they are uploaded.
export const LEGACY_THEME_KEY = 'theme';
export const LEGACY_THEME_MODE_KEY = 'themeMode';
export const LEGACY_COLORS_KEY = 'interfaceColors';
export const LEGACY_AUTO_DARK_KEY = 'autoDarkModeSettings';
export const LEGACY_MIGRATED_KEY = 'appearanceMigrated';
export const APPEARANCE_CACHE_KEY = 'appearanceCache';

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const parseMaybeJson = (raw) => {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeField = (field, value) => {
  if (field === 'mode') return MODES.includes(value) ? value : undefined;
  if (!isObject(value)) return undefined;
  return field === 'colors' ? normalizeInterfaceColors(value) : normalizeAutoDarkModeSettings(value);
};

/** The household appearance, complete: missing or invalid fields take the defaults. */
export function normalizeHouseholdAppearance(raw) {
  const value = parseMaybeJson(raw);
  const source = isObject(value) ? value : {};
  return Object.fromEntries(APPEARANCE_FIELDS.map((field) => [
    field,
    normalizeField(field, source[field]) ?? JSON.parse(JSON.stringify(DEFAULT_APPEARANCE[field])),
  ]));
}

/** A display's overrides: only the valid fields it sets. */
export function normalizeDeviceAppearance(raw) {
  const value = parseMaybeJson(raw);
  if (!isObject(value)) return {};
  const out = {};
  APPEARANCE_FIELDS.forEach((field) => {
    const normalized = normalizeField(field, value[field]);
    if (normalized !== undefined) out[field] = normalized;
  });
  return out;
}

/**
 * What a display shows: each field from its override if it has one, else the
 * household's. `source` names where each field came from.
 */
export function resolveAppearance(household, device) {
  const base = normalizeHouseholdAppearance(household);
  const overrides = normalizeDeviceAppearance(device);
  const resolved = { source: {} };
  APPEARANCE_FIELDS.forEach((field) => {
    const fromDevice = Object.prototype.hasOwnProperty.call(overrides, field);
    resolved[field] = fromDevice ? overrides[field] : base[field];
    resolved.source[field] = fromDevice ? 'device' : 'household';
  });
  return resolved;
}

export const isAutoAvailable = (autoDark) => !!autoDark
  && autoDark.enabled === true
  && typeof autoDark.lat === 'number'
  && typeof autoDark.lon === 'number';

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The fields of `appearance` that differ from the household's. */
export function overridesFrom(appearance, household) {
  const base = normalizeHouseholdAppearance(household);
  const out = {};
  APPEARANCE_FIELDS.forEach((field) => {
    const value = normalizeField(field, appearance?.[field]);
    if (value !== undefined && !sameValue(value, base[field])) out[field] = value;
  });
  return out;
}

/**
 * This browser's pre-cascade appearance, or null when there is nothing to
 * upload: already migrated, or a browser that never stored any of it.
 */
export function legacyLocalAppearance(storage) {
  const read = (key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  if (read(LEGACY_MIGRATED_KEY)) return null;
  // Not LEGACY_THEME_KEY: this app still writes it as its render cache, so a
  // new browser has it too. The old app only wrote it alongside themeMode.
  const keys = [LEGACY_THEME_MODE_KEY, LEGACY_COLORS_KEY, LEGACY_AUTO_DARK_KEY];
  if (!keys.some((key) => read(key) !== null)) return null;

  // Same fallbacks the pre-cascade app used: no stored mode means the stored
  // theme, and no stored theme means light. Mode and colors always shaped the
  // look; the auto-dark location only did if this browser stored one.
  const theme = read(LEGACY_THEME_KEY) === 'dark' ? 'dark' : 'light';
  const storedMode = read(LEGACY_THEME_MODE_KEY);
  const storedAutoDark = parseMaybeJson(read(LEGACY_AUTO_DARK_KEY));
  return {
    mode: MODES.includes(storedMode) ? storedMode : theme,
    colors: normalizeInterfaceColors(parseMaybeJson(read(LEGACY_COLORS_KEY)) || {}),
    ...(isObject(storedAutoDark) ? { autoDark: normalizeAutoDarkModeSettings(storedAutoDark) } : {}),
  };
}

/** Drop a display's overrides that equal the household's, so it follows the household again. */
export function pruneMatchingOverrides(device, household) {
  return overridesFrom(normalizeDeviceAppearance(device), household);
}

/**
 * The next sunrise or sunset after `nowSec`, from today's times (unix seconds).
 * After today's sunset, tomorrow's sunrise is taken as today's plus a day,
 * which is close enough to end a temporary override. Null when the sun does
 * not cross the horizon.
 */
export function nextSunTransition(sun, nowSec) {
  if (!sun || sun.alwaysUp || sun.alwaysDown) return null;
  const { sunrise, sunset } = sun;
  if (typeof sunrise !== 'number' || typeof sunset !== 'number') return null;
  if (nowSec < sunrise) return sunrise;
  if (nowSec < sunset) return sunset;
  return sunrise + 24 * 60 * 60;
}

/** The temporary theme still in force at `nowMs`, or null. */
export function activeTemporaryTheme(temp, nowMs) {
  if (!isObject(temp) || (temp.theme !== 'light' && temp.theme !== 'dark')) return null;
  return typeof temp.until === 'number' && nowMs < temp.until ? temp.theme : null;
}

/**
 * What a tap on the dock's mode button does.
 *  - On auto: show the other theme until the next sunrise or sunset, then
 *    auto takes over again. A second tap while that is in force ends it.
 *  - On a fixed mode: switch this display to the other mode. Switching back to
 *    the household's mode removes the override instead of pinning a copy.
 * Returns one of:
 *   { type: 'temp', theme, until }   start a temporary theme (until: ms)
 *   { type: 'clearTemp' }            end the temporary theme
 *   { type: 'deviceMode', mode }     set this display's mode override
 *   { type: 'clearDeviceMode' }      follow the household's mode again
 *   { type: 'none' }                 nothing sensible to do
 */
export function dockToggleAction({ household, device, displayedTheme, temp, sun, nowMs }) {
  const resolved = resolveAppearance(household, device);
  const other = displayedTheme === 'dark' ? 'light' : 'dark';

  if (resolved.mode === 'auto' && isAutoAvailable(resolved.autoDark)) {
    if (activeTemporaryTheme(temp, nowMs)) return { type: 'clearTemp' };
    const next = nextSunTransition(sun, Math.floor(nowMs / 1000));
    if (next === null) return { type: 'none' };
    return { type: 'temp', theme: other, until: next * 1000 };
  }

  const householdMode = normalizeHouseholdAppearance(household).mode;
  return other === householdMode ? { type: 'clearDeviceMode' } : { type: 'deviceMode', mode: other };
}

/**
 * What to render before the settings load: the last resolved appearance, or
 * for a browser not yet uploaded its own stored values, else the defaults.
 */
export function readAppearanceCache(storage) {
  try {
    const cached = storage.getItem(APPEARANCE_CACHE_KEY);
    if (cached) return normalizeHouseholdAppearance(cached);
  } catch {
    // Storage blocked or unreadable; fall through.
  }
  return normalizeHouseholdAppearance(legacyLocalAppearance(storage) ?? undefined);
}

export function writeAppearanceCache(storage, appearance) {
  try {
    const { mode, colors, autoDark } = appearance;
    storage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ mode, colors, autoDark }));
  } catch {
    // A cache only; the server holds the settings.
  }
}
