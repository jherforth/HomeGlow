import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  measureContainerWidth,
  gridColsForWidth,
  createContainerWidthWatcher,
} from './containerWidth.js';

function fakeElement({ clientWidth, paddingLeft = '16px', paddingRight = '16px' } = {}) {
  return { clientWidth, __paddingLeft: paddingLeft, __paddingRight: paddingRight };
}

describe('measureContainerWidth', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      getComputedStyle: (el) => ({
        paddingLeft: el.__paddingLeft,
        paddingRight: el.__paddingRight,
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('subtracts horizontal padding from clientWidth', () => {
    expect(measureContainerWidth(fakeElement({ clientWidth: 1440 }))).toBe(1408);
    expect(measureContainerWidth(fakeElement({ clientWidth: 1280 }))).toBe(1248);
  });

  it('floors at 0 and returns null without an element', () => {
    expect(measureContainerWidth(fakeElement({ clientWidth: 10 }))).toBe(0);
    expect(measureContainerWidth(null)).toBe(null);
    expect(measureContainerWidth(undefined)).toBe(null);
  });
});

describe('gridColsForWidth', () => {
  it('uses 4 / 8 / 12 columns at the 600 / 960 breakpoints', () => {
    expect(gridColsForWidth(0)).toBe(4);
    expect(gridColsForWidth(599)).toBe(4);
    expect(gridColsForWidth(600)).toBe(8);
    expect(gridColsForWidth(959)).toBe(8);
    expect(gridColsForWidth(960)).toBe(12);
    expect(gridColsForWidth(1408)).toBe(12);
  });
});

describe('createContainerWidthWatcher', () => {
  let element;
  let observerInstances;
  let resizeListeners;

  beforeEach(() => {
    element = fakeElement({ clientWidth: 1280 });
    observerInstances = [];
    resizeListeners = [];
    vi.stubGlobal('window', {
      getComputedStyle: (el) => ({
        paddingLeft: el.__paddingLeft,
        paddingRight: el.__paddingRight,
      }),
      addEventListener: (type, fn) => { resizeListeners.push([type, fn]); },
      removeEventListener: (type, fn) => {
        resizeListeners = resizeListeners.filter(([t, f]) => !(t === type && f === fn));
      },
    });
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb) { this.cb = cb; observerInstances.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the initial width immediately', () => {
    const onChange = vi.fn();
    const watcher = createContainerWidthWatcher({ element, onChange });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1248);
    watcher.disconnect();
  });

  it('reports a width change from the observer once, and ignores repeats at the same width', () => {
    const onChange = vi.fn();
    const watcher = createContainerWidthWatcher({ element, onChange });
    expect(observerInstances).toHaveLength(1);

    // Mirror viewport arrives: canvas widens 1280 -> 1440.
    element.clientWidth = 1440;
    observerInstances[0].cb();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(1408);

    // Same width again: no further report, so no layout rebuild.
    observerInstances[0].cb();
    expect(onChange).toHaveBeenCalledTimes(2);
    watcher.disconnect();
  });

  it('falls back to the window resize listener without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const onChange = vi.fn();
    const watcher = createContainerWidthWatcher({ element, onChange });
    expect(onChange).toHaveBeenCalledTimes(1);

    element.clientWidth = 1440;
    const resize = resizeListeners.find(([type]) => type === 'resize')[1];
    resize();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(1408);
    watcher.disconnect();
  });

  it('disconnect stops the observer and the resize listener', () => {
    const onChange = vi.fn();
    const watcher = createContainerWidthWatcher({ element, onChange });
    watcher.disconnect();
    expect(observerInstances[0].disconnected).toBe(true);
    expect(resizeListeners).toHaveLength(0);
  });
});
