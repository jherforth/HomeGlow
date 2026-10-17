// Push notifications: the routes (services/notifications.js does the work).
//
// A device turns notifications on from its own browser, under its own name,
// so these sit with the device's other settings. Like the rest of Admin they
// are behind the admin PIN on the client.

function registerNotificationRoutes(fastify, { notifier, ensureDevice = () => {}, demoBlocked = () => false }) {
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
}

module.exports = { registerNotificationRoutes };
