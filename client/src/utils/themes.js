// Theme packages: data, not CSS. A package names the tokens it changes, per
// mode, and every value is checked against the token's type, so a theme can
// recolor and reshape HomeGlow but cannot inject a stylesheet. Classic is the
// empty package: it changes nothing, and HomeGlow renders exactly as the
// stylesheet defines it.
//
// {
//   manifestVersion: 1, id, name, version, description, author,  // as in a plugin manifest
//   ambience: [{ effect, modes, options }],  // built-in background effects (themes/ambience.jsx)
//   extends: 'classic',                // optional; tokens and options merge over the parent
//   modes: ['light', 'dark'],          // the modes it supports; others show modes[0]
//   colors: { primary, secondary, accent },  // what plugins are told (light-mode background, secondary, accent)
//   fonts: ['antonio'],                // built-in fonts to load (see FONT_LOADERS)
//   tokens: { all: {}, light: {}, dark: {} },
//   mui: { ... }                       // see muiThemeOptions; absent = MUI's defaults
//   muiModes: { light: {}, dark: {} }  // per-mode MUI options over `mui`
// }

import classic from '../themes/classic.json';
import starship from '../themes/starship.json';
import reef from '../themes/reef.json';

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
  shadow: isShadow,
  font: isFontFamily,
  image: (v) => v === 'none' || isGradient(v),
  borderStyle: oneOf('none', 'solid', 'dashed', 'dotted', 'double'),
  textTransform: oneOf('none', 'uppercase', 'capitalize', 'lowercase'),
  gridGap: oneOf('0', '0px', '8px', '16px', '24px'),
  backdrop: (v) => v === 'none' || /^blur\((?:[0-9]|1[0-9]|2[0-4])px\)$/.test(v),
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
  ...tokenTypes('lengths4', ['--hg-frame-radius', '--hg-frame-decoration-width', '--hg-frame-inset']),
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

/** Fonts a built-in theme may ask for, bundled so they work offline. */
const FONT_LOADERS = {
  antonio: () => Promise.all([
    import('@fontsource/antonio/400.css'),
    import('@fontsource/antonio/600.css'),
    import('@fontsource/antonio/700.css'),
  ]),
  nunito: () => Promise.all([
    import('@fontsource/nunito/400.css'),
    import('@fontsource/nunito/600.css'),
    import('@fontsource/nunito/700.css'),
  ]),
};

/** Ambience effects a theme may switch on, and the options each accepts. */
export const AMBIENCE_SCHEMA = {
  bubbles: { density: ['low', 'medium', 'high'] },
  caustics: { strength: ['soft', 'bright'] },
  seafloor: { palette: ['sand', 'night'] },
  starfield: { density: ['low', 'medium', 'high'] },
};

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

/** Problems with a package, as readable strings; empty when it is valid. */
export function validateThemePackage(pkg) {
  const errors = [];
  if (!isObject(pkg)) return ['package must be an object'];
  // The same rules as a plugin manifest (server/index.js), so one author
  // writes both the same way.
  if (pkg.manifestVersion !== 1) errors.push('manifestVersion must be 1');
  if (typeof pkg.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(pkg.id)) errors.push('id must be a lowercase slug (a-z, 0-9, hyphens, max 64)');
  if (typeof pkg.name !== 'string' || !pkg.name.trim() || pkg.name.length > 60) errors.push('name is required');
  if (pkg.version !== undefined && (typeof pkg.version !== 'string' || !pkg.version.trim() || pkg.version.length > 32)) errors.push('version must be a short string');
  if (pkg.description !== undefined && (typeof pkg.description !== 'string' || pkg.description.trim().length > 300)) errors.push('description must be 300 characters or fewer');
  if (pkg.author !== undefined && (typeof pkg.author !== 'string' || pkg.author.trim().length > 80)) errors.push('author must be 80 characters or fewer');
  if (pkg.ambience !== undefined) {
    if (!Array.isArray(pkg.ambience) || pkg.ambience.length > 4) errors.push('ambience must list up to 4 effects');
    else pkg.ambience.forEach((entry, i) => {
      const schema = isObject(entry) ? AMBIENCE_SCHEMA[entry.effect] : null;
      if (!schema) {
        errors.push(`ambience[${i}]: unknown effect ${JSON.stringify(entry?.effect)}`);
        return;
      }
      if (entry.modes !== undefined && (!Array.isArray(entry.modes) || !entry.modes.every((m) => MODES.includes(m)))) {
        errors.push(`ambience[${i}].modes must list light and/or dark`);
      }
      Object.entries(entry.options || {}).forEach(([key, value]) => {
        if (!schema[key]?.includes(value)) errors.push(`ambience[${i}].options.${key} is not valid: ${JSON.stringify(value)}`);
      });
    });
  }
  if (pkg.extends !== undefined && typeof pkg.extends !== 'string') errors.push('extends must be a theme id');
  if (pkg.modes !== undefined && (!Array.isArray(pkg.modes) || !pkg.modes.length || !pkg.modes.every((m) => MODES.includes(m)))) {
    errors.push('modes must list light and/or dark');
  }
  if (pkg.colors !== undefined) {
    if (!isObject(pkg.colors)) errors.push('colors must be an object');
    else ['primary', 'secondary', 'accent'].forEach((key) => {
      if (pkg.colors[key] !== undefined && !HEX.test(pkg.colors[key])) errors.push(`colors.${key} must be a hex color`);
    });
  }
  if (pkg.fonts !== undefined && (!Array.isArray(pkg.fonts) || !pkg.fonts.every((f) => Object.prototype.hasOwnProperty.call(FONT_LOADERS, f)))) {
    errors.push(`fonts must be built-in fonts: ${Object.keys(FONT_LOADERS).join(', ')}`);
  }
  if (pkg.tokens !== undefined) {
    if (!isObject(pkg.tokens)) errors.push('tokens must be an object');
    else {
      Object.keys(pkg.tokens).forEach((key) => {
        if (!['all', ...MODES].includes(key)) errors.push(`tokens.${key}: use all, light or dark`);
      });
      ['all', ...MODES].forEach((key) => checkTokens(pkg.tokens[key], `tokens.${key}`, errors));
    }
  }
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

export const BUILT_IN_THEMES = [classic, starship, reef];
export const DEFAULT_THEME_ID = 'classic';

const byId = (themes) => new Map(themes.map((theme) => [theme.id, theme]));

/**
 * A theme with its ancestors merged in: tokens, colors and MUI options from
 * the parent first, the theme's own on top. Unknown ids fall back to Classic.
 */
export function resolveTheme(id, themes = BUILT_IN_THEMES) {
  const registry = byId(themes);
  const chain = [];
  let current = registry.get(id) || registry.get(DEFAULT_THEME_ID);
  while (current && !chain.includes(current) && chain.length < 8) {
    chain.unshift(current);
    current = current.extends ? registry.get(current.extends) : null;
  }
  return chain.reduce((merged, theme) => ({
    ...merged,
    ...theme,
    colors: theme.colors ? { ...merged.colors, ...theme.colors } : merged.colors,
    fonts: [...new Set([...(merged.fonts || []), ...(theme.fonts || [])])],
    ambience: theme.ambience || merged.ambience,
    tokens: Object.fromEntries(['all', ...MODES].map((key) => [key, { ...merged.tokens?.[key], ...theme.tokens?.[key] }])),
    mui: theme.mui ? { ...merged.mui, ...theme.mui } : merged.mui,
    muiModes: theme.muiModes
      ? Object.fromEntries(MODES.map((m) => [m, { ...merged.muiModes?.[m], ...theme.muiModes[m] }]))
      : merged.muiModes,
  }), {});
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

export function loadThemeFonts(theme) {
  return Promise.all((theme.fonts || []).map((font) => FONT_LOADERS[font]?.()));
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
