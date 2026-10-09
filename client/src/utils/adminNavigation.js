// URL hash navigation for the Admin Panel.
// Format: #/admin/{tab}/{section}/{subsection}
// Examples:
//   #/admin                        — admin open, first tab
//   #/admin/family                 — Family tab, its first section (Users)
//   #/admin/family/chores/history  — Family tab, Chores section, History
// No hash (or unrecognized) — admin closed.
//
// The hash is kept current with history.replaceState, so a refresh or a
// bookmark returns to the same place without every tab click adding a history
// entry. Editing the hash by hand while the panel is open switches tabs.

// The panel's tabs, grouped by what you're managing (issue #230), each with
// its sections in display order. The first section of each list is the one a
// tab opens on. Section names are unique across tabs.
export const ADMIN_LAYOUT = [
  { tab: 'dashboard', sections: ['widgets', 'plugins', 'homeassistant', 'tabs'] },
  { tab: 'look', sections: [] },
  { tab: 'displays', sections: ['devices', 'screensaver'] },
  {
    tab: 'family',
    sections: ['users', 'chores', 'prizes', 'vacation'],
    subsections: { chores: ['definitions', 'history', 'settings'] },
  },
  { tab: 'security', sections: [] },
  { tab: 'system', sections: ['region', 'connections', 'about'] },
];

export const ADMIN_TABS = ADMIN_LAYOUT.map((entry) => entry.tab);

// Names from before #230, so old bookmarks and links land in the section's
// new home. The hash is then rewritten to the new name.
const LEGACY_TABS = {
  widgets: { tab: 'dashboard', section: 'widgets' },
  interface: { tab: 'look' },
  users: { tab: 'family', section: 'users' },
  chores: { tab: 'family', section: 'chores' },
  prizes: { tab: 'family', section: 'prizes' },
  connections: { tab: 'system', section: 'connections' },
  about: { tab: 'system', section: 'about' },
};

const layoutFor = (tab) => ADMIN_LAYOUT.find((entry) => entry.tab === tab) || ADMIN_LAYOUT[0];

// Fill in and correct a location: an unknown tab is the first tab, an unknown
// or missing section the tab's first, and likewise for a subsection.
export function normalizeAdminLocation({ tab, section, subsection } = {}) {
  const layout = layoutFor(tab);
  const sections = layout.sections;
  const normalSection = sections.includes(section) ? section : (sections[0] || null);
  const subsections = (normalSection && layout.subsections?.[normalSection]) || [];
  const normalSubsection = subsections.includes(subsection) ? subsection : (subsections[0] || null);
  return { tab: layout.tab, section: normalSection, subsection: normalSubsection };
}

// "#/admin" with up to three path segments, optionally with a trailing slash,
// and nothing else: "#/administrator" is not the Admin Panel.
const ADMIN_HASH = /^#\/admin(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?\/?$/;

export function isAdminHash(hash = window.location.hash) {
  return ADMIN_HASH.test(hash || '');
}

export function parseAdminHash(hash = window.location.hash) {
  const match = (hash || '').match(ADMIN_HASH);
  if (!match) return null;
  const [first, second, third] = match.slice(1).map((part) => (part || '').toLowerCase());

  const legacy = LEGACY_TABS[first];
  if (legacy) {
    // Old links had at most one level below the tab: chores/history.
    return normalizeAdminLocation({ ...legacy, subsection: second });
  }
  return normalizeAdminLocation({ tab: first, section: second, subsection: third });
}

// The canonical hash for a location. A section or subsection that is the
// default for its parent is left off, so "#/admin/family" rather than
// "#/admin/family/users".
export function buildAdminHash(location) {
  const { tab, section, subsection } = normalizeAdminLocation(location);
  const layout = layoutFor(tab);
  const parts = [tab];
  const subsections = (section && layout.subsections?.[section]) || [];
  const subsectionShown = subsection && subsection !== subsections[0];
  if (section && (section !== layout.sections[0] || subsectionShown)) parts.push(section);
  if (subsectionShown) parts.push(subsection);
  return `#/admin/${parts.join('/')}`;
}

export function clearAdminHash() {
  if (isAdminHash()) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export function setAdminHash(location) {
  const hash = buildAdminHash(location);
  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', hash);
  }
}
