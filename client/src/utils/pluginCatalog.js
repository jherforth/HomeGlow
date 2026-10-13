// Grouping and search for the plugin store list.
//
// A plugin names its category in its manifest ("category": "games"). The list
// and its order live here rather than on the server, so a slug this version
// doesn't know — from a plugin written for a newer list — lands under "Other"
// instead of failing anything.

export const PLUGIN_CATEGORIES = [
  'clock-calendar',
  'news-weather',
  'chores-rewards',
  'family-hub',
  'meals',
  'household',
  'health',
  'games',
];

export const OTHER_CATEGORY = 'other';

const KNOWN_CATEGORIES = new Set(PLUGIN_CATEGORIES);

// True when the search text appears anywhere in the plugin's listed name or
// its manifest name, ignoring case. The list shows file names ("Countdown"),
// so the manifest's ("Family Countdown") is what someone is likely to type.
function matchesSearch(plugin, needle) {
  return [plugin.name, plugin.title].some(
    (name) => typeof name === 'string' && name.toLowerCase().includes(needle)
  );
}

// [{ category, plugins }] in display order — the categories above, then
// Other — with empty groups left out. Plugins keep their order within a group.
export function groupPluginsByCategory(plugins, search = '') {
  const needle = search.trim().toLowerCase();
  const groups = new Map();
  for (const plugin of plugins) {
    if (needle && !matchesSearch(plugin, needle)) continue;
    const category = KNOWN_CATEGORIES.has(plugin.category) ? plugin.category : OTHER_CATEGORY;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(plugin);
  }
  return [...PLUGIN_CATEGORIES, OTHER_CATEGORY]
    .filter((category) => groups.has(category))
    .map((category) => ({ category, plugins: groups.get(category) }));
}

// The installed copy of a store plugin: the same manifest id, or failing that
// (a plugin without one) the same file name. null when it isn't installed.
export function installedCopyOf(storePlugin, installed) {
  const list = Array.isArray(installed) ? installed : [];
  return (storePlugin.pluginId && list.find((plugin) => plugin.pluginId === storePlugin.pluginId))
    || list.find((plugin) => plugin.filename === storePlugin.filename)
    || null;
}

// The store's entry for an installed plugin, the other way round.
export function storeEntryOf(installedPlugin, store) {
  const list = Array.isArray(store) ? store : [];
  return (installedPlugin.pluginId && list.find((plugin) => plugin.pluginId === installedPlugin.pluginId))
    || list.find((plugin) => plugin.filename === installedPlugin.filename)
    || null;
}

// Where a store plugin stands on this HomeGlow (issue #273):
//   'install'  not installed;
//   'current'  installed, and the very same file (the git sha GitHub lists
//              equals the installed copy's), whatever its version says;
//   'update'   installed, and any other copy, which the store's replaces.
// Comparing the file rather than the version means an update shows even when
// its author forgot to raise the version.
export function pluginStoreStatus(storePlugin, installed) {
  const copy = installedCopyOf(storePlugin, installed);
  if (!copy) return 'install';
  return copy.contentSha && storePlugin.sha && copy.contentSha === storePlugin.sha ? 'current' : 'update';
}
