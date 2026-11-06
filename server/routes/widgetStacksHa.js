// Stacks and Home Assistant: the routes (services/widgetStacksHa.js).
//
//   GET /api/devices/:deviceName/stacks/ha            the states this
//                                                     display's Stacks read
//   GET /api/devices/:deviceName/stacks/ha/entities   entities for Admin's
//                                                     "Bring to front when…"
//
// A display only reads the entities its own Stacks name.

const rules = require('../services/widgetStacksHa');
const { listEntities, readStates } = require('../services/haEntities');

function registerWidgetStacksHaRoutes(fastify, { db, live, ha, demoMode, readDevice }) {
  fastify.get('/api/devices/:deviceName/stacks/ha', async (request) => {
    const settings = readDevice(request.params.deviceName) || {};
    return readStates({ db, live, ha, demoMode }, rules.entityRefs(settings.widgetStacks));
  });

  fastify.get('/api/devices/:deviceName/stacks/ha/entities', async (request, reply) => {
    if (demoMode) return reply.status(403).send({ error: 'Not available in demo mode.' });
    if (!ha.isConfigured(db)) return reply.status(409).send({ error: 'Home Assistant is not connected.' });
    try {
      return { entities: listEntities(await ha.homeAssistantFetch(db, 'GET', '/api/states')) };
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 502;
      return reply.status(status).send({ error: error?.message || 'Could not list Home Assistant entities.' });
    }
  });
}

module.exports = { registerWidgetStacksHaRoutes };
