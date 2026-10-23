// ntfy: the connection and the household's topics, in Admin → System →
// Notifications. services/ntfy.js does the work.
//
// Saving the connection and sending are demo-blocked, as browser push's sends
// are: they make the server publish to an address a visitor typed, and the
// connection holds a credential. The topic list itself only edits the
// (resetting) demo database.

function registerNtfyRoutes(fastify, { ntfy, demoBlocked = () => false }) {
  const reply = (res, result) => (result.error
    ? res.status(result.status).send({ error: result.error })
    : result.body);
  const guarded = (handler) => async (request, res) => {
    try {
      return await handler(request, res);
    } catch (error) {
      console.error('ntfy:', error);
      return res.status(500).send({ error: 'Something went wrong with ntfy.' });
    }
  };

  fastify.get('/api/notifications/ntfy', guarded(async () => ntfy.connection()));

  fastify.put('/api/notifications/ntfy', guarded(async (request, res) => {
    if (demoBlocked(res)) return undefined;
    return reply(res, ntfy.saveConnection(request.body || {}));
  }));

  fastify.post('/api/notifications/ntfy/test', guarded(async (request, res) => {
    if (demoBlocked(res)) return undefined;
    return reply(res, await ntfy.testConnection());
  }));

  fastify.get('/api/notifications/ntfy/topics', guarded(async () => ({ topics: ntfy.list(), enabled: ntfy.enabled() })));

  fastify.post('/api/notifications/ntfy/topics', guarded(async (request, res) => reply(res, ntfy.create(request.body || {}))));

  fastify.patch('/api/notifications/ntfy/topics/:id', guarded(async (request, res) => reply(res, ntfy.update(request.params.id, request.body || {}))));

  fastify.delete('/api/notifications/ntfy/topics/:id', guarded(async (request, res) => reply(res, ntfy.remove(request.params.id))));

  fastify.post('/api/notifications/ntfy/topics/:id/test', guarded(async (request, res) => {
    if (demoBlocked(res)) return undefined;
    return reply(res, await ntfy.sendTest(request.params.id));
  }));
}

module.exports = { registerNtfyRoutes };
