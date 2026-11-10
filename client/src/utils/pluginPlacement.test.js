import { describe, expect, it } from 'vitest';
import { isNewPluginInstall, tabForNewPlugin } from './pluginPlacement.js';

describe('isNewPluginInstall', () => {
  const installed = [{ filename: 'clock.html' }, { filename: 'notes.html' }];

  it('is true for a plugin that is not installed yet', () => {
    expect(isNewPluginInstall(installed, 'weather.html')).toBe(true);
    expect(isNewPluginInstall([], 'weather.html')).toBe(true);
    expect(isNewPluginInstall(undefined, 'weather.html')).toBe(true);
  });

  it('is false for an update or a re-upload of the same file', () => {
    expect(isNewPluginInstall(installed, 'clock.html')).toBe(false);
  });

  it('is false without a filename', () => {
    expect(isNewPluginInstall(installed, '')).toBe(false);
    expect(isNewPluginInstall(installed, undefined)).toBe(false);
  });
});

describe('tabForNewPlugin', () => {
  const tabs = [{ number: 1, label: 'Home' }, { number: 3, label: 'Kitchen' }];

  it('uses the tab being viewed', () => {
    expect(tabForNewPlugin(tabs, 3)).toBe(3);
  });

  it('falls back to the first tab when the viewed one is not on this display', () => {
    expect(tabForNewPlugin(tabs, 2)).toBe(1);
    expect(tabForNewPlugin(tabs, undefined)).toBe(1);
  });

  it('is null when there are no tabs', () => {
    expect(tabForNewPlugin([], 1)).toBe(null);
    expect(tabForNewPlugin(undefined, 1)).toBe(null);
  });
});
