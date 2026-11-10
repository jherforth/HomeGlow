// Where a newly installed plugin goes, so it shows up on the screen at once
// instead of sitting switched off in Admin's plugin list.

/**
 * Whether installing `filename` adds a plugin rather than updating one that
 * is already installed. Only a new plugin is switched on and placed: an
 * update keeps whatever its settings and tabs already were.
 */
export function isNewPluginInstall(installedWidgets, filename) {
  if (!filename) return false;
  return !(Array.isArray(installedWidgets) ? installedWidgets : [])
    .some((widget) => widget?.filename === filename);
}

/**
 * The tab a new plugin is placed on: the one being viewed, or the first tab
 * when that one isn't among this display's tabs (Admin opened straight from
 * a link, or the tab was deleted). Null when the display has no tabs.
 */
export function tabForNewPlugin(tabs, viewedTab) {
  const list = Array.isArray(tabs) ? tabs : [];
  if (list.some((tab) => tab?.number === viewedTab)) return viewedTab;
  return list[0]?.number ?? null;
}
