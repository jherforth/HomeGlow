// URL hash navigation for the Admin Panel.
// Format: #/admin/{tab}/{subtab}
// Examples:
//   #/admin              — admin open, default tab
//   #/admin/chores       — admin open, Chores tab
//   #/admin/chores/history — admin open, Chores tab, History sub-tab
// No hash (or unrecognized) — admin closed.
//
// The hash is kept current with history.replaceState, so a refresh or a
// bookmark returns to the same place without every tab click adding a history
// entry. Editing the hash by hand while the panel is open switches tabs.

// Same order as the Admin Panel's tabs (adminTabs in AdminPanel.jsx): the
// position in this list is the tab index.
export const ADMIN_TABS = [
  'widgets',
  'interface',
  'users',
  'chores',
  'prizes',
  'security',
  'connections',
  'about',
];

export const CHORES_TAB_INDEX = ADMIN_TABS.indexOf('chores');

// Same order as the Chores tab's sub-tabs.
export const CHORES_SUBTABS = [
  'definitions',
  'history',
  'settings',
];

// "#/admin", "#/admin/<tab>" or "#/admin/<tab>/<subtab>", optionally with a
// trailing slash, and nothing else: "#/administrator" is not the Admin Panel.
const ADMIN_HASH = /^#\/admin(?:\/([^/]+))?(?:\/([^/]+))?\/?$/;

export function isAdminHash(hash = window.location.hash) {
  return ADMIN_HASH.test(hash || '');
}

export function parseAdminHash(hash = window.location.hash) {
  const match = (hash || '').match(ADMIN_HASH);
  if (!match) return null;
  const tabName = (match[1] || '').toLowerCase();
  const subName = (match[2] || '').toLowerCase();
  const tabIndex = ADMIN_TABS.indexOf(tabName);
  const result = {
    tab: tabIndex >= 0 ? tabIndex : 0,
    subtab: 0,
  };
  // Only chores has sub-tabs for now
  if (result.tab === CHORES_TAB_INDEX && subName) {
    const subIndex = CHORES_SUBTABS.indexOf(subName);
    if (subIndex >= 0) result.subtab = subIndex;
  }
  return result;
}

export function buildAdminHash(tabIndex, subtabIndex = 0) {
  const tabName = ADMIN_TABS[tabIndex] || ADMIN_TABS[0];
  let hash = `#/admin/${tabName}`;
  // Only include subtab for chores tab when it's not the default
  if (tabIndex === CHORES_TAB_INDEX && subtabIndex > 0) {
    const subName = CHORES_SUBTABS[subtabIndex];
    if (subName) hash += `/${subName}`;
  }
  return hash;
}

export function clearAdminHash() {
  if (isAdminHash()) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export function setAdminHash(tabIndex, subtabIndex = 0) {
  const hash = buildAdminHash(tabIndex, subtabIndex);
  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', hash);
  }
}
