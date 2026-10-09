import { describe, expect, it } from 'vitest';
import { isPageVisible, watchPageVisibility } from './pageVisibility.js';

// A document stand-in: visibility state plus real events.
const fakeDocument = (visibilityState) => Object.assign(new EventTarget(), { visibilityState });

describe('page visibility', () => {
  it('counts only a hidden page as off screen', () => {
    expect(isPageVisible(fakeDocument('visible'))).toBe(true);
    expect(isPageVisible(fakeDocument('hidden'))).toBe(false);
  });

  it('notices a prerendered page being shown', () => {
    const doc = fakeDocument('hidden');
    const seen = [];
    watchPageVisibility(doc, (visible) => seen.push(visible));
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('prerenderingchange'));
    expect(seen).toEqual([true]);
  });

  it('follows ordinary tab switches', () => {
    const doc = fakeDocument('visible');
    const seen = [];
    watchPageVisibility(doc, (visible) => seen.push(visible));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual([false, true]);
  });

  it('stops listening when unsubscribed', () => {
    const doc = fakeDocument('hidden');
    const seen = [];
    const stop = watchPageVisibility(doc, (visible) => seen.push(visible));
    stop();
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('prerenderingchange'));
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual([]);
  });
});
