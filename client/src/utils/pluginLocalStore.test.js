import { describe, expect, it } from 'vitest';
import {
  PLUGIN_STORE_MAX_CHARS, PLUGIN_STORE_MIGRATED_KEY, PLUGIN_STORE_PREFIX,
  applyPluginStoreChange, frameNameFor, migrateLegacyPluginStorage, readPluginStore,
} from './pluginLocalStore.js';

// A Storage with the same surface the browser's has.
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
    dump: () => Object.fromEntries(data),
  };
}

describe('a plugin\'s own store', () => {
  it('is empty until the plugin saves, then holds what it saved', () => {
    const storage = fakeStorage();
    expect(readPluginStore('Grill.html', storage)).toEqual({});
    expect(applyPluginStoreChange('Grill.html', { op: 'set', key: 'grill-card:range', value: '24h' }, storage)).toBe(true);
    expect(readPluginStore('Grill.html', storage)).toEqual({ 'grill-card:range': '24h' });
    expect(readPluginStore('Polls.html', storage)).toEqual({}, 'another plugin sees none of it');
    expect(JSON.parse(frameNameFor('Grill.html', storage))).toEqual({ homeglowLocalStorage: { 'grill-card:range': '24h' } });
  });

  it('removes and clears, and refuses malformed changes', () => {
    const storage = fakeStorage();
    applyPluginStoreChange('A.html', { op: 'set', key: 'a', value: '1' }, storage);
    applyPluginStoreChange('A.html', { op: 'set', key: 'b', value: '2' }, storage);
    expect(applyPluginStoreChange('A.html', { op: 'remove', key: 'a' }, storage)).toBe(true);
    expect(readPluginStore('A.html', storage)).toEqual({ b: '2' });
    expect(applyPluginStoreChange('A.html', { op: 'set', key: 'n', value: 5 }, storage)).toBe(false);
    expect(applyPluginStoreChange('A.html', { op: 'grant', key: 'x' }, storage)).toBe(false);
    expect(applyPluginStoreChange('A.html', null, storage)).toBe(false);
    expect(applyPluginStoreChange('A.html', { op: 'clear' }, storage)).toBe(true);
    expect(readPluginStore('A.html', storage)).toEqual({});
  });

  it('keeps each plugin within its share of the display\'s storage', () => {
    const storage = fakeStorage();
    const big = 'x'.repeat(PLUGIN_STORE_MAX_CHARS);
    expect(applyPluginStoreChange('A.html', { op: 'set', key: 'k', value: big }, storage)).toBe(false);
    expect(readPluginStore('A.html', storage)).toEqual({});
  });

  it('survives a corrupt entry', () => {
    const storage = fakeStorage({ [`${PLUGIN_STORE_PREFIX}A.html`]: '{not json', [`${PLUGIN_STORE_PREFIX}B.html`]: '{"ok":"1","n":2}' });
    expect(readPluginStore('A.html', storage)).toEqual({});
    expect(readPluginStore('B.html', storage)).toEqual({ ok: '1' });
  });
});

describe('carrying the old localStorage over', () => {
  const installed = [
    { filename: 'GuestWifi.html', pluginId: 'guest-wifi' },
    { filename: 'Grill.html', pluginId: 'grill-card' },
    { filename: 'Mine.html', pluginId: 'my-own-plugin' },
  ];

  it('gives each published plugin its own old keys, once', () => {
    const storage = fakeStorage({
      guestWifi_networks: '[{"ssid":"Home"}]',
      'grill-card:range': 'all',
      'grill-card:cmp': '{"sid":1}',
      homeglow_device_name: 'Kitchen',
      themeMode: 'dark',
    });
    migrateLegacyPluginStorage(installed, storage);
    expect(readPluginStore('GuestWifi.html', storage)).toEqual({ guestWifi_networks: '[{"ssid":"Home"}]' });
    expect(readPluginStore('Grill.html', storage)).toEqual({ 'grill-card:range': 'all', 'grill-card:cmp': '{"sid":1}' });
    expect(readPluginStore('Mine.html', storage)).toEqual({}, 'no table entry: nothing carried');
    expect(storage.getItem(PLUGIN_STORE_MIGRATED_KEY)).toBeTruthy();
    expect(storage.getItem('guestWifi_networks')).toBe('[{"ssid":"Home"}]', 'the original stays, for a rollback');
    for (const store of ['GuestWifi.html', 'Grill.html']) {
      expect(readPluginStore(store, storage)).not.toHaveProperty('homeglow_device_name');
    }
  });

  it('never runs again, so a plugin installed later gets nothing', () => {
    const storage = fakeStorage({ guestWifi_networks: 'old' });
    migrateLegacyPluginStorage([], storage);
    migrateLegacyPluginStorage(installed, storage);
    expect(readPluginStore('GuestWifi.html', storage)).toEqual({});
  });

  it('keeps what a plugin\'s store already has', () => {
    const storage = fakeStorage({ guestWifi_networks: 'old', [`${PLUGIN_STORE_PREFIX}GuestWifi.html`]: '{"guestWifi_networks":"new"}' });
    migrateLegacyPluginStorage(installed, storage);
    expect(readPluginStore('GuestWifi.html', storage)).toEqual({ guestWifi_networks: 'new' });
  });
});
