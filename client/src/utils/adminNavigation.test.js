import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ADMIN_LAYOUT,
  ADMIN_TABS,
  isAdminHash,
  parseAdminHash,
  buildAdminHash,
  setAdminHash,
  clearAdminHash,
} from './adminNavigation.js';

// Just enough of window.location and window.history for the helpers: a URL
// whose hash replaceState rewrites, and a count of history entries.
function stubWindow(initial = 'http://homeglow.local/?device=kitchen') {
  const url = new URL(initial);
  const replaceState = vi.fn((_state, _title, next) => {
    const resolved = new URL(next, url.href);
    url.pathname = resolved.pathname;
    url.search = resolved.search;
    url.hash = resolved.hash;
  });
  vi.stubGlobal('window', {
    location: {
      get hash() { return url.hash; },
      get pathname() { return url.pathname; },
      get search() { return url.search; },
      get href() { return url.href; },
    },
    history: { replaceState },
  });
  return { url, replaceState };
}

const at = (tab, section = null, subsection = null) => ({ tab, section, subsection });

describe('adminNavigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('parseAdminHash', () => {
    it('reads the tab, section and chores subsection', () => {
      expect(parseAdminHash('#/admin')).toEqual(at('dashboard', 'widgets'));
      expect(parseAdminHash('#/admin/look')).toEqual(at('look'));
      expect(parseAdminHash('#/admin/family')).toEqual(at('family', 'users'));
      expect(parseAdminHash('#/admin/family/chores')).toEqual(at('family', 'chores', 'definitions'));
      expect(parseAdminHash('#/admin/family/chores/history')).toEqual(at('family', 'chores', 'history'));
      expect(parseAdminHash('#/admin/Family/Chores/Settings/')).toEqual(at('family', 'chores', 'settings'));
      expect(parseAdminHash('#/admin/system/about')).toEqual(at('system', 'about'));
      expect(parseAdminHash('#/admin/displays/screensaver')).toEqual(at('displays', 'screensaver'));
    });

    it('sends the names from before the regroup to their new homes (#230)', () => {
      expect(parseAdminHash('#/admin/widgets')).toEqual(at('dashboard', 'widgets'));
      expect(parseAdminHash('#/admin/dashboard/homeassistant')).toEqual(at('dashboard', 'homeassistant'));
      expect(parseAdminHash('#/admin/interface')).toEqual(at('look'));
      expect(parseAdminHash('#/admin/users')).toEqual(at('family', 'users'));
      expect(parseAdminHash('#/admin/chores')).toEqual(at('family', 'chores', 'definitions'));
      expect(parseAdminHash('#/admin/chores/history')).toEqual(at('family', 'chores', 'history'));
      expect(parseAdminHash('#/admin/chores/settings')).toEqual(at('family', 'chores', 'settings'));
      expect(parseAdminHash('#/admin/prizes')).toEqual(at('family', 'prizes'));
      expect(parseAdminHash('#/admin/security')).toEqual(at('security'));
      expect(parseAdminHash('#/admin/connections')).toEqual(at('system', 'connections'));
      expect(parseAdminHash('#/admin/about')).toEqual(at('system', 'about'));
    });

    it('falls back to defaults for unknown parts', () => {
      expect(parseAdminHash('#/admin/nonsense')).toEqual(at('dashboard', 'widgets'));
      expect(parseAdminHash('#/admin/family/nonsense')).toEqual(at('family', 'users'));
      expect(parseAdminHash('#/admin/family/chores/nonsense')).toEqual(at('family', 'chores', 'definitions'));
      // A subsection only exists under a section that has them.
      expect(parseAdminHash('#/admin/family/users/history')).toEqual(at('family', 'users'));
      expect(parseAdminHash('#/admin/users/history')).toEqual(at('family', 'users'));
    });

    it('is null for anything that is not the Admin Panel', () => {
      for (const hash of ['', '#', '#/', '#/photos', '#/administrator', '#/adminfoo', '#/admin/a/b/c/d', 'admin']) {
        expect(parseAdminHash(hash), hash).toBeNull();
        expect(isAdminHash(hash), hash).toBe(false);
      }
    });
  });

  describe('buildAdminHash', () => {
    it('leaves default sections off and round-trips every place', () => {
      expect(buildAdminHash(at('dashboard', 'widgets'))).toBe('#/admin/dashboard');
      expect(buildAdminHash(at('family', 'users'))).toBe('#/admin/family');
      expect(buildAdminHash(at('family', 'chores', 'definitions'))).toBe('#/admin/family/chores');
      expect(buildAdminHash(at('family', 'chores', 'history'))).toBe('#/admin/family/chores/history');
      expect(buildAdminHash(at('system', 'about'))).toBe('#/admin/system/about');

      for (const { tab, sections, subsections } of ADMIN_LAYOUT) {
        const places = sections.length
          ? sections.flatMap((section) => (subsections?.[section] || [null]).map((sub) => at(tab, section, sub)))
          : [at(tab)];
        for (const place of places) {
          expect(parseAdminHash(buildAdminHash(place)), JSON.stringify(place)).toEqual(place);
        }
      }
    });

    it('falls back to the first tab', () => {
      expect(buildAdminHash(at('nonsense'))).toBe('#/admin/dashboard');
      expect(buildAdminHash()).toBe('#/admin/dashboard');
    });

    it('lists six tabs, with section names unique across them', () => {
      expect(ADMIN_TABS).toEqual(['dashboard', 'look', 'displays', 'family', 'security', 'system']);
      const sections = ADMIN_LAYOUT.flatMap((entry) => entry.sections);
      expect(new Set(sections).size).toBe(sections.length);
    });
  });

  describe('setAdminHash / clearAdminHash', () => {
    let win;
    beforeEach(() => {
      win = stubWindow();
    });

    it('replaces the hash without adding history, and skips a no-op', () => {
      setAdminHash(at('family', 'chores', 'history'));
      expect(win.url.hash).toBe('#/admin/family/chores/history');
      // The device query string survives.
      expect(win.url.search).toBe('?device=kitchen');
      setAdminHash(at('family', 'chores', 'history'));
      expect(win.replaceState).toHaveBeenCalledTimes(1);
    });

    it('rewrites an old link to its new home', () => {
      win = stubWindow('http://homeglow.local/?device=kitchen#/admin/chores/history');
      setAdminHash(parseAdminHash(win.url.hash));
      expect(win.url.hash).toBe('#/admin/family/chores/history');
    });

    it('clears an admin hash and keeps the path and query', () => {
      setAdminHash(at('family'));
      clearAdminHash();
      expect(win.url.hash).toBe('');
      expect(win.url.href).toBe('http://homeglow.local/?device=kitchen');
    });

    it('leaves a hash that is not the Admin Panel alone', () => {
      win = stubWindow('http://homeglow.local/#/administrator');
      clearAdminHash();
      expect(win.replaceState).not.toHaveBeenCalled();
      expect(win.url.hash).toBe('#/administrator');
    });
  });
});
