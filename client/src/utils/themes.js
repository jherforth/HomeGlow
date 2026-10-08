// Theme packages: data, not CSS. A package names the tokens it changes, per
// mode, and every value is checked against the token's type, so a theme can
// recolor and reshape HomeGlow but cannot inject a stylesheet. Classic is the
// empty package: it changes nothing, and HomeGlow renders exactly as the
// stylesheet defines it.
//
// {
//   manifestVersion: 1, id, name, version, description, author,  // as in a plugin manifest
//   ambience: [{ layer, modes, ...options }],  // building blocks drawn behind the widgets (themes/engine)
//   variety: 'load' | 'day' | 'fixed',  // a new scene each page load (default), each day, or never
//   extends: 'classic',                // optional; tokens and options merge over the parent
//   modes: ['light', 'dark'],          // the modes it supports; others show modes[0]
//   colors: { primary, secondary, accent },  // what plugins are told (light-mode background, secondary, accent)
//   fonts: [{ family, weight, style, src }],  // .woff2 files in the theme's own fonts/ folder
//   tokens: { all: {}, light: {}, dark: {} },
//   mui: { ... }                       // see muiThemeOptions; absent = MUI's defaults
//   muiModes: { light: {}, dark: {} }  // per-mode MUI options over `mui`
//   weather: { default, scenes: { rainy: { colors, tokens, ambience, confetti }, ... } }
//                                      // scenes that follow the weather (utils/weatherScenes.js)
// }

import { FLYBY_CURVE_OPTIONS, FLYBY_ORBIT_OPTIONS, validateAmbience, validateConfetti, validateOrnaments } from '../themes/engine/schemas.js';
import { WEATHER_SCENE_KEYS } from './weatherScenes.js';

// Each theme is a folder: themes/<id>/theme.json, with its own fonts/ and
// assets/. Adding a theme means adding a folder; nothing here lists them.
// The files come in as URLs only; nothing downloads until a theme uses it.
// `no-inline` keeps even a small SVG a separate file: inlined, every theme's
// art would ride in a chunk that every display loads.
const MANIFESTS = import.meta.glob('../themes/*/theme.json', { eager: true, import: 'default' });
const FILES = import.meta.glob('../themes/*/{assets,fonts}/*', { eager: true, query: '?no-inline', import: 'default' });

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/-]+\)$/i;
const TOKEN_REF = /^var\(--[a-z0-9-]+\)$/;
const LENGTH = /^(?:0|normal|-?\d*\.?\d+(?:px|rem|em|%))$/;
const FORBIDDEN = /[;{}<>\\@]|url\s*\(|expression|javascript:/i;

const isColor = (v) => v === 'transparent' || HEX.test(v) || FUNC_COLOR.test(v) || TOKEN_REF.test(v);
const isLengths = (v, max) => {
  const parts = v.split(/\s+/);
  return parts.length >= 1 && parts.length <= max && parts.every((p) => LENGTH.test(p) || TOKEN_REF.test(p));
};
// A shadow: comma-separated layers of lengths and one color each, or none.
const isShadow = (v) => v === 'none' || v.split(/,(?![^(]*\))/).every((layer) => {
  const parts = layer.trim().match(/(?:rgba?|hsla?|var)\([^)]*\)|\S+/g) || [];
  const colors = parts.filter(isColor);
  const rest = parts.filter((p) => !isColor(p) && p !== 'inset');
  return colors.length <= 1 && rest.length >= 2 && rest.length <= 4 && rest.every((p) => LENGTH.test(p));
});
// Up to four colors, one per side (top, right, bottom, left).
const isColors4 = (v) => {
  const parts = v.match(/(?:rgba?|hsla?|var)\([^)]*\)|\S+/g) || [];
  return parts.length >= 1 && parts.length <= 4 && parts.every(isColor);
};
const isFontFamily = (v) => /^[\w\s'",-]+$/.test(v);
const isGradient = (v) => /^(?:repeating-)?(?:linear|radial)-gradient\([\w\s#%.,()-]+\)$/i.test(v);
const oneOf = (...values) => (v) => values.includes(v);

const TYPES = {
  color: isColor,
  colors4: isColors4,
  rgbTriplet: (v) => /^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(v),
  length: (v) => isLengths(v, 1),
  lengths4: (v) => isLengths(v, 4),
  // Room for frame decoration and ornaments, taken from fixed-height widgets:
  // 0 to 24px a side.
  frameInset: (v) => {
    const parts = v.split(/\s+/);
    return parts.length >= 1 && parts.length <= 4 && parts.every((p) => /^(?:0|(?:[0-9]|1[0-9]|2[0-4])(?:\.\d+)?px)$/.test(p));
  },
  shadow: isShadow,
  font: isFontFamily,
  image: (v) => v === 'none' || isGradient(v),
  borderStyle: oneOf('none', 'solid', 'dashed', 'dotted', 'double'),
  textTransform: oneOf('none', 'uppercase', 'capitalize', 'lowercase'),
  gridGap: oneOf('0', '0px', '8px', '16px', '24px'),
  backdrop: (v) => v === 'none' || /^blur\((?:[0-9]|1[0-9]|2[0-4])px\)$/.test(v),
  lineCap: oneOf('round', 'square', 'butt'),
  // A meter's line: 1 to 12px, so it fits the controls that draw one.
  meterThickness: (v) => /^(?:[1-9]|1[0-2])px$/.test(v),
  // A fill: one color, or a gradient (Classic's buttons blend two).
  paint: (v) => isColor(v) || isGradient(v),
  fontWeight: (v) => /^[1-9]00$/.test(v),
};

const tokenTypes = (type, names) => Object.fromEntries(names.map((name) => [name, type]));

/** Every token a theme may set, and the type its value must have. */
export const THEME_TOKENS = {
  ...tokenTypes('color', [
    '--primary', '--secondary', '--accent', '--background', '--surface', '--card-bg', '--text',
    '--text-secondary', '--border', '--card-border', '--success', '--warning', '--bottom-bar-bg',
    '--dock-bg', '--dock-border', '--dock-separator', '--dock-icon', '--dock-active-bg',
    '--dock-active-border', '--dock-active-icon', '--hg-hover', '--hg-on-overlay', '--hg-error',
    '--hg-error-hover', '--hg-error-surface', '--hg-frame-bg',
    '--light-gradient-start', '--light-gradient-end', '--dark-gradient-start', '--dark-gradient-end',
    '--light-button-gradient-start', '--light-button-gradient-end', '--dark-button-gradient-start',
    '--dark-button-gradient-end',
  ]),
  '--accent-rgb': 'rgbTriplet',
  ...tokenTypes('length', [
    '--hg-radius-xs', '--hg-radius-sm', '--hg-radius-md', '--hg-radius-lg', '--hg-radius-xl',
    '--hg-radius-2xl', '--hg-heading-letter-spacing',
  ]),
  ...tokenTypes('lengths4', ['--hg-frame-radius', '--hg-frame-decoration-width']),
  '--hg-frame-inset': 'frameInset',
  ...tokenTypes('shadow', ['--shadow', '--hg-frame-shadow', '--hg-frame-shadow-hover']),
  ...tokenTypes('font', ['--hg-font-body', '--hg-font-heading', '--hg-font-mono']),
  '--hg-frame-decoration-style': 'borderStyle',
  '--hg-frame-decoration-image': 'image',
  '--hg-page-image': 'image',
  '--hg-frame-image': 'image',
  '--hg-frame-overlay': 'image',
  '--hg-frame-decoration-color': 'colors4',
  '--dock-active-image': 'image',
  '--hg-frame-backdrop': 'backdrop',
  '--hg-heading-transform': 'textTransform',
  '--hg-grid-gap': 'gridGap',
  '--hg-meter-track': 'color',
  '--hg-meter-fill': 'color',
  '--hg-meter-thickness': 'meterThickness',
  '--hg-meter-cap': 'lineCap',
  '--hg-button-bg': 'paint',
  '--hg-button-text': 'color',
  '--hg-button-radius': 'length',
  '--hg-button-weight': 'fontWeight',
  '--hg-button-quiet-border': 'color',
};

const MUI_TYPES = {
  mode: (v) => v === 'light' || v === 'dark',
  primary: isColor,
  secondary: isColor,
  error: isColor,
  background: isColor,
  paper: isColor,
  text: isColor,
  textSecondary: isColor,
  divider: isColor,
  fontFamily: isFontFamily,
  headingFontFamily: isFontFamily,
  radius: (v) => Number.isFinite(v) && v >= 0 && v <= 64,
  pillButtons: (v) => typeof v === 'boolean',
  headingTransform: TYPES.textTransform,
};

const FONT_FAMILY_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$/;

function checkFonts(fonts, assets, errors) {
  if (!Array.isArray(fonts)) {
    errors.push('fonts must be a list');
    return;
  }
  fonts.forEach((font, i) => {
    const where = `fonts[${i}]`;
    if (!isObject(font)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (typeof font.family !== 'string' || !FONT_FAMILY_NAME.test(font.family)) errors.push(`${where}.family must be a plain name`);
    if (!Number.isInteger(font.weight) || font.weight < 100 || font.weight > 900) errors.push(`${where}.weight must be 100 to 900`);
    if (font.style !== undefined && font.style !== 'normal' && font.style !== 'italic') errors.push(`${where}.style must be normal or italic`);
    if (typeof font.src !== 'string' || !/^fonts\/[A-Za-z0-9._-]+\.woff2$/.test(font.src)) {
      errors.push(`${where}.src must be a .woff2 file in the theme's fonts folder`);
    } else if (assets && !assets.includes(font.src)) {
      errors.push(`${where}.src ${font.src} is not in the theme folder`);
    }
  });
}

const MODES = ['light', 'dark'];
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function checkTokens(tokens, where, errors) {
  if (tokens === undefined) return;
  if (!isObject(tokens)) {
    errors.push(`${where}: must be an object`);
    return;
  }
  Object.entries(tokens).forEach(([name, value]) => {
    const type = THEME_TOKENS[name];
    if (!type) {
      errors.push(`${where}: unknown token ${name}`);
    } else if (typeof value !== 'string' || FORBIDDEN.test(value) || !TYPES[type](value.trim())) {
      errors.push(`${where}: ${name} is not a valid ${type}: ${JSON.stringify(value)}`);
    }
  });
}

function checkColors(colors, where, errors) {
  if (!isObject(colors)) {
    errors.push(`${where} must be an object`);
    return;
  }
  ['primary', 'secondary', 'accent'].forEach((key) => {
    if (colors[key] !== undefined && !HEX.test(colors[key])) errors.push(`${where}.${key} must be a hex color`);
  });
}

// `tokens`: { all, light, dark }, each a set of token values.
function checkTokenModes(tokens, where, errors) {
  if (!isObject(tokens)) {
    errors.push(`${where} must be an object`);
    return;
  }
  Object.keys(tokens).forEach((key) => {
    if (!['all', ...MODES].includes(key)) errors.push(`${where}.${key}: use all, light or dark`);
  });
  ['all', ...MODES].forEach((key) => checkTokens(tokens[key], `${where}.${key}`, errors));
}

const SCENE_FIELDS = ['colors', 'tokens', 'ambience', 'confetti'];

// A theme's weather scenes (#247): { default, scenes: { <condition>: scene } },
// each scene a set of colors, tokens, ambience and confetti over the theme's
// own. Each is held to the same rules as the theme's top level.
function checkWeather(weather, { assets }, errors) {
  if (!isObject(weather)) {
    errors.push('weather must be an object');
    return;
  }
  Object.keys(weather).forEach((key) => {
    if (key !== 'default' && key !== 'scenes') errors.push(`weather: unknown field ${key} (use default and scenes)`);
  });
  const checkScene = (scene, where) => {
    if (!isObject(scene)) {
      errors.push(`${where} must be an object`);
      return;
    }
    Object.keys(scene).forEach((key) => {
      if (!SCENE_FIELDS.includes(key)) errors.push(`${where}: unknown field ${key} (a scene sets ${SCENE_FIELDS.join(', ')})`);
    });
    if (scene.colors !== undefined) checkColors(scene.colors, `${where}.colors`, errors);
    if (scene.tokens !== undefined) checkTokenModes(scene.tokens, `${where}.tokens`, errors);
    if (scene.ambience !== undefined) {
      errors.push(...validateAmbience(scene.ambience, { assets, isColor }).map((problem) => `${where}.${problem}`));
    }
    if (scene.confetti !== undefined) {
      errors.push(...validateConfetti(scene.confetti, { assets, isColor }).map((problem) => `${where}.${problem}`));
    }
  };
  if (weather.default !== undefined) checkScene(weather.default, 'weather.default');
  if (weather.scenes !== undefined) {
    if (!isObject(weather.scenes)) errors.push('weather.scenes must be an object');
    else Object.entries(weather.scenes).forEach(([key, scene]) => {
      if (!WEATHER_SCENE_KEYS.includes(key)) errors.push(`weather.scenes.${key}: not a weather condition (${WEATHER_SCENE_KEYS.join(', ')})`);
      else checkScene(scene, `weather.scenes.${key}`);
    });
  }
}

// Every ambience list a theme has: its own and each weather scene's.
const allAmbience = (pkg) => [
  pkg.ambience,
  pkg.weather?.default?.ambience,
  ...Object.values(isObject(pkg.weather?.scenes) ? pkg.weather.scenes : {}).map((scene) => scene?.ambience),
].filter(Array.isArray).flat();

/** Problems with a package, as readable strings; empty when it is valid. */
export function validateThemePackage(pkg, { assets } = {}) {
  const errors = [];
  if (!isObject(pkg)) return ['package must be an object'];
  // The same rules as a plugin manifest (server/index.js), so one author
  // writes both the same way.
  if (Number.isInteger(pkg.manifestVersion) && pkg.manifestVersion > MANIFEST_VERSION) {
    // Shown to people as "needs a newer version of HomeGlow"; the numbers are
    // for the console.
    errors.push(NEEDS_NEWER_HOMEGLOW);
  } else if (!Number.isInteger(pkg.manifestVersion) || pkg.manifestVersion < 1) {
    errors.push(`manifestVersion must be 1 to ${MANIFEST_VERSION}`);
  } else {
    // Each version adds things a theme may use: 2, ornaments, the meter roles
    // and clumped sprites; 3, the button roles and curved flyby crossings
    // (path, count, begin and the rest); 4, weather scenes and lightning
    // flashes; 5, orbits. A theme that uses them says so, so a core too old
    // to draw them refuses it plainly.
    const tokenNames = ['all', ...MODES].flatMap((key) => Object.keys(pkg.tokens?.[key] || {}));
    const layers = allAmbience(pkg);
    const needs = (version, uses) => {
      const named = [...new Set(uses.filter(Boolean))];
      if (pkg.manifestVersion < version && named.length) errors.push(`${named.join(', ')} need manifestVersion ${version}`);
    };
    needs(2, [
      pkg.ornaments !== undefined && 'ornaments',
      layers.some((layer) => layer?.clumps !== undefined || layer?.clumpWidth !== undefined) && 'clumps',
      ...tokenNames.filter((name) => name.startsWith('--hg-meter-')),
    ]);
    needs(3, [
      ...tokenNames.filter((name) => name.startsWith('--hg-button-')),
      layers.some((layer) => layer?.layer === 'flyby'
        && FLYBY_CURVE_OPTIONS.some((key) => layer[key] !== undefined)) && 'curved flybys',
    ]);
    needs(4, [
      pkg.weather !== undefined && 'weather',
      layers.some((layer) => layer?.layer === 'flash') && 'flash',
    ]);
    needs(5, [
      layers.some((layer) => layer?.layer === 'flyby'
        && (layer.path === 'orbit' || FLYBY_ORBIT_OPTIONS.some((key) => layer[key] !== undefined))) && 'orbits',
    ]);
  }
  if (typeof pkg.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(pkg.id)) errors.push('id must be a lowercase slug (a-z, 0-9, hyphens, max 64)');
  if (typeof pkg.name !== 'string' || !pkg.name.trim() || pkg.name.length > 60) errors.push('name is required');
  if (pkg.version !== undefined && (typeof pkg.version !== 'string' || !pkg.version.trim() || pkg.version.length > 32)) errors.push('version must be a short string');
  if (pkg.description !== undefined && (typeof pkg.description !== 'string' || pkg.description.trim().length > 300)) errors.push('description must be 300 characters or fewer');
  if (pkg.author !== undefined && (typeof pkg.author !== 'string' || pkg.author.trim().length > 80)) errors.push('author must be 80 characters or fewer');
  if (pkg.ambience !== undefined) errors.push(...validateAmbience(pkg.ambience, { assets, isColor }));
  if (pkg.confetti !== undefined) errors.push(...validateConfetti(pkg.confetti, { assets, isColor }));
  if (pkg.ornaments !== undefined) errors.push(...validateOrnaments(pkg.ornaments, { assets, isColor }));
  if (pkg.variety !== undefined && !['load', 'day', 'fixed'].includes(pkg.variety)) errors.push('variety must be load, day or fixed');
  if (pkg.extends !== undefined && typeof pkg.extends !== 'string') errors.push('extends must be a theme id');
  if (pkg.modes !== undefined && (!Array.isArray(pkg.modes) || !pkg.modes.length || !pkg.modes.every((m) => MODES.includes(m)))) {
    errors.push('modes must list light and/or dark');
  }
  if (pkg.colors !== undefined) checkColors(pkg.colors, 'colors', errors);
  if (pkg.fonts !== undefined) checkFonts(pkg.fonts, assets, errors);
  if (pkg.tokens !== undefined) checkTokenModes(pkg.tokens, 'tokens', errors);
  if (pkg.weather !== undefined) checkWeather(pkg.weather, { assets }, errors);
  const checkMui = (options, where) => {
    if (!isObject(options)) {
      errors.push(`${where} must be an object`);
      return;
    }
    Object.entries(options).forEach(([key, value]) => {
      const check = MUI_TYPES[key];
      if (!check) errors.push(`${where}: unknown option ${key}`);
      else if (!check(value)) errors.push(`${where}.${key} is not valid: ${JSON.stringify(value)}`);
    });
  };
  if (pkg.mui !== undefined) checkMui(pkg.mui, 'mui');
  if (pkg.muiModes !== undefined) {
    if (!isObject(pkg.muiModes)) errors.push('muiModes must be an object');
    else Object.entries(pkg.muiModes).forEach(([mode, options]) => {
      if (!MODES.includes(mode)) errors.push(`muiModes.${mode}: use light or dark`);
      else checkMui(options, `muiModes.${mode}`);
    });
  }
  return errors;
}

export const DEFAULT_THEME_ID = 'classic';

/**
 * The newest theme manifest this core understands. A shape change to the
 * manifest (a new section, new tokens) raises it, so an older core refuses a
 * theme it cannot draw rather than half-applying it (theme-architecture.md
 * §5). 2: ornaments and the meter roles. 3: the button roles and curved
 * flybys. 4: weather scenes and the flash layer. 5: orbits. The server's MANIFEST_VERSION
 * (services/themeStore.js) matches; a server test holds them equal.
 */
export const MANIFEST_VERSION = 5;

/** The problem reported for a theme newer than this core; the admin page words it for people. */
export const NEEDS_NEWER_HOMEGLOW = 'needs a newer version of HomeGlow';

/**
 * Themes from their folders: each manifest, keyed by its folder, plus that
 * folder's files as a map from relative path (`fonts/x.woff2`) to URL.
 * Classic comes first, then the rest by name. A manifest whose id does not
 * match its folder is left out, so a theme's files can never be another's.
 */
export function discoverThemes(manifests, files) {
  const folderOf = (path) => path.match(/themes\/([^/]+)\//)?.[1];
  const assets = {};
  Object.entries(files).forEach(([path, url]) => {
    const folder = folderOf(path);
    const relative = path.slice(path.indexOf(`themes/${folder}/`) + `themes/${folder}/`.length);
    (assets[folder] = assets[folder] || {})[relative] = url;
  });
  const themes = sortThemes(Object.entries(manifests)
    .filter(([path, manifest]) => manifest && manifest.id === folderOf(path))
    .map(([, manifest]) => manifest));
  return { themes, assets };
}

/** Classic first, then by name. */
export function sortThemes(themes) {
  return [...themes].sort((a, b) => (a.id === DEFAULT_THEME_ID ? -1 : b.id === DEFAULT_THEME_ID ? 1 : a.name.localeCompare(b.name)));
}

const DISCOVERED = discoverThemes(MANIFESTS, FILES);
export const BUILT_IN_THEMES = DISCOVERED.themes;
/** Each built-in theme's files: { id: { 'fonts/x.woff2': url } }. */
export const THEME_ASSETS = DISCOVERED.assets;

const byId = (themes) => new Map(themes.map((theme) => [theme.id, theme]));

/**
 * A resolved theme in one of its weather scenes (#247): the scene's colors and
 * tokens over the theme's, and its ambience and confetti in place of the
 * theme's. `scene` is the key it shows ('default' without one), which the
 * ambience is keyed on, so a change of weather draws a fresh scene.
 */
function withWeatherScene(theme, key) {
  const sceneKey = key || 'default';
  const scene = sceneKey === 'default' ? theme.weather.default : theme.weather.scenes?.[sceneKey];
  if (!isObject(scene)) return { ...theme, scene: sceneKey };
  return {
    ...theme,
    scene: sceneKey,
    colors: scene.colors ? { ...theme.colors, ...scene.colors } : theme.colors,
    tokens: Object.fromEntries(['all', ...MODES].map((mode) => [mode, { ...theme.tokens?.[mode], ...scene.tokens?.[mode] }])),
    ambience: scene.ambience || theme.ambience,
    ambienceAssets: scene.ambience ? theme.weatherAssets : theme.ambienceAssets,
    confetti: scene.confetti || theme.confetti,
    confettiAssets: scene.confetti ? theme.weatherAssets : theme.confettiAssets,
  };
}

/**
 * A theme with its ancestors merged in: tokens, colors and MUI options from
 * the parent first, the theme's own on top. Unknown ids fall back to Classic.
 * A theme with weather scenes shows `scene` (see utils/weatherScenes.js), or
 * its default scene.
 */
export function resolveTheme(id, themes = BUILT_IN_THEMES, assets = THEME_ASSETS, { scene } = {}) {
  const registry = byId(themes);
  const chain = [];
  let current = registry.get(id) || registry.get(DEFAULT_THEME_ID);
  while (current && !chain.includes(current) && chain.length < 8) {
    chain.unshift(current);
    current = current.extends ? registry.get(current.extends) : null;
  }
  const resolved = chain.reduce((merged, theme) => ({
    ...merged,
    ...theme,
    // Weather scenes, and the pictures they name, come from the theme that lists them.
    weather: theme.weather || merged.weather,
    weatherAssets: theme.weather ? assets[theme.id] : merged.weatherAssets,
    colors: theme.colors ? { ...merged.colors, ...theme.colors } : merged.colors,
    // Each font keeps the URL from the folder of the theme that named it.
    fonts: [...(merged.fonts || []), ...(theme.fonts || []).map((font) => ({ ...font, url: assets[theme.id]?.[font.src] }))],
    // Ambience and its pictures come from the theme that lists them.
    ambience: theme.ambience || merged.ambience,
    ambienceAssets: theme.ambience ? assets[theme.id] : merged.ambienceAssets,
    // So does confetti.
    confetti: theme.confetti || merged.confetti,
    confettiAssets: theme.confetti ? assets[theme.id] : merged.confettiAssets,
    // And ornaments.
    ornaments: theme.ornaments || merged.ornaments,
    ornamentAssets: theme.ornaments ? assets[theme.id] : merged.ornamentAssets,
    tokens: Object.fromEntries(['all', ...MODES].map((key) => [key, { ...merged.tokens?.[key], ...theme.tokens?.[key] }])),
    mui: theme.mui ? { ...merged.mui, ...theme.mui } : merged.mui,
    muiModes: theme.muiModes
      ? Object.fromEntries(MODES.map((m) => [m, { ...merged.muiModes?.[m], ...theme.muiModes[m] }]))
      : merged.muiModes,
  }), {});
  return resolved.weather ? withWeatherScene(resolved, scene) : resolved;
}

/** The mode a theme can show: the requested one if it supports it. */
export function themeDisplayMode(theme, requestedMode) {
  const modes = theme.modes || MODES;
  return modes.includes(requestedMode) ? requestedMode : modes[0];
}

/** The token values for one mode. */
export function themeTokens(theme, mode) {
  return { ...theme.tokens?.all, ...theme.tokens?.[mode] };
}

/**
 * Set a theme's tokens as inline custom properties on the root, removing any
 * the previous theme set that this one does not. Returns the names it set.
 */
export function applyThemeTokens(root, tokens, previousNames = []) {
  const names = Object.keys(tokens);
  previousNames.filter((name) => !names.includes(name)).forEach((name) => root.style.removeProperty(name));
  names.forEach((name) => root.style.setProperty(name, tokens[name]));
  return names;
}

const registeredFaces = new Set();

/**
 * Register a theme's fonts from its folder, once each, through the FontFace
 * API. Registering does not download: like an @font-face rule, each weight
 * is fetched the first time text needs it.
 */
export function loadThemeFonts(theme) {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  (theme.fonts || []).filter((font) => font.url).forEach((font) => {
    const key = `${font.family}|${font.weight}|${font.style || 'normal'}|${font.url}`;
    if (registeredFaces.has(key)) return;
    registeredFaces.add(key);
    document.fonts.add(new FontFace(font.family, `url(${font.url}) format('woff2')`, {
      weight: String(font.weight),
      style: font.style || 'normal',
    }));
  });
}

/**
 * Options for MUI's createTheme in the given mode, or null for a theme
 * without an `mui` block, which leaves MUI on its own defaults (Classic).
 * `muiModes.light` / `muiModes.dark` override the shared options per mode,
 * and the palette mode follows the displayed mode unless `mui.mode` fixes it.
 */
export function muiThemeOptions(theme, displayMode = 'light') {
  if (!theme.mui) return null;
  const mui = { mode: displayMode, ...theme.mui, ...theme.muiModes?.[displayMode] };
  const heading = {
    ...(mui.headingFontFamily ? { fontFamily: mui.headingFontFamily } : {}),
    ...(mui.headingTransform ? { textTransform: mui.headingTransform } : {}),
  };
  return {
    palette: {
      mode: mui.mode,
      ...(mui.primary ? { primary: { main: mui.primary } } : {}),
      ...(mui.secondary ? { secondary: { main: mui.secondary } } : {}),
      ...(mui.error ? { error: { main: mui.error } } : {}),
      ...(mui.background || mui.paper ? { background: { default: mui.background || mui.paper, paper: mui.paper || mui.background } } : {}),
      ...(mui.text || mui.textSecondary ? { text: { primary: mui.text, secondary: mui.textSecondary || mui.text } } : {}),
      ...(mui.divider ? { divider: mui.divider } : {}),
    },
    ...(Number.isFinite(mui.radius) ? { shape: { borderRadius: mui.radius } } : {}),
    typography: {
      ...(mui.fontFamily ? { fontFamily: mui.fontFamily } : {}),
      h1: heading, h2: heading, h3: heading, h4: heading, h5: heading, h6: heading,
      button: { ...heading },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      ...(mui.pillButtons ? {
        MuiButton: { styleOverrides: { root: { borderRadius: 999 } } },
        MuiToggleButton: { styleOverrides: { root: { borderRadius: 999 } } },
        MuiChip: { styleOverrides: { root: { borderRadius: 999 } } },
      } : {}),
    },
  };
}
