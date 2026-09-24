import { describe, it, expect } from 'vitest';
import { PLUGIN_THEME_MESSAGE_TYPE, buildPluginThemeMessage } from './pluginThemeBridge.js';

describe('buildPluginThemeMessage', () => {
  it('carries theme, the three colors and the accent triplet', () => {
    expect(buildPluginThemeMessage('light', { primary: '#f5f5f5', secondary: '#38bdf8', accent: '#f472b6' })).toEqual({
      type: PLUGIN_THEME_MESSAGE_TYPE,
      theme: 'light',
      colors: { primary: '#f5f5f5', secondary: '#38bdf8', accent: '#f472b6', accentRgb: '244, 114, 182' },
    });
  });

  it('falls back to dark for anything that is not light', () => {
    // The stylesheet's :root is the dark palette, so "unknown" must land there.
    for (const theme of ['dark', 'auto', '', null, undefined, 3]) {
      expect(buildPluginThemeMessage(theme, {}).theme).toBe('dark');
    }
  });

  it('sends null, not a cleared value, for colors it does not have', () => {
    // null tells the SDK to leave that variable on its stylesheet default.
    const message = buildPluginThemeMessage('dark', { accent: '  ' });
    expect(message.colors).toEqual({ primary: null, secondary: null, accent: null, accentRgb: null });
    expect(buildPluginThemeMessage('dark', null).colors.accent).toBeNull();
  });

  it('leaves accentRgb null when the accent is not a hex color', () => {
    expect(buildPluginThemeMessage('dark', { accent: 'hotpink' }).colors).toMatchObject({ accent: 'hotpink', accentRgb: null });
  });
});
