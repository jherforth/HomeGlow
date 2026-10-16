// A display left open across an update keeps running the old build. The first
// time it needs a part it hasn't loaded yet (Admin, a widget, a theme layer),
// it asks for a file the update removed, the load fails, and that part stays
// broken until someone reloads. Vite reports such a failure as
// `vite:preloadError`.
//
// Reload then, but only when the server's page names a different entry script,
// that is, when a newer build really is there. A failure from a network blip,
// or from a build a reload wouldn't fix, is left alone, so this can't loop.

// The entry script an index.html names: Vite's one module script.
export const entryScriptOf = (html) => {
  if (typeof html !== 'string') return null;
  const tag = html.match(/<script\b[^>]*\btype=["']module["'][^>]*>/i);
  const src = tag && tag[0].match(/\bsrc=["']([^"']+)["']/i);
  return src ? src[1] : null;
};

/**
 * Resolves true (and reloads) when the page the server serves now names a
 * different entry script than `currentEntry`. Any failure to read it resolves
 * false: no reload.
 */
export async function reloadIfBuildChanged({ currentEntry, fetchPage, reload }) {
  if (!currentEntry) return false;
  let html;
  try {
    html = await fetchPage();
  } catch {
    return false;
  }
  const served = entryScriptOf(html);
  if (!served || served === currentEntry) return false;
  reload();
  return true;
}

/**
 * Listens for Vite's preload errors on `win` for the life of the page. One
 * check at a time: a page whose loads all fail at once asks the server once.
 */
export function installStaleBuildReload(win = window, { base = '/' } = {}) {
  const currentEntry = win.document.querySelector('script[type="module"][src]')?.getAttribute('src') || null;
  let checking = false;
  const onPreloadError = () => {
    if (checking) return;
    checking = true;
    reloadIfBuildChanged({
      currentEntry,
      fetchPage: async () => {
        const response = await win.fetch(base, { cache: 'no-store' });
        if (!response.ok) throw new Error(`index ${response.status}`);
        return response.text();
      },
      reload: () => win.location.reload(),
    }).finally(() => {
      checking = false;
    });
  };
  win.addEventListener('vite:preloadError', onPreloadError);
  return () => win.removeEventListener('vite:preloadError', onPreloadError);
}
