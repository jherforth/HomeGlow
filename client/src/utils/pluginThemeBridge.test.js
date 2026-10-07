import { describe, it, expect } from 'vitest';
import { PLUGIN_ROLE_TOKENS, PLUGIN_THEME_MESSAGE_TYPE, buildPluginThemeMessage, readRoleTokens } from './pluginThemeBridge.js';
import { THEME_TOKENS } from './themes.js';

describe('buildPluginThemeMessage', () => {
  it('carries theme, the three colors and the accent triplet', () => {
    expect(buildPluginThemeMessage('light', { primary: '#f5f5f5', secondary: '#38bdf8', accent: '#f472b6' })).toEqual({
      type: PLUGIN_THEME_MESSAGE_TYPE,
      version: 2,
      theme: 'light',
      tokens: {},
      fonts: [],
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

describe('role tokens and fonts (version 2)', () => {
  it('names only tokens a theme can set', () => {
    PLUGIN_ROLE_TOKENS.forEach((name) => expect(THEME_TOKENS[name], name).toBeDefined());
  });

  it('carries the role tokens it is given, and nothing else', () => {
    const message = buildPluginThemeMessage('dark', {}, {
      tokens: { '--text': ' #ffcc99 ', '--hg-meter-fill': '#ff9900', '--dock-bg': '#000000', '--border': '' },
    });
    expect(message.tokens).toEqual({ '--text': '#ffcc99', '--hg-meter-fill': '#ff9900' });
  });

  it('carries fonts that have a file, with defaults for weight and style', () => {
    const message = buildPluginThemeMessage('dark', {}, {
      fonts: [
        { family: 'Antonio', weight: 700, src: 'fonts/a-700.woff2', url: '/api/themes/starship/fonts/a-700.woff2?v=1' },
        { family: 'Inter', src: 'fonts/i.woff2', url: '/api/themes/x/fonts/i.woff2' },
        { family: 'NoFile', weight: 400 },
      ],
    });
    expect(message.fonts).toEqual([
      { family: 'Antonio', weight: 700, style: 'normal', url: '/api/themes/starship/fonts/a-700.woff2?v=1' },
      { family: 'Inter', weight: 400, style: 'normal', url: '/api/themes/x/fonts/i.woff2' },
    ]);
  });

  it('reads the resolved values from a root, skipping unset ones', () => {
    const values = { '--text': ' #111111', '--hg-radius-md': '14px' };
    globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => values[name] || '' });
    expect(readRoleTokens({})).toEqual({ '--text': '#111111', '--hg-radius-md': '14px' });
    delete globalThis.getComputedStyle;
  });
});
