import { describe, it, expect } from 'vitest';
import { checkThemeFolder, mergeInstalledThemes, themeFolderFiles } from './installedThemes.js';
import { BUILT_IN_THEMES, resolveTheme } from './themes.js';

const nebula = {
  id: 'nebula',
  installedAt: '2026-10-06T22:00:00.000Z',
  files: ['assets/cloud.svg', 'fonts/face-400.woff2'],
  manifest: {
    manifestVersion: 1,
    id: 'nebula',
    name: 'Nebula',
    extends: 'classic',
    fonts: [{ family: 'Face', weight: 400, src: 'fonts/face-400.woff2' }],
    tokens: { all: { '--accent': '#ff66aa' } },
    ambience: [{ layer: 'image', src: 'assets/cloud.svg', anchor: 'fill' }],
  },
};
const merge = (installed) => mergeInstalledThemes(installed, { apiBase: 'http://hg:5001' });

describe('mergeInstalledThemes', () => {
  it('adds a valid installed theme, with its files served by the API', () => {
    const { themes, assets, installedIds, rejected } = merge([nebula]);
    expect(rejected).toEqual([]);
    expect(installedIds).toEqual(['nebula']);
    expect(themes[0].id).toBe('classic');
    expect(themes.map((t) => t.id)).toContain('nebula');
    expect(assets.nebula['assets/cloud.svg']).toBe('http://hg:5001/api/themes/nebula/assets/cloud.svg?v=2026-10-06T22%3A00%3A00.000Z');
    const resolved = resolveTheme('nebula', themes, assets);
    expect(resolved.tokens.all['--accent']).toBe('#ff66aa');
    expect(resolved.fonts.at(-1).url).toBe(assets.nebula['fonts/face-400.woff2']);
    expect(resolved.ambienceAssets).toBe(assets.nebula);
  });

  it('leaves out a theme that fails validation, and says why', () => {
    const injected = { ...nebula, manifest: { ...nebula.manifest, tokens: { all: { '--accent': 'red; background: url(x)' } } } };
    const missingFile = { ...nebula, files: ['assets/cloud.svg'] };
    const notItsFolder = { ...nebula, id: 'reef' };
    const classic = { ...nebula, id: 'classic', manifest: { ...nebula.manifest, id: 'classic' } };
    const { themes, rejected } = merge([injected, missingFile, notItsFolder, classic]);
    expect(themes.map((t) => t.id)).toEqual(BUILT_IN_THEMES.map((t) => t.id));
    expect(rejected).toHaveLength(4);
    expect(rejected[0].errors.join()).toMatch(/--accent/);
    expect(rejected[1].errors.join()).toMatch(/face-400/);
  });

  it('lets an installed theme replace a built-in one, but never Classic', () => {
    const reef = { ...nebula, id: 'reef', manifest: { ...nebula.manifest, id: 'reef', name: 'Reef 2' } };
    const { themes } = merge([reef]);
    expect(themes.find((t) => t.id === 'reef').name).toBe('Reef 2');
    expect(themes.filter((t) => t.id === 'reef')).toHaveLength(1);
  });

  it('tolerates a missing or malformed list', () => {
    expect(merge(null).themes).toEqual(BUILT_IN_THEMES);
    expect(merge([null, {}]).rejected).toHaveLength(2);
  });
});

describe('adding a theme folder', () => {
  const pick = (name, body) => {
    const file = new File([body], name.split('/').pop());
    Object.defineProperty(file, 'webkitRelativePath', { value: name });
    return file;
  };

  it('names files relative to the theme folder', () => {
    const entries = themeFolderFiles([pick('nebula/theme.json', '{}'), pick('nebula/assets/cloud.svg', '<svg/>')]);
    expect(entries.map((entry) => entry.path)).toEqual(['theme.json', 'assets/cloud.svg']);
  });

  it('checks the manifest against the files beside it before anything is sent', async () => {
    const good = themeFolderFiles([
      pick('n/theme.json', JSON.stringify(nebula.manifest)),
      pick('n/assets/cloud.svg', '<svg/>'),
      pick('n/fonts/face-400.woff2', 'wOF2'),
    ]);
    expect((await checkThemeFolder(good)).errors).toEqual([]);
    expect((await checkThemeFolder(good.slice(0, 2))).errors.join()).toMatch(/face-400/);
    expect((await checkThemeFolder(good.slice(1))).errors).toEqual(['theme.json is missing']);
    expect((await checkThemeFolder(themeFolderFiles([pick('n/theme.json', '{')]))).errors).toEqual(['theme.json is not valid JSON']);
  });
});
