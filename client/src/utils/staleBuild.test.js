import { describe, expect, it, vi } from 'vitest';
import { entryScriptOf, installStaleBuildReload, reloadIfBuildChanged } from './staleBuild.js';

const page = (entry) => `<!doctype html><html><head>
    <script type="module" crossorigin src="${entry}"></script>
    <link rel="modulepreload" crossorigin href="/assets/react-core-DJ8Lj12r.js">
  </head><body><div id="root"></div></body></html>`;

describe('entryScriptOf', () => {
  it('reads the module script a built index.html names', () => {
    expect(entryScriptOf(page('/assets/index-DMIDWbO8.js'))).toBe('/assets/index-DMIDWbO8.js');
  });

  it('is null for a page without one, or for no page', () => {
    expect(entryScriptOf('<html><head><script src="/x.js"></script></head></html>')).toBeNull();
    expect(entryScriptOf(undefined)).toBeNull();
  });
});

describe('reloadIfBuildChanged', () => {
  it('reloads when the server names a different build', async () => {
    const reload = vi.fn();
    const changed = await reloadIfBuildChanged({
      currentEntry: '/assets/index-old.js',
      fetchPage: async () => page('/assets/index-new.js'),
      reload,
    });
    expect(changed).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the page alone when the build is the same, so it never loops', async () => {
    const reload = vi.fn();
    expect(await reloadIfBuildChanged({
      currentEntry: '/assets/index-same.js',
      fetchPage: async () => page('/assets/index-same.js'),
      reload,
    })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves the page alone when the server cannot be read', async () => {
    const reload = vi.fn();
    expect(await reloadIfBuildChanged({
      currentEntry: '/assets/index-old.js',
      fetchPage: async () => { throw new Error('offline'); },
      reload,
    })).toBe(false);
    expect(await reloadIfBuildChanged({
      currentEntry: '/assets/index-old.js',
      fetchPage: async () => '<html>a proxy error page</html>',
      reload,
    })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing without a current entry (the dev server)', async () => {
    const fetchPage = vi.fn();
    expect(await reloadIfBuildChanged({ currentEntry: null, fetchPage, reload: vi.fn() })).toBe(false);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe('installStaleBuildReload', () => {
  const fakeWindow = (entry, served) => {
    const target = new EventTarget();
    const script = { getAttribute: () => entry };
    return Object.assign(target, {
      document: { querySelector: () => (entry ? script : null) },
      fetch: vi.fn(async () => ({ ok: true, text: async () => page(served) })),
      location: { reload: vi.fn() },
    });
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('checks the server on a preload error and reloads into the new build', async () => {
    const win = fakeWindow('/assets/index-old.js', '/assets/index-new.js');
    installStaleBuildReload(win);
    win.dispatchEvent(new Event('vite:preloadError'));
    await settle();
    expect(win.fetch).toHaveBeenCalledWith('/', { cache: 'no-store' });
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('asks the server once for errors that arrive together', async () => {
    const win = fakeWindow('/assets/index-same.js', '/assets/index-same.js');
    installStaleBuildReload(win);
    win.dispatchEvent(new Event('vite:preloadError'));
    win.dispatchEvent(new Event('vite:preloadError'));
    await settle();
    expect(win.fetch).toHaveBeenCalledTimes(1);
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('stops listening when removed', async () => {
    const win = fakeWindow('/assets/index-old.js', '/assets/index-new.js');
    installStaleBuildReload(win)();
    win.dispatchEvent(new Event('vite:preloadError'));
    await settle();
    expect(win.fetch).not.toHaveBeenCalled();
  });
});
