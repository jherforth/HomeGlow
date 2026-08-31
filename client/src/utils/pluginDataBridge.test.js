import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import {
  PLUGIN_DATA_MESSAGE_TYPE,
  PLUGIN_DATA_CHANGED_EVENT,
  isKnownPluginDataScope,
  readPluginDataMessage,
  acceptPluginDataMessage,
  emitPluginDataChanged,
  subscribePluginDataChanged,
} from './pluginDataBridge.js';

describe('readPluginDataMessage', () => {
  it('reads the scope from a well-formed message', () => {
    expect(readPluginDataMessage({ type: PLUGIN_DATA_MESSAGE_TYPE, scope: 'chores' })).toBe('chores');
  });

  it('rejects anything that is not a data-changed message', () => {
    // Plugin iframes also receive homeglow:event traffic, and a page can carry
    // postMessage chatter from other sources entirely; none of it should be
    // mistaken for a refresh request.
    expect(readPluginDataMessage({ type: 'homeglow:event', event: 'chore.completed' })).toBeNull();
    expect(readPluginDataMessage({ scope: 'chores' })).toBeNull();
    expect(readPluginDataMessage(null)).toBeNull();
    expect(readPluginDataMessage('chores')).toBeNull();
    expect(readPluginDataMessage(undefined)).toBeNull();
  });

  it('rejects an unknown scope rather than passing it through', () => {
    // A typo in a plugin must be inert, not wake every refetch in the app.
    expect(readPluginDataMessage({ type: PLUGIN_DATA_MESSAGE_TYPE, scope: 'chore' })).toBeNull();
    expect(readPluginDataMessage({ type: PLUGIN_DATA_MESSAGE_TYPE, scope: '*' })).toBeNull();
    expect(readPluginDataMessage({ type: PLUGIN_DATA_MESSAGE_TYPE })).toBeNull();
  });

  it('knows the closed scope set', () => {
    expect(isKnownPluginDataScope('chores')).toBe(true);
    expect(isKnownPluginDataScope('everything')).toBe(false);
  });
});

describe('acceptPluginDataMessage', () => {
  const frame = { name: 'the plugin iframe' };
  const other = { name: 'some other frame' };
  const ORIGIN = 'http://homeglow.local:5001';
  const good = { source: frame, origin: ORIGIN, data: { type: PLUGIN_DATA_MESSAGE_TYPE, scope: 'chores' } };

  it('accepts a message from the expected frame and origin', () => {
    expect(acceptPluginDataMessage(good, frame, ORIGIN)).toBe('chores');
  });

  it('rejects a message from a different frame', () => {
    // The decisive check: any page can postMessage to the app, and an ad
    // frame or a second plugin must not be able to drive someone else's
    // refresh.
    expect(acceptPluginDataMessage({ ...good, source: other }, frame, ORIGIN)).toBeNull();
  });

  it('rejects a message from a different origin', () => {
    expect(acceptPluginDataMessage({ ...good, origin: 'https://evil.example' }, frame, ORIGIN)).toBeNull();
  });

  it('rejects when there is no iframe to compare against', () => {
    // contentWindow is null before the iframe mounts and after it unmounts;
    // undefined must never compare equal to an undefined event.source.
    expect(acceptPluginDataMessage(good, null, ORIGIN)).toBeNull();
    expect(acceptPluginDataMessage({ ...good, source: undefined }, undefined, ORIGIN)).toBeNull();
  });

  it('rejects a valid frame carrying an unusable payload', () => {
    expect(acceptPluginDataMessage({ ...good, data: { type: 'homeglow:event' } }, frame, ORIGIN)).toBeNull();
    expect(acceptPluginDataMessage({ ...good, data: null }, frame, ORIGIN)).toBeNull();
  });
});

describe('emit / subscribe', () => {
  // The suite runs in vitest's 'node' environment and jsdom is not a
  // dependency. The bridge only needs addEventListener/removeEventListener/
  // dispatchEvent, so Node's own EventTarget stands in for window rather than
  // pulling in a DOM implementation for four assertions.
  beforeAll(() => { globalThis.window = new EventTarget(); });
  afterAll(() => { delete globalThis.window; });

  const cleanups = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()();
  });

  function listen(scope) {
    const handler = vi.fn();
    cleanups.push(subscribePluginDataChanged(scope, handler));
    return handler;
  }

  it('delivers to subscribers of the same scope', () => {
    const handler = listen('chores');
    emitPluginDataChanged('chores', { filename: 'Routines.html' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ scope: 'chores', filename: 'Routines.html' });
  });

  it('does not deliver across scopes', () => {
    const chores = listen('chores');
    const calendar = listen('calendar');

    emitPluginDataChanged('calendar');

    expect(chores).not.toHaveBeenCalled();
    expect(calendar).toHaveBeenCalledTimes(1);
  });

  it('refuses to emit an unknown scope', () => {
    const handler = vi.fn();
    window.addEventListener(PLUGIN_DATA_CHANGED_EVENT, handler);

    expect(emitPluginDataChanged('nonsense')).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    window.removeEventListener(PLUGIN_DATA_CHANGED_EVENT, handler);
  });

  it('stops delivering once unsubscribed', () => {
    const handler = vi.fn();
    const stop = subscribePluginDataChanged('chores', handler);
    stop();

    emitPluginDataChanged('chores');
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports several subscribers on one scope', () => {
    const first = listen('chores');
    const second = listen('chores');

    emitPluginDataChanged('chores');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
