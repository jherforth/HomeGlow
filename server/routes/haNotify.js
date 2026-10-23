// The Home Assistant Companion app's phones, in Admin → System → Notifications.
// services/haNotify.js does the work.
//
// Turning a phone on only edits the database; the phones themselves come
// from the household's own Home Assistant. A test send is demo-blocked, as
// every send is.

function registerHaNotifyRoutes(fastify, { haNotify, demoBlocked = () => false }) {
  const reply = (res, result) => (result.error
    ? res.status(result.status).send({ error: result.error })
    : result.body);
  const guarded = (handler) => async (request, res) => {
    try {
      return await handler(request, res);
    } catch (error) {
      console.error('Home Assistant notifications:', error);
      return res.status(500).send({ error: 'Something went wrong with Home Assistant notifications.' });
    }
  };

  // ?fresh=1 asks Home Assistant again rather than using the last minute's list.
  fastify.get('/api/notifications/ha/phones', guarded(async (request) => haNotify.list({ fresh: request.query?.fresh === '1' })));

  fastify.put('/api/notifications/ha/phones/:phoneId', guarded(async (request, res) => reply(res, await haNotify.save(request.params.phoneId, request.body || {}))));

  fastify.delete('/api/notifications/ha/phones/:phoneId', guarded(async (request, res) => reply(res, haNotify.remove(request.params.phoneId))));

  fastify.post('/api/notifications/ha/phones/:phoneId/test', guarded(async (request, res) => {
    if (demoBlocked(res)) return undefined;
    return reply(res, await haNotify.sendTest(request.params.phoneId));
  }));
}

module.exports = { registerHaNotifyRoutes };
