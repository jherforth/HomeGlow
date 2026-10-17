// ntfy: the connection (System → Connections) and the household's topics
// (Family → Notifications). services/ntfy.js does the work.
//
// Saving the connection and sending are demo-blocked, as #286's sends are:
// they make the server publish to an address a visitor typed. The topic list
// itself only edits the (resetting) demo database.

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

  fastify.get('/api/connections/ntfy/status', guarded(async () => ntfy.connection()));

  fastify.put('/api/connections/ntfy', guarded(async (request, res) => {
    if (demoBlocked(res)) return undefined;
    return reply(res, ntfy.saveConnection(request.body || {}));
  }));

  fastify.post('/api/connections/ntfy/test', guarded(async (request, res) => {
    if (demoBlocked(res)) return undefined;
    return reply(res, await ntfy.testConnection());
  }));

  fastify.get('/api/ntfy-topics', guarded(async () => ({ topics: ntfy.list(), enabled: ntfy.enabled() })));

  fastify.post('/api/ntfy-topics', guarded(async (request, res) => reply(res, ntfy.create(request.body || {}))));

  fastify.patch('/api/ntfy-topics/:id', guarded(async (request, res) => reply(res, ntfy.update(request.params.id, request.body || {}))));

  fastify.delete('/api/ntfy-topics/:id', guarded(async (request, res) => reply(res, ntfy.remove(request.params.id))));

  fastify.post('/api/ntfy-topics/:id/test', guarded(async (request, res) => {
    if (demoBlocked(res)) return undefined;
    return reply(res, await ntfy.sendTest(request.params.id));
  }));
}

module.exports = { registerNtfyRoutes };
