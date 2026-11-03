import { describe, it, expect } from 'vitest';
import { nextExpandedPlugin, firstMissingPluginFilename } from './pluginAccordion.js';

describe('nextExpandedPlugin', () => {
  it('expands a row when none is expanded', () => {
    expect(nextExpandedPlugin(null, 'DateClock.html')).toBe('DateClock.html');
  });

  it('swaps to the tapped row when another is expanded (only one at a time)', () => {
    expect(nextExpandedPlugin('DateClock.html', 'FamilyLists.html')).toBe('FamilyLists.html');
  });

  it('collapses the row when the expanded row itself is tapped', () => {
    expect(nextExpandedPlugin('DateClock.html', 'DateClock.html')).toBeNull();
  });

  it('keeps unrelated rows collapsed', () => {
    expect(nextExpandedPlugin('FamilyLists.html', 'MealChoice.html')).toBe('MealChoice.html');
  });
});

describe('firstMissingPluginFilename', () => {
  it('strips the plugin: prefix from the first missing widget name', () => {
    expect(firstMissingPluginFilename(['plugin:DateClock.html', 'plugin:FamilyLists.html'])).toBe('DateClock.html');
  });

  it('passes a bare filename through unchanged', () => {
    expect(firstMissingPluginFilename(['DateClock.html'])).toBe('DateClock.html');
  });

  it('returns null when nothing is missing', () => {
    expect(firstMissingPluginFilename([])).toBeNull();
    expect(firstMissingPluginFilename(undefined)).toBeNull();
    expect(firstMissingPluginFilename(null)).toBeNull();
  });
});
