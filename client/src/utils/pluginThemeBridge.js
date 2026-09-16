import { hexToRgbTriplet } from './interfaceSettings.js';

// The theme message a PluginWidgetWrapper posts into its iframe. A plugin is a
// separate document: it gets the static /index.css and nothing else, so without
// this it renders the stylesheet's default accent while the dashboard beside
// it shows the picked one. The SDK writes these values onto the plugin's root
// under the same variable names, so a plugin written against var(--accent)
// follows the pick with no change of its own.
export const PLUGIN_THEME_MESSAGE_TYPE = 'homeglow:theme';

const pickColor = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Build the message for a theme and an interface-colors object. Unknown themes
 * become 'dark' (the stylesheet's :root), missing colors become null so the SDK
 * leaves that variable on its stylesheet default rather than clearing it.
 */
export function buildPluginThemeMessage(theme, colors) {
  const source = colors && typeof colors === 'object' ? colors : {};
  const accent = pickColor(source.accent);
  return {
    type: PLUGIN_THEME_MESSAGE_TYPE,
    theme: theme === 'light' ? 'light' : 'dark',
    colors: {
      primary: pickColor(source.primary),
      secondary: pickColor(source.secondary),
      accent,
      accentRgb: hexToRgbTriplet(accent),
    },
  };
}
