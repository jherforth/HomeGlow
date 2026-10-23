// Each plugin's own localStorage, kept by the dashboard (mrramam/HomeGlow#50).
//
// Plugin frames have an opaque origin, where localStorage throws, so the
// script HomeGlow serves every plugin page with (server/utils/pluginFrameShims.js)
// puts a stand-in in its place. This is the other half: the dashboard keeps
// each plugin's keys under its own entry in this display's localStorage, hands
// them to the frame in its `name` when it loads, and saves the changes the
// frame posts back. One plugin never sees another's keys, or the dashboard's.
//
// Plugins used to share the dashboard's own localStorage, so their saved data
// is still there under the keys they used. The first time this version runs
// on a display, it copies the published plugins' keys (LEGACY_PLUGIN_KEYS)
// into their stores, once, for the plugins installed then. A plugin installed
// later gets nothing, so it can't collect what another plugin left behind.
// The old keys stay where they were, for a rollback; no plugin can read them.

export const PLUGIN_STORE_PREFIX = 'homeglow-plugin-local:';
export const PLUGIN_STORE_MIGRATED_KEY = 'homeglow-plugin-local-migrated';
// The same limit the frame's stand-in enforces, in characters.
export const PLUGIN_STORE_MAX_CHARS = 512 * 1024;
export const LOCAL_STORAGE_MESSAGE_TYPE = 'homeglow:local-storage';

// The published plugins' old keys (HomeGlowPlugins), by plugin id. A key the
// plugin saved under is taken if it starts with one of these.
export const LEGACY_PLUGIN_KEYS = Object.freeze({
  'bills-reminder': ['billsReminder_'],
  'family-bucket-list': ['homeglowBucketList'],
  'calendar-agenda': ['homeglow.calendarAgenda.'],
  'family-countdown': ['homeglowCountdowns'],
  'daily-rotation': ['dailyRotation'],
  'emoji-story': ['emojiStory_'],
  'family-contacts': ['familyContacts_'],
  'grill-card': ['grill-card:'],
  'guest-wifi': ['guestWifi_'],
  'healthy-habits': ['habitCompletions', 'habitsSelectedUser', 'healthyHabits'],
  'family-messages': ['familyMessages', 'messageBoardCurrentUser'],
  'rss-reader': ['homeglow.rssReader.'],
  'pixel-reveal': ['pixelReveal_'],
  'family-polls': ['pollWidget_'],
  'routines': ['homeglow.routines.'],
  'school-lunch': ['schoolLunch_'],
  'family-scoreboard': ['homeglowActivities', 'homeglowScores'],
  'ha-vacuum-card': ['homeglow.vacuum.'],
  'wheel-of-choice': ['spinWheel_'],
  'word-guess': ['wotd_'],
});

const sizeOf = (map) => Object.entries(map).reduce((total, [key, value]) => total + key.length + value.length, 0);

const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** A plugin's saved keys on this display: { key: value }, all strings. */
export function readPluginStore(filename, storage = browserStorage()) {
  if (!storage || !filename) return {};
  try {
    const parsed = JSON.parse(storage.getItem(PLUGIN_STORE_PREFIX + filename) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string'));
  } catch {
    return {};
  }
}

function writePluginStore(filename, map, storage) {
  try {
    storage.setItem(PLUGIN_STORE_PREFIX + filename, JSON.stringify(map));
    return true;
  } catch {
    return false; // this display's storage is full or blocked: the plugin keeps it in memory
  }
}

/** The frame's `name`: the plugin's saved keys, for its stand-in to start from. */
export function frameNameFor(filename, storage = browserStorage()) {
  return JSON.stringify({ homeglowLocalStorage: readPluginStore(filename, storage) });
}

/**
 * Apply one change a plugin's frame posted ({ op, key?, value? }). The
 * caller has already checked it came from that plugin's own frame. Returns
 * true when it was applied.
 */
export function applyPluginStoreChange(filename, change, storage = browserStorage()) {
  if (!storage || !filename || !change || typeof change !== 'object') return false;
  const map = readPluginStore(filename, storage);
  if (change.op === 'clear') {
    return writePluginStore(filename, {}, storage);
  }
  if (typeof change.key !== 'string' || change.key.length > 1024) return false;
  if (change.op === 'remove') {
    if (!Object.hasOwn(map, change.key)) return false;
    delete map[change.key];
    return writePluginStore(filename, map, storage);
  }
  if (change.op === 'set' && typeof change.value === 'string') {
    map[change.key] = change.value;
    if (sizeOf(map) > PLUGIN_STORE_MAX_CHARS) return false;
    return writePluginStore(filename, map, storage);
  }
  return false;
}

/**
 * Once per display: copy each installed published plugin's old keys from the
 * dashboard's own localStorage into that plugin's store. `plugins` is the
 * list from /api/widgets ({ filename, pluginId }). Keys a plugin's store
 * already has are kept as they are.
 */
export function migrateLegacyPluginStorage(plugins, storage = browserStorage()) {
  if (!storage || !Array.isArray(plugins)) return;
  try {
    if (storage.getItem(PLUGIN_STORE_MIGRATED_KEY)) return;
  } catch {
    return;
  }
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && !key.startsWith(PLUGIN_STORE_PREFIX)) keys.push(key);
  }
  for (const plugin of plugins) {
    const prefixes = plugin && LEGACY_PLUGIN_KEYS[plugin.pluginId];
    if (!prefixes || typeof plugin.filename !== 'string') continue;
    const map = readPluginStore(plugin.filename, storage);
    let changed = false;
    for (const key of keys) {
      if (!prefixes.some((prefix) => key.startsWith(prefix)) || Object.hasOwn(map, key)) continue;
      const value = storage.getItem(key);
      if (typeof value !== 'string') continue;
      map[key] = value;
      changed = true;
    }
    if (changed && sizeOf(map) <= PLUGIN_STORE_MAX_CHARS) writePluginStore(plugin.filename, map, storage);
  }
  try {
    storage.setItem(PLUGIN_STORE_MIGRATED_KEY, new Date().toISOString());
  } catch {
    // Not marked: it runs again next time, and keeps what it already copied.
  }
}
