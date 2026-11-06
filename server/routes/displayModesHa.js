// Display modes and Home Assistant: the routes (services/displayModesHa.js).
//
//   GET  /api/devices/:deviceName/modes/ha            the states this display's
//                                                     modes read, and the link
//   GET  /api/devices/:deviceName/modes/ha/entities   entities for Admin's
//                                                     pickers (?kind=helper|
//                                                     alarm|people|any)
//   POST /api/devices/:deviceName/modes/ha/helper     make the mode helper
//                                                     ({ title }), or use one
//                                                     ({ entity_id }), or none;
//                                                     needs the admin PIN ({ pin })
//   POST /api/devices/:deviceName/modes/ha/sync       its options = the modes
//   POST /api/devices/:deviceName/modes/ha/select     choose a helper option
//   POST /api/devices/:deviceName/modes/ha/report     post the showing mode
//
// A display only ever reads what its own modes name, and only ever writes its
// own helper and its own current-mode sensor.

const rules = require('../services/displayModesHa');
const { readStates } = require('../services/haEntities');
const { checkAdminPin, refusePin } = require('../utils/adminPin');

function registerDisplayModesHaRoutes(fastify, {
  db, live, ha, demoMode, readDevice, writeDevice, refreshWatched,
}) {
  const unavailable = (reply) => {
    if (demoMode) {
      reply.status(403).send({ error: 'Not available in demo mode.' });
      return true;
    }
    if (!ha.isConfigured(db)) {
      reply.status(409).send({ error: 'Home Assistant is not connected. Connect it under System → Connections.' });
      return true;
    }
    return false;
  };

  const modesOf = (deviceName) => {
    const settings = readDevice(deviceName);
    return settings && typeof settings.displayModes === 'object' && settings.displayModes ? settings.displayModes : {};
  };

  const saveHa = (deviceName, patch) => {
    const settings = readDevice(deviceName) || {};
    const displayModes = { ...(settings.displayModes || {}) };
    displayModes.ha = { ...(displayModes.ha || {}), ...patch };
    const saved = writeDevice(deviceName, { displayModes });
    refreshWatched();
    return saved;
  };

  const failure = (reply, error, what) => {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 502;
    console.error(`Display modes: ${what}:`, error?.message || error);
    return reply.status(status).send({ error: error?.message || `Could not ${what}.` });
  };

  fastify.get('/api/devices/:deviceName/modes/ha', async (request) => {
    return readStates({ db, live, ha, demoMode }, rules.entityRefs(modesOf(request.params.deviceName)));
  });

  fastify.get('/api/devices/:deviceName/modes/ha/entities', async (request, reply) => {
    if (unavailable(reply)) return undefined;
    try {
      const states = await ha.homeAssistantFetch(db, 'GET', '/api/states');
      return { entities: rules.listEntities(states, String(request.query?.kind || 'any')) };
    } catch (error) {
      return failure(reply, error, 'list Home Assistant entities');
    }
  });

  // Make the helper ({ title }), use an existing one ({ entity_id }), or stop
  // using one ({ entity_id: null }). A helper HomeGlow made can be kept in
  // step with the modes by id; one made elsewhere by set_options. The helper
  // is what /sync and /select write to, and set_options replaces the options
  // of whatever dropdown is named, so choosing one needs the admin PIN (asked
  // for even on a display that remembers it, as backups are).
  fastify.post('/api/devices/:deviceName/modes/ha/helper', async (request, reply) => {
    if (unavailable(reply)) return undefined;
    const { deviceName } = request.params;
    const body = request.body || {};
    if (!readDevice(deviceName)) return reply.status(404).send({ error: 'Device not found' });
    const pinCheck = await checkAdminPin(db, typeof body.pin === 'string' ? body.pin : undefined);
    if (!pinCheck.ok) return refusePin(reply, pinCheck, 'The admin PIN is needed to choose the mode helper.');
    try {
      if (body.entity_id === null) {
        return { settings: saveHa(deviceName, { helper: null, helperId: null, title: null }) };
      }
      const options = rules.helperOptions(modesOf(deviceName));
      if (typeof body.entity_id === 'string') {
        if (!rules.isEntityId(body.entity_id) || !body.entity_id.startsWith('input_select.')) {
          return reply.status(400).send({ error: 'Choose a dropdown helper (input_select).' });
        }
        const state = await ha.homeAssistantFetch(db, 'GET', `/api/states/${encodeURIComponent(body.entity_id)}`);
        await live.callService('input_select', 'set_options', { entity_id: body.entity_id, options });
        return {
          settings: saveHa(deviceName, {
            helper: body.entity_id, helperId: null, title: state?.attributes?.friendly_name || null,
          }),
        };
      }
      const title = String(body.title || '').trim().slice(0, 60) || 'HomeGlow display mode';
      const result = await live.command({ type: 'input_select/create', name: title, options, icon: 'mdi:monitor-dashboard' });
      if (!result?.id) throw Object.assign(new Error('Home Assistant did not make the helper.'), { status: 502 });
      return { settings: saveHa(deviceName, { helper: `input_select.${result.id}`, helperId: result.id, title }) };
    } catch (error) {
      if (/unknown command|not supported|unauthorized|admin/i.test(error?.message || '')) {
        error.message = 'Home Assistant wouldn\'t let HomeGlow make a helper. The access token needs to belong to an administrator, or make a Dropdown helper in Home Assistant and choose it here.';
      }
      return failure(reply, error, 'set up the mode helper');
    }
  });

  fastify.post('/api/devices/:deviceName/modes/ha/sync', async (request, reply) => {
    if (unavailable(reply)) return undefined;
    const displayModes = modesOf(request.params.deviceName);
    const settings = rules.haSettings(displayModes);
    if (!settings.helper) return { synced: false };
    const options = rules.helperOptions(displayModes);
    try {
      if (settings.helperId) {
        await live.command({ type: 'input_select/update', input_select_id: settings.helperId, options });
      } else {
        await live.callService('input_select', 'set_options', { entity_id: settings.helper, options });
      }
      return { synced: true, options };
    } catch (error) {
      return failure(reply, error, 'update the mode helper');
    }
  });

  fastify.post('/api/devices/:deviceName/modes/ha/select', async (request, reply) => {
    if (unavailable(reply)) return undefined;
    const displayModes = modesOf(request.params.deviceName);
    const settings = rules.haSettings(displayModes);
    const option = String(request.body?.option || '');
    if (!settings.helper) return reply.status(409).send({ error: 'This display has no mode helper.' });
    if (!rules.helperOptions(displayModes).includes(option)) return reply.status(400).send({ error: 'Not one of the helper\'s options.' });
    try {
      await live.callService('input_select', 'select_option', { entity_id: settings.helper, option });
      return { selected: option };
    } catch (error) {
      return failure(reply, error, 'set the mode helper');
    }
  });

  fastify.post('/api/devices/:deviceName/modes/ha/report', async (request, reply) => {
    if (unavailable(reply)) return undefined;
    const displayModes = modesOf(request.params.deviceName);
    const settings = rules.haSettings(displayModes);
    const sensor = rules.sensorIdFor(settings);
    if (!sensor || !settings.report) return { reported: false };
    const body = request.body || {};
    const mode = String(body.mode || rules.HELPER_NORMAL).slice(0, 60);
    const source = ['schedule', 'alarm', 'entity', 'home_assistant', 'wall', 'none'].includes(body.source) ? body.source : 'none';
    try {
      await ha.homeAssistantFetch(db, 'POST', `/api/states/${sensor}`, {
        state: mode,
        attributes: {
          friendly_name: `${settings.title || 'HomeGlow display'} showing`.replace(/ mode showing$/i, ' showing'),
          icon: 'mdi:monitor-dashboard',
          source,
          pinned: body.pinned === true,
          options: rules.helperOptions(displayModes).slice(1),
        },
      });
      return { reported: true, sensor };
    } catch (error) {
      return failure(reply, error, 'tell Home Assistant the mode');
    }
  });
}

module.exports = { registerDisplayModesHaRoutes };
