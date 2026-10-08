import { hexToRgbTriplet } from './interfaceSettings.js';

// The theme message a PluginWidgetWrapper posts into its iframe. A plugin is a
// separate document: it gets the static /index.css and nothing else, so without
// this it renders the stylesheet's default accent while the dashboard beside
// it shows the picked one. The SDK writes these values onto the plugin's root
// under the same variable names, so a plugin written against var(--accent)
// follows the pick with no change of its own.
export const PLUGIN_THEME_MESSAGE_TYPE = 'homeglow:theme';

/** Fired on window when the dashboard has applied a new set of theme tokens. */
export const THEME_TOKENS_APPLIED_EVENT = 'homeglow:theme-tokens-applied';

const pickColor = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * The role tokens a plugin is told, besides the three colors: named for what a
 * thing does, never for how one theme draws it, so a plugin written against
 * var(--text) or var(--hg-meter-fill) looks right under every theme. This list
 * is a contract with plugin authors: add to it, never rename or remove. The
 * SDK (server/plugin-sdk/v1.js) keeps the same list; a server test holds them
 * equal.
 */
export const PLUGIN_ROLE_TOKENS = [
  '--background', '--surface', '--card-bg', '--text', '--text-secondary', '--border',
  '--success', '--warning', '--hg-error',
  '--hg-radius-sm', '--hg-radius-md', '--hg-radius-lg',
  '--hg-font-body', '--hg-font-heading', '--hg-heading-transform', '--hg-heading-letter-spacing',
  '--hg-meter-track', '--hg-meter-fill', '--hg-meter-thickness', '--hg-meter-cap',
  '--hg-button-bg', '--hg-button-text', '--hg-button-radius', '--hg-button-weight', '--hg-button-quiet-border',
];

/** The role tokens' current values on `root`, resolved (var() substituted). */
export function readRoleTokens(root) {
  if (!root || typeof getComputedStyle !== 'function') return {};
  const style = getComputedStyle(root);
  return Object.fromEntries(PLUGIN_ROLE_TOKENS
    .map((name) => [name, style.getPropertyValue(name).trim()])
    .filter(([, value]) => value));
}

// A theme's fonts, as the plugin needs them to load one: family, weight, style
// and the file's URL. Fonts without a URL (none to load) are left out.
const pluginFonts = (fonts) => (Array.isArray(fonts) ? fonts : [])
  .filter((font) => font && typeof font.url === 'string' && font.url && typeof font.family === 'string')
  .map(({ family, weight, style, url }) => ({ family, weight: weight ?? 400, style: style || 'normal', url }));

/**
 * Build the message for a theme and an interface-colors object. Unknown themes
 * become 'dark' (the stylesheet's :root), missing colors become null so the SDK
 * leaves that variable on its stylesheet default rather than clearing it.
 * Version 2 adds the role tokens and the theme's fonts; a version 1 SDK reads
 * only theme and colors, so older plugins are unaffected.
 */
export function buildPluginThemeMessage(theme, colors, { tokens = {}, fonts = [] } = {}) {
  const source = colors && typeof colors === 'object' ? colors : {};
  const accent = pickColor(source.accent);
  const roles = Object.fromEntries(PLUGIN_ROLE_TOKENS
    .filter((name) => typeof tokens?.[name] === 'string' && tokens[name].trim())
    .map((name) => [name, tokens[name].trim()]));
  return {
    type: PLUGIN_THEME_MESSAGE_TYPE,
    version: 2,
    theme: theme === 'light' ? 'light' : 'dark',
    tokens: roles,
    fonts: pluginFonts(fonts),
    colors: {
      primary: pickColor(source.primary),
      secondary: pickColor(source.secondary),
      accent,
      accentRgb: hexToRgbTriplet(accent),
    },
  };
}
