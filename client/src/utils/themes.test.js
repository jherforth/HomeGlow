import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILT_IN_THEMES,
  THEME_TOKENS,
  applyThemeTokens,
  muiThemeOptions,
  resolveTheme,
  themeDisplayMode,
  themeTokens,
  validateThemePackage,
} from './themes.js';

const css = ['index.css', 'themes/classic.css']
  .map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))
  .join('\n');

const base = { manifestVersion: 1, id: 'probe', name: 'Probe' };
const pkg = (tokens) => ({ ...base, tokens: { all: tokens } });

describe('built-in themes', () => {
  it('are valid packages', () => {
    BUILT_IN_THEMES.forEach((theme) => expect(validateThemePackage(theme), theme.id).toEqual([]));
  });

  it('only use tokens the stylesheets define', () => {
    const undefinedTokens = Object.keys(THEME_TOKENS).filter((name) => !css.includes(`${name}:`));
    expect(undefinedTokens).toEqual([]);
  });
});

describe('validateThemePackage', () => {
  it('accepts typed values', () => {
    expect(validateThemePackage(pkg({
      '--accent': '#ff9900',
      '--hg-hover': 'rgba(255, 153, 0, 0.15)',
      '--hg-frame-radius': '40px 10px 10px 10px',
      '--hg-frame-shadow': '0 0 0 2px #ffcc99, 0 4px 8px rgba(0, 0, 0, 0.3)',
      '--hg-frame-decoration-image': 'linear-gradient(90deg, #ff9900, #cc99cc)',
      '--hg-grid-gap': '8px',
      '--hg-frame-backdrop': 'blur(10px)',
      '--dock-active-image': 'linear-gradient(135deg, #d7263d 0 40%, #ffffff 40% 60%, #d7263d 60%)',
    }))).toEqual([]);
  });

  it('rejects anything that is not a value of the right type', () => {
    const attempts = {
      '--accent': 'red; background: url(https://evil.example/x.png)',
      '--background': 'url(https://evil.example/x.png)',
      '--hg-frame-decoration-image': 'url(https://evil.example/x.png)',
      '--hg-frame-radius': '}body{display:none',
      '--hg-font-body': 'Inter; color: red',
      '--hg-grid-gap': '13px',
      '--hg-frame-decoration-style': 'groove',
      '--hg-frame-backdrop': 'blur(200px) saturate(3)',
      '--made-up-token': '#ffffff',
    };
    const errors = validateThemePackage(pkg(attempts));
    expect(errors).toHaveLength(Object.keys(attempts).length);
  });

  it('checks the package shape', () => {
    expect(validateThemePackage({ manifestVersion: 1, id: 'Bad Id', name: '' })).toHaveLength(2);
    expect(validateThemePackage({ ...base, modes: ['sepia'] })).toHaveLength(1);
    expect(validateThemePackage({ ...base, fonts: ['comic-sans'] })).toHaveLength(1);
    expect(validateThemePackage({ ...base, mui: { radius: 500, wobble: true } })).toHaveLength(2);
  });

  it('follows the plugin manifest rules for manifestVersion, author and version', () => {
    expect(validateThemePackage({ id: 'probe', name: 'Probe' })).toEqual(['manifestVersion must be 1']);
    expect(validateThemePackage({ ...base, author: 'Jane Diver', version: '2.1.0' })).toEqual([]);
    expect(validateThemePackage({ ...base, author: 'x'.repeat(81) })).toHaveLength(1);
    expect(validateThemePackage({ ...base, author: { name: 'Jane' } })).toHaveLength(1);
  });

  it('accepts only built-in ambience effects with known options', () => {
    expect(validateThemePackage({ ...base, ambience: [{ effect: 'bubbles', modes: ['dark'], options: { density: 'low' } }] })).toEqual([]);
    expect(validateThemePackage({ ...base, ambience: [{ effect: 'fireworks' }] })).toHaveLength(1);
    expect(validateThemePackage({ ...base, ambience: [{ effect: 'bubbles', options: { density: 'blizzard' } }] })).toHaveLength(1);
  });
});

describe('resolveTheme', () => {
  const themes = [
    { id: 'classic', name: 'Classic' },
    { id: 'base', name: 'Base', tokens: { all: { '--accent': '#111111', '--text': '#222222' } } },
    { id: 'child', name: 'Child', extends: 'base', tokens: { all: { '--accent': '#333333' } } },
  ];

  it('merges a theme over the one it extends', () => {
    expect(themeTokens(resolveTheme('child', themes), 'dark')).toEqual({ '--accent': '#333333', '--text': '#222222' });
  });

  it('falls back to Classic for an unknown id', () => {
    expect(resolveTheme('missing', themes).id).toBe('classic');
  });

  it('survives an extends loop', () => {
    const loop = [{ id: 'classic', name: 'C' }, { id: 'a', name: 'A', extends: 'b' }, { id: 'b', name: 'B', extends: 'a' }];
    expect(resolveTheme('a', loop).id).toBe('a');
  });
});

describe('themeDisplayMode', () => {
  it('shows a supported mode, else the theme first mode', () => {
    expect(themeDisplayMode(resolveTheme('starship'), 'light')).toBe('dark');
    expect(themeDisplayMode(resolveTheme('classic'), 'light')).toBe('light');
  });
});

describe('applyThemeTokens', () => {
  it('sets new tokens and removes ones the previous theme set', () => {
    const props = new Map([['--accent', '#000000'], ['--text', '#111111']]);
    const root = { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } };
    const names = applyThemeTokens(root, { '--accent': '#ff9900' }, ['--accent', '--text']);
    expect(names).toEqual(['--accent']);
    expect(Object.fromEntries(props)).toEqual({ '--accent': '#ff9900' });
  });
});

describe('muiThemeOptions', () => {
  it('leaves MUI on its defaults for Classic', () => {
    expect(muiThemeOptions(resolveTheme('classic'))).toBeNull();
  });

  it('follows the displayed mode for a two-mode theme', () => {
    const reef = resolveTheme('reef');
    expect(muiThemeOptions(reef, 'light').palette).toMatchObject({ mode: 'light', primary: { main: '#ff7f50' } });
    expect(muiThemeOptions(reef, 'dark').palette).toMatchObject({ mode: 'dark', primary: { main: '#3ee6ff' } });
    expect(themeTokens(reef, 'dark')['--hg-page-image']).toMatch(/^linear-gradient/);
  });

  it('builds a dark palette and pill buttons for Starship', () => {
    const options = muiThemeOptions(resolveTheme('starship'), 'light');
    expect(options.palette.mode).toBe('dark');
    expect(options.palette.primary.main).toBe('#ff9900');
    expect(options.components.MuiButton.styleOverrides.root.borderRadius).toBe(999);
  });
});
