// public/sw.js, run in a stand-in for a service worker's global scope: what a
// push message shows, and where a tap goes.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SOURCE = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8');
const ORIGIN = 'https://hg.example.com';

function worker({ windows = [] } = {}) {
  const listeners = {};
  const scope = {
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  scope.self = scope;
  vm.runInNewContext(SOURCE, { ...scope, URL, console });
  const fire = async (type, event) => {
    let pending = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p) => { pending = p; } });
    await pending;
  };
  return { scope, fire };
}

const pushOf = (message) => ({ data: { json: () => message, text: () => JSON.stringify(message) } });
const tapOf = (url) => ({ notification: { close: vi.fn(), data: { url } } });

describe('sw.js', () => {
  it('shows a message, replacing an earlier one with its tag', async () => {
    const { scope, fire } = worker();
    await fire('push', pushOf({ title: 'Ava finished 2 chores', body: 'Feed the cat · Make the bed', tag: 't1', url: '/' }));
    expect(scope.registration.showNotification).toHaveBeenCalledWith('Ava finished 2 chores', {
      body: 'Feed the cat · Make the bed',
      icon: '/icons/icon-192.png',
      data: { url: `${ORIGIN}/` },
      tag: 't1',
      renotify: true,
    });
  });

  it('shows something sensible for an empty or unreadable message', async () => {
    const { scope, fire } = worker();
    await fire('push', { data: { json: () => { throw new Error('not json'); }, text: () => 'hello' } });
    expect(scope.registration.showNotification).toHaveBeenCalledWith('HomeGlow', expect.objectContaining({ body: 'hello' }));
    await fire('push', { data: null });
    expect(scope.registration.showNotification).toHaveBeenLastCalledWith('HomeGlow', expect.objectContaining({ body: '' }));
  });

  it('never points a tap outside HomeGlow', async () => {
    const { scope, fire } = worker();
    await fire('push', pushOf({ title: 'x', url: 'https://evil.example.com/' }));
    expect(scope.registration.showNotification.mock.calls[0][1].data.url).toBe(`${ORIGIN}/`);
  });

  it('a tap opens HomeGlow when it is not open', async () => {
    const { scope, fire } = worker();
    const tap = tapOf(`${ORIGIN}/`);
    await fire('notificationclick', tap);
    expect(tap.notification.close).toHaveBeenCalled();
    expect(scope.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it('a tap brings an open HomeGlow forward, and leaves it where it is for the start page', async () => {
    const navigate = vi.fn();
    const open = { url: `${ORIGIN}/#/admin`, focus: vi.fn(async () => ({ navigate })) };
    const { scope, fire } = worker({ windows: [open] });
    await fire('notificationclick', tapOf(`${ORIGIN}/`));
    expect(open.focus).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(scope.clients.openWindow).not.toHaveBeenCalled();

    await fire('notificationclick', tapOf(`${ORIGIN}/#/admin/chores/history`));
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/#/admin/chores/history`);
  });
});
