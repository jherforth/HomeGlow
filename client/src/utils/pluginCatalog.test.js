import { describe, expect, it } from 'vitest';
import { OTHER_CATEGORY, PLUGIN_CATEGORIES, groupPluginsByCategory } from './pluginCatalog.js';

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
