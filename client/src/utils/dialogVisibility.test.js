import { describe, expect, it, vi } from 'vitest';
import { countOpenDialogs, createDialogWatcher, OPEN_DIALOG_SELECTOR } from './dialogVisibility.js';

// A document-like root whose dialog count the test controls.
const fakeRoot = (count) => ({
  body: {},
  querySelectorAll: (selector) => {
    expect(selector).toBe(OPEN_DIALOG_SELECTOR);
    return Array.from({ length: count }, () => ({}));
  },
});

describe('countOpenDialogs', () => {
  it('counts the dialogs the selector finds', () => {
    expect(countOpenDialogs(fakeRoot(0))).toBe(0);
    expect(countOpenDialogs(fakeRoot(1))).toBe(1);
    expect(countOpenDialogs(fakeRoot(3))).toBe(3);
  });

  it('counts none open without a searchable root', () => {
    expect(countOpenDialogs(null)).toBe(0);
    expect(countOpenDialogs(undefined)).toBe(0);
    expect(countOpenDialogs({})).toBe(0);
  });
});

describe('createDialogWatcher', () => {
  // A MutationObserver stand-in the test drives by hand: the watcher gets
  // the callback, the test fires it after changing the fake root's count.
  const fakeObserverClass = () => {
    const instances = [];
    return {
      instances,
      Impl: class {
        constructor(callback) {
          this.callback = callback;
          this.observed = null;
          this.disconnected = false;
          instances.push(this);
        }

        observe(target, options) {
          this.observed = { target, options };
        }

        disconnect() {
          this.disconnected = true;
        }
      },
    };
  };

  it('fires only when the open state flips, so stacked dialogs keep the dock hidden', () => {
    const changes = [];
    let count = 0;
    const root = {
      body: {},
      querySelectorAll: () => Array.from({ length: count }, () => ({})),
    };
    const { instances, Impl } = fakeObserverClass();
    const watcher = createDialogWatcher({ root, onChange: (open) => changes.push(open), MutationObserverImpl: Impl });

    expect(changes).toEqual([]);
    expect(instances).toHaveLength(1);
    expect(instances[0].observed.options).toEqual({ childList: true, subtree: true });

    count = 1;
    instances[0].callback();
    expect(changes).toEqual([true]);

    count = 2;
    instances[0].callback();
    expect(changes).toEqual([true]);

    count = 1;
    instances[0].callback();
    expect(changes).toEqual([true]);

    count = 0;
    instances[0].callback();
    expect(changes).toEqual([true, false]);

    watcher.dispose();
    expect(instances[0].disconnected).toBe(true);
  });

  it('reports a dialog that is already open on start', () => {
    const changes = [];
    const { Impl } = fakeObserverClass();
    createDialogWatcher({ root: fakeRoot(1), onChange: (open) => changes.push(open), MutationObserverImpl: Impl });
    expect(changes).toEqual([true]);
  });

  it('still reports the initial scan with no observer available', () => {
    const changes = [];
    const watcher = createDialogWatcher({ root: fakeRoot(1), onChange: (open) => changes.push(open), MutationObserverImpl: null });
    expect(changes).toEqual([true]);
    expect(() => watcher.dispose()).not.toThrow();
    expect(() => watcher.refresh()).not.toThrow();
  });
});
