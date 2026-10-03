import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ADMIN_TABS,
  CHORES_TAB_INDEX,
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

describe('adminNavigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('parseAdminHash', () => {
    it('reads the tab and the chores sub-tab', () => {
      expect(parseAdminHash('#/admin')).toEqual({ tab: 0, subtab: 0 });
      expect(parseAdminHash('#/admin/users')).toEqual({ tab: 2, subtab: 0 });
      expect(parseAdminHash('#/admin/chores/history')).toEqual({ tab: CHORES_TAB_INDEX, subtab: 1 });
      expect(parseAdminHash('#/admin/Chores/Settings/')).toEqual({ tab: CHORES_TAB_INDEX, subtab: 2 });
    });

    it('falls back to the first tab, or no sub-tab, for names it does not know', () => {
      expect(parseAdminHash('#/admin/nonsense')).toEqual({ tab: 0, subtab: 0 });
      expect(parseAdminHash('#/admin/chores/nonsense')).toEqual({ tab: CHORES_TAB_INDEX, subtab: 0 });
      // Only Chores has sub-tabs.
      expect(parseAdminHash('#/admin/users/history')).toEqual({ tab: 2, subtab: 0 });
    });

    it('returns null when the hash is not the Admin Panel', () => {
      for (const hash of ['', '#', '#/', '#/photos', '#/administrator', '#/adminfoo', '#/admin/a/b/c', 'admin']) {
        expect(parseAdminHash(hash), hash).toBeNull();
        expect(isAdminHash(hash), hash).toBe(false);
      }
    });
  });

  describe('buildAdminHash', () => {
    it('round-trips every tab', () => {
      ADMIN_TABS.forEach((name, index) => {
        expect(buildAdminHash(index)).toBe(`#/admin/${name}`);
        expect(parseAdminHash(buildAdminHash(index))).toEqual({ tab: index, subtab: 0 });
      });
    });

    it('names a chores sub-tab only when it is not the first', () => {
      expect(buildAdminHash(CHORES_TAB_INDEX, 0)).toBe('#/admin/chores');
      expect(buildAdminHash(CHORES_TAB_INDEX, 1)).toBe('#/admin/chores/history');
      expect(buildAdminHash(2, 1)).toBe('#/admin/users');
    });

    it('falls back to the first tab for an index out of range', () => {
      expect(buildAdminHash(99)).toBe('#/admin/widgets');
    });
  });

  describe('setAdminHash / clearAdminHash', () => {
    let win;
    beforeEach(() => {
      win = stubWindow();
    });

    it('replaces the hash without adding history, and skips a no-op', () => {
      setAdminHash(CHORES_TAB_INDEX, 1);
      expect(win.url.hash).toBe('#/admin/chores/history');
      // The device query string survives.
      expect(win.url.search).toBe('?device=kitchen');
      setAdminHash(CHORES_TAB_INDEX, 1);
      expect(win.replaceState).toHaveBeenCalledTimes(1);
    });

    it('clears an admin hash and keeps the path and query', () => {
      setAdminHash(2);
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
