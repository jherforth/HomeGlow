// HomeGlow's service worker: push notifications only.
//
// The server sends each message as JSON, { title, body, tag, url }
// (server/services/notifications.js). This shows it, and a tap brings
// HomeGlow forward at `url`. Nothing is cached here: pages always come from
// the server, so an update is never held back by an old copy.
//
// Plain script, no build step: it is served as-is from /sw.js.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// An address inside HomeGlow, or its start page: a message can never send a
// tap somewhere else.
function homeGlowUrl(url) {
  try {
    const target = new URL(url || '/', self.location.origin);
    return target.origin === self.location.origin ? target.href : `${self.location.origin}/`;
  } catch {
    return `${self.location.origin}/`;
  }
}

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof message.title === 'string' && message.title ? message.title : 'HomeGlow';
  const options = {
    body: typeof message.body === 'string' ? message.body : '',
    icon: '/icons/icon-192.png',
    data: { url: homeGlowUrl(message.url) },
  };
  // A message with a tag replaces the last one with that tag, and still
  // alerts: "Ava finished 2 chores" after "Ava finished Feed the cat".
  if (typeof message.tag === 'string' && message.tag) {
    options.tag = message.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = homeGlowUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(self.location.origin));
    if (open) {
      // Already showing HomeGlow: bring it forward, and move it only when the
      // message names somewhere other than the start page.
      const focused = await open.focus();
      if (url !== `${self.location.origin}/` && focused && 'navigate' in focused) {
        try { await focused.navigate(url); } catch { /* not ours to steer; it is in front */ }
      }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
