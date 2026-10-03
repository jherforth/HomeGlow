// URL hash navigation for the Admin Panel.
// Format: #/admin/{tab}/{subtab}
// Examples:
//   #/admin              — admin open, default tab
//   #/admin/chores       — admin open, Chores tab
//   #/admin/chores/history — admin open, Chores tab, History sub-tab
// No hash (or unrecognized) — admin closed.

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

export const CHORES_SUBTABS = [
  'definitions',
  'history',
  'settings',
];

export function parseAdminHash() {
  const hash = window.location.hash || '';
  const match = hash.match(/^#\/admin(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!match) return null;
  const tabName = (match[1] || '').toLowerCase();
  const subName = (match[2] || '').toLowerCase();
  const tabIndex = ADMIN_TABS.indexOf(tabName);
  const result = {
    tab: tabIndex >= 0 ? tabIndex : 0,
    subtab: 0,
  };
  // Only chores has sub-tabs for now
  if (result.tab === 3 && subName) {
    const subIndex = CHORES_SUBTABS.indexOf(subName);
    if (subIndex >= 0) result.subtab = subIndex;
  }
  return result;
}

export function buildAdminHash(tabIndex, subtabIndex = 0) {
  const tabName = ADMIN_TABS[tabIndex] || ADMIN_TABS[0];
  let hash = `#/admin/${tabName}`;
  // Only include subtab for chores tab when it's not the default
  if (tabIndex === 3 && subtabIndex > 0) {
    const subName = CHORES_SUBTABS[subtabIndex];
    if (subName) hash += `/${subName}`;
  }
  return hash;
}

export function clearAdminHash() {
  if (window.location.hash.startsWith('#/admin')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export function setAdminHash(tabIndex, subtabIndex = 0) {
  const hash = buildAdminHash(tabIndex, subtabIndex);
  if (window.location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}
