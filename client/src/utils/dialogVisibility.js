// Helpers behind "hide the dock while a dialog is open". The floating dock
// renders above MUI dialogs (z-index 9999), so on a phone it covers the
// bottom action buttons of a dialog opened from a widget — the dialog's own
// buttons end up under the dock. The rule is general: any open dialog hides
// the dock, whatever opened it and on whatever screen, and the dock returns
// when the last dialog closes.
//
// How an open dialog is recognised: a MUI Dialog renders its paper
// (role="dialog") inside a .MuiModal-root portal on document.body. Menus,
// select popups and other Modal users carry a different role (menu,
// listbox), so they never hide the dock. No dialog in this app uses
// keepMounted, so a closed dialog's modal root is removed from the document
// entirely — presence means open, including while it fades out. Counting
// (not a boolean) is what makes stacked dialogs work: two dialogs open at
// once must not bring the dock back when only one closes.
//
// What this does not cover: dialogs inside plugin iframes live in their own
// documents, which this watcher cannot see from the parent page. A plugin
// dialog's buttons can still end up under the dock; that needs a
// per-iframe approach, not this one.

export const OPEN_DIALOG_SELECTOR = '.MuiModal-root [role="dialog"]';

// How many dialogs are open in a document-like root. A root without
// querySelectorAll (or no root at all) counts as none open.
export function countOpenDialogs(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  return root.querySelectorAll(OPEN_DIALOG_SELECTOR).length;
}

// Watches the document for open dialogs. `onChange(open)` fires only when
// the state flips — open on the first dialog, closed again only when the
// last one goes. The initial scan covers a dialog that is already open
// when the watcher starts (for example the mirror PIN gate). Pass a
// MutationObserver implementation only to test with; the real one is used
// otherwise, and with no observer at all the watcher still reports the
// initial scan and never crashes.
export function createDialogWatcher({
  root = typeof document !== 'undefined' ? document : null,
  onChange,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null,
} = {}) {
  let open = false;
  let observer = null;

  const refresh = () => {
    const next = countOpenDialogs(root) > 0;
    if (next === open) return;
    open = next;
    onChange(open);
  };

  if (root && root.body && MutationObserverImpl) {
    observer = new MutationObserverImpl(() => refresh());
    observer.observe(root.body, { childList: true, subtree: true });
  }
  refresh();

  return {
    refresh,
    dispose() {
      if (observer) observer.disconnect();
      observer = null;
    },
  };
}
