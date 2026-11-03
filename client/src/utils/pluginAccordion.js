// The installed-plugins accordion (Admin → Plugins): one plugin's settings
// expanded at a time, all collapsed by default so a long installed list
// stays scannable. Tapping the open row collapses it; tapping another row
// swaps to that one. The expanded row is identified by plugin filename.

// The expanded row after tapping `filename` while `current` is expanded.
// Null means no row is expanded.
export function nextExpandedPlugin(current, filename) {
  return current === filename ? null : filename;
}

// The filename of the first plugin missing a tab assignment, for expanding
// it before revealing its tab picker: the picker lives inside the expanded
// region, so a collapsed row has nothing on the page to scroll to. Entries
// arrive as widget names ('plugin:<filename>'); a bare filename passes
// through unchanged.
export function firstMissingPluginFilename(missingWidgetNames) {
  const first = (missingWidgetNames || [])[0];
  if (!first) return null;
  const name = String(first);
  return name.startsWith('plugin:') ? name.slice('plugin:'.length) : name;
}
