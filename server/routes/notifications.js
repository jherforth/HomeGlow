// Push notifications: the routes (services/notifications.js does the work).
//
// A device turns notifications on from its own browser, under its own name,
// so these sit with the device's other settings. Like the rest of Admin they
// are behind the admin PIN on the client.
//
// Admin → System → Notifications also lists every device with them on, and
// keeps the settings every way of delivering shares (the address a tap opens).
//
// A plugin that declares "notify": true sends through the plugin contract:
//   POST /api/plugin/v1/notify/:pluginId   { title?, message, tag?, about?, urgent? } -> { sent }

const notifications = require('../services/notifications');

function registerNotificationRoutes(fastify, {
  notifier, db, ensureDevice = () => {}, demoBlocked = () => false, pluginManifest = () => null,
}) {
  const reply = (res, result) => (result.error
    ? res.status(result.status).send({ error: result.error })
    : result.body);

  // The server's public key, which a browser needs to subscribe.
  fastify.get('/api/notifications/key', async (request, res) => {
    try {
      return { publicKey: notifier.publicKey() };
    } catch (error) {
      console.error('Error reading the push key:', error);
      return res.status(500).send({ error: 'Push notifications are not available on this server' });
    }
  });

  // What every way of delivering shares: the address a tap opens, and the
  // plugins a recipient may choose to hear from.
  fastify.get('/api/notifications/settings', async () => ({
    openUrl: notifications.openUrlFrom(db),
    plugins: notifier.plugins(),
  }));

  fastify.put('/api/notifications/settings', async (request, res) => {
    const openUrl = notifications.parseOpenUrl(request.body?.openUrl);
    if (openUrl.error) return res.status(400).send({ error: openUrl.error });
    if (openUrl.value) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(notifications.OPEN_URL_SETTING, openUrl.value);
    } else {
      db.prepare('DELETE FROM settings WHERE key = ?').run(notifications.OPEN_URL_SETTING);
    }
    return { openUrl: openUrl.value, plugins: notifier.plugins() };
  });

  // Every device with browser push on.
  fastify.get('/api/notifications/devices', async () => ({ devices: notifier.listDevices() }));

  fastify.get('/api/devices/:deviceName/notifications', async (request) => notifier.get(request.params.deviceName));

  // The public demo resets itself and has no family to hear about.
  fastify.put('/api/devices/:deviceName/notifications', async (request, res) => {
    if (demoBlocked(res)) return undefined;
    try {
      // A phone that has only ever looked may have no device record yet;
      // turning notifications on makes one, as saving any device setting does.
      if (request.body?.subscription) ensureDevice(request.params.deviceName);
      return reply(res, notifier.save(request.params.deviceName, request.body || {}));
    } catch (error) {
      console.error('Error saving device notifications:', error);
      return res.status(500).send({ error: 'Failed to save notifications' });
    }
  });

  fastify.delete('/api/devices/:deviceName/notifications', async (request, res) => reply(res, notifier.remove(request.params.deviceName)));

  fastify.post('/api/devices/:deviceName/notifications/test', async (request, res) => {
    if (demoBlocked(res)) return undefined;
    try {
      return reply(res, await notifier.sendTest(request.params.deviceName));
    } catch (error) {
      console.error('Error sending a test notification:', error);
      return res.status(500).send({ error: 'Failed to send a test notification' });
    }
  });

  fastify.post('/api/plugin/v1/notify/:pluginId', async (request, res) => {
    const { pluginId } = request.params;
    const manifest = pluginManifest(pluginId);
    if (!manifest) return res.status(403).send({ error: `Unknown plugin id "${pluginId}".` });
    if (manifest.notify !== true) return res.status(403).send({ error: `Plugin "${pluginId}" does not declare notify in its manifest.` });
    if (demoBlocked(res)) return undefined;
    try {
      const { title, message, tag, about, urgent } = request.body || {};
      return reply(res, await notifier.sendFromPlugin({ pluginId, pluginName: manifest.name, title, message, tag, about, urgent }));
    } catch (error) {
      console.error('Error sending a plugin notification:', error);
      return res.status(500).send({ error: 'Failed to send the notification' });
    }
  });
}

module.exports = { registerNotificationRoutes };
