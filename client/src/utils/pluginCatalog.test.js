import { describe, expect, it } from 'vitest';
import {
  OTHER_CATEGORY, PLUGIN_CATEGORIES, groupPluginsByCategory, installedCopyOf, pluginStoreStatus, storeEntryOf,
} from './pluginCatalog.js';

const plugin = (name, category, title) => ({ name, category, title, path: `${name}.html` });

const store = [
  plugin('Bills', 'household', 'Bills Reminder'),
  plugin('Countdown', 'clock-calendar', 'Family Countdown'),
  plugin('DateClock', 'clock-calendar', 'Date & Clock'),
  plugin('Polls', 'family-hub', 'Family Poll'),
  plugin('WordGuess', 'games', 'Word Guess'),
  plugin('nightscout', 'health', 'Nightscout CGM'),
  plugin('OldWidget', undefined, undefined),
  plugin('FromTheFuture', 'astronomy', 'Star Map'),
];

const shape = (groups) => groups.map(({ category, plugins }) => [category, plugins.map((p) => p.name)]);

describe('groupPluginsByCategory', () => {
  it('lists categories in display order with Other last, keeping plugin order', () => {
    expect(shape(groupPluginsByCategory(store))).toEqual([
      ['clock-calendar', ['Countdown', 'DateClock']],
      ['family-hub', ['Polls']],
      ['household', ['Bills']],
      ['health', ['nightscout']],
      ['games', ['WordGuess']],
      [OTHER_CATEGORY, ['OldWidget', 'FromTheFuture']],
    ]);
  });

  it('puts a plugin with no category, or one this version does not know, under Other', () => {
    const [other] = groupPluginsByCategory(store, 'o').filter((g) => g.category === OTHER_CATEGORY);
    expect(other.plugins.map((p) => p.name)).toEqual(['OldWidget', 'FromTheFuture']);
    expect(PLUGIN_CATEGORIES).not.toContain('astronomy');
  });

  it('matches the listed name or the manifest name, ignoring case', () => {
    // "family" is only in the manifest names of Countdown and Polls.
    expect(shape(groupPluginsByCategory(store, 'FAMILY'))).toEqual([
      ['clock-calendar', ['Countdown']],
      ['family-hub', ['Polls']],
    ]);
    expect(shape(groupPluginsByCategory(store, 'wordg'))).toEqual([['games', ['WordGuess']]]);
  });

  it('drops groups with no matches, and returns nothing when nothing matches', () => {
    expect(groupPluginsByCategory(store, 'clock').map((g) => g.category)).toEqual(['clock-calendar']);
    expect(groupPluginsByCategory(store, 'zzz')).toEqual([]);
  });

  it('treats blank search as no search', () => {
    expect(shape(groupPluginsByCategory(store, '   '))).toEqual(shape(groupPluginsByCategory(store)));
  });
});

describe('pluginStoreStatus (issue #273)', () => {
  const storeMusic = { filename: 'Music.html', pluginId: 'music', sha: 'aaa', version: '1.1.0' };
  const storeLegacy = { filename: 'Old.html', sha: 'ccc' };

  it('is install when nothing here matches', () => {
    expect(pluginStoreStatus(storeMusic, [])).toBe('install');
    expect(pluginStoreStatus(storeMusic, [{ filename: 'Other.html', pluginId: 'other', contentSha: 'aaa' }])).toBe('install');
  });

  it('is current when the installed copy is the very same file, whatever its version', () => {
    expect(pluginStoreStatus(storeMusic, [{ filename: 'Music.html', pluginId: 'music', contentSha: 'aaa', version: '1.0.0' }])).toBe('current');
  });

  it('is update for any other copy, even one whose version was not raised', () => {
    expect(pluginStoreStatus(storeMusic, [{ filename: 'Music.html', pluginId: 'music', contentSha: 'bbb', version: '1.1.0' }])).toBe('update');
    expect(pluginStoreStatus(storeMusic, [{ filename: 'Music.html', pluginId: 'music' }])).toBe('update');
  });

  it('matches by manifest id first, then by file name', () => {
    const renamed = { filename: 'MyMusic.html', pluginId: 'music', contentSha: 'aaa' };
    expect(installedCopyOf(storeMusic, [renamed])).toBe(renamed);
    expect(pluginStoreStatus(storeMusic, [renamed])).toBe('current');
    const legacy = { filename: 'Old.html', contentSha: 'ccc' };
    expect(pluginStoreStatus(storeLegacy, [legacy])).toBe('current');
  });

  it('finds the store entry for an installed plugin', () => {
    expect(storeEntryOf({ filename: 'MyMusic.html', pluginId: 'music' }, [storeLegacy, storeMusic])).toBe(storeMusic);
    expect(storeEntryOf({ filename: 'Old.html' }, [storeLegacy, storeMusic])).toBe(storeLegacy);
    expect(storeEntryOf({ filename: 'Mine.html', pluginId: 'mine' }, [storeLegacy, storeMusic])).toBe(null);
  });
});
