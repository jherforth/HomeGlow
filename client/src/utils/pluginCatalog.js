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
