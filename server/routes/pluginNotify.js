// Phone notifications from plugins.
//
// A plugin whose manifest says `"notify": true` may list the household's
// phones and send them a short message:
//
//   GET  /api/plugin/v1/notify/:pluginId/phones   -> { phones: [{ id, name, platform, via }], errors? }
//   POST /api/plugin/v1/notify/:pluginId          { phones, title, message, urgent, tag, device }
//   POST /api/plugin/v1/notify/:pluginId/clear    { phones, tag, device }
//
// A phone is reached one of two ways, whichever the household has set up:
// Home Assistant's Companion app (each notify.mobile_app_* action; the rules
// are in services/haPanels.js), or Pushover (services/pushover.js), set up in
// Admin → System → Connections. Text only, never notify data of the plugin's
// own: a title, a message, an "urgent" flag and a label (tag). Urgent rings
// through silent where the phone allows it. Every send is logged with the
// Home Assistant actions ("What panels did" in Admin).

const rules = require('../services/haPanels');

const MAX_PHONES = 8;
const MAX_TITLE = 60;
const MAX_MESSAGE = 300;
const NOTE_TAG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PHONES_TTL_MS = 60000;
const RATE_WINDOW_MS = 1000;
const RATE_LIMIT = 10;
const NOTIFY_WINDOW_MS = 60000;
const NOTIFY_LIMIT = 30;
const HISTORY_KEEP = 1000;

const parseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

class NoteError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** The message as given, checked: -> { title, message, urgent, tag }, or NoteError. */
function checkNote({ title, message, urgent, tag }, clear) {
  if (tag !== undefined && (typeof tag !== 'string' || !NOTE_TAG.test(tag))) throw new NoteError('tag must be up to 40 lowercase letters, numbers and dashes.');
  if (clear) {
    if (tag === undefined) throw new NoteError('Name the tag to clear.');
    return { tag };
  }
  if (typeof message !== 'string' || !message.trim()) throw new NoteError('A notification needs a message.');
  if (urgent !== undefined && typeof urgent !== 'boolean') throw new NoteError('urgent must be true or false.');
  if (title !== undefined && typeof title !== 'string') throw new NoteError('title must be text.');
  return { title: title === undefined ? undefined : title.slice(0, MAX_TITLE * 2), message: message.slice(0, MAX_MESSAGE * 2), urgent: urgent === true, tag };
}

/** The phones a request names, each one of the household's. */
function pickPhones(ids, phones) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_PHONES || ids.some((id) => typeof id !== 'string')) {
    throw new NoteError(`Name 1 to ${MAX_PHONES} phones.`);
  }
  return [...new Set(ids)].map((id) => {
    const phone = phones.find((p) => p.id === id);
    if (!phone) throw new NoteError(`There is no phone ${String(id).slice(0, 80)}.`, 404);
    return phone;
  });
}

function registerPluginNotifyRoutes(fastify, { db, ha, live, pushover, demoMode }) {
  /** May this plugin notify? Its manifest must say so. */
  const mayNotify = (pluginId) => {
    const row = db.prepare('SELECT manifest_json FROM plugins WHERE plugin_id = ?').get(pluginId);
    if (!row) return null;
    const manifest = parseJson(row.manifest_json || 'null', null);
    return manifest?.notify === true;
  };

  const haReady = () => !demoMode && ha.isConfigured(db);
  const pushoverReady = () => !demoMode && pushover.isConfigured(db);

  // Home Assistant's phones, asked for at most every 60 seconds.
  let haCache = null;
  async function haPhones(fresh) {
    if (!haReady()) return [];
    if (!fresh && haCache && Date.now() - haCache.at < PHONES_TTL_MS) return haCache.phones;
    const services = await ha.homeAssistantFetch(db, 'GET', '/api/services');
    const [devices] = await live.commands([{ type: 'config/device_registry/list' }]).catch(() => [null]);
    const phones = rules.phonesFrom(services, devices);
    haCache = { phones, at: Date.now() };
    return phones;
  }

  /** Every phone either way reaches; a way that fails is reported, not fatal. */
  async function allPhones(fresh) {
    const errors = {};
    const [fromHa, fromPushover] = await Promise.all([
      haPhones(fresh).catch((error) => { errors.home_assistant = error.message; return []; }),
      pushoverReady() ? pushover.phones(db, { fresh }).catch((error) => { errors.pushover = error.message; return []; }) : [],
    ]);
    return { phones: [...fromHa, ...fromPushover], errors };
  }

  const rate = new Map();
  const over = (pluginId, windowMs, limit) => {
    const key = `${pluginId}:${windowMs}`;
    const now = Date.now();
    const recent = (rate.get(key) || []).filter((at) => now - at < windowMs);
    recent.push(now);
    rate.set(key, recent);
    return recent.length > limit;
  };

  const logSend = (entry) => {
    try {
      db.prepare('INSERT INTO ha_actions (plugin_id, device_name, entity_id, action, ok, error) VALUES (?, ?, ?, ?, ?, ?)')
        .run(entry.pluginId, typeof entry.device === 'string' ? entry.device.slice(0, 120) : null, entry.entity, entry.action, entry.ok ? 1 : 0, entry.error || null);
      db.prepare('DELETE FROM ha_actions WHERE id <= (SELECT MAX(id) FROM ha_actions) - ?').run(HISTORY_KEEP);
    } catch (error) {
      console.error('Could not record a notification:', error.message);
    }
  };

  /** The plugin may notify and some way is set up; otherwise the reply is sent and false comes back. */
  function guard(pluginId, reply) {
    const may = mayNotify(pluginId);
    if (may === null) {
      reply.status(404).send({ error: 'No such plugin.' });
      return false;
    }
    if (!may) {
      reply.status(403).send({ error: 'This plugin may not send notifications. Its manifest needs "notify": true.' });
      return false;
    }
    if (!haReady() && !pushoverReady()) {
      reply.status(503).send({
        error: demoMode ? 'Notifications are not available in the demo.' : 'No way to reach phones is set up. Connect Home Assistant or Pushover in Admin → System → Connections.',
        notConnected: true,
      });
      return false;
    }
    return true;
  }

  fastify.get('/api/plugin/v1/notify/:pluginId/phones', async (request, reply) => {
    if (!guard(request.params.pluginId, reply)) return undefined;
    const { phones, errors } = await allPhones(false);
    return { phones, ...(Object.keys(errors).length ? { errors } : {}) };
  });

  /**
   * Send (or, with clear, take back) a message on each phone named. Every
   * phone is tried; 200 when at least one got it, the first error when none did.
   */
  async function deliver(request, reply, clear) {
    const { pluginId } = request.params;
    if (!guard(pluginId, reply)) return undefined;
    const body = request.body || {};
    const device = body.device;
    if (over(pluginId, RATE_WINDOW_MS, RATE_LIMIT) || over(pluginId, NOTIFY_WINDOW_MS, NOTIFY_LIMIT)) {
      return reply.status(429).send({ error: 'Too many notifications at once; try again later.' });
    }
    let note;
    let targets;
    try {
      note = checkNote(body, clear);
      let { phones } = await allPhones(false);
      // A phone added since the list was read: read it again once.
      if (Array.isArray(body.phones) && body.phones.some((id) => !phones.some((p) => p.id === id))) ({ phones } = await allPhones(true));
      targets = pickPhones(body.phones, phones);
    } catch (error) {
      logSend({ pluginId, device, entity: Array.isArray(body.phones) ? body.phones.slice(0, 8).join(',').slice(0, 200) : 'notify', action: clear ? 'clear' : 'notify', ok: false, error: error.message });
      return reply.status(error.status && error.status < 600 ? error.status : 502).send({ error: error.message });
    }
    const action = clear ? 'clear' : (note.urgent ? 'notify (urgent)' : 'notify');
    const tag = note.tag ? `homeglow-${pluginId}-${note.tag}` : undefined;

    // Home Assistant: one call per phone. Pushover: one message for all of its phones.
    const jobs = targets.filter((p) => p.via === 'home_assistant').map((phone) => {
      let call;
      try {
        call = clear ? rules.clearCall({ phone, pluginId, tag: note.tag }) : rules.notifyCall({ phone, pluginId, ...note });
      } catch (error) {
        return Promise.resolve([{ id: phone.id, error }]);
      }
      return live.callService(call.domain, call.service, call.data).then(() => [{ id: phone.id }], (error) => [{ id: phone.id, error }]);
    });
    const viaPushover = targets.filter((p) => p.via === 'pushover');
    if (viaPushover.length) {
      const ids = viaPushover.map((p) => p.id);
      const work = clear
        ? pushover.cancel(db, tag)
        : pushover.send(db, { ...note, tag, phones: ids });
      jobs.push(work.then(() => ids.map((id) => ({ id })), (error) => ids.map((id) => ({ id, error }))));
    }
    const outcomes = (await Promise.all(jobs)).flat();
    for (const o of outcomes) {
      const entity = o.id.startsWith('pushover') ? o.id : `notify.${o.id}`;
      logSend({ pluginId, device, entity, action, ok: !o.error, error: o.error?.message });
    }
    const results = Object.fromEntries(outcomes.map((o) => [o.id, o.error ? { ok: false, error: o.error.message } : { ok: true }]));
    if (outcomes.every((o) => o.error)) {
      const { error } = outcomes[0];
      return reply.status(error.status && error.status < 600 ? error.status : 502).send({ error: error.message, results });
    }
    return { ok: outcomes.every((o) => !o.error), results };
  }

  fastify.post('/api/plugin/v1/notify/:pluginId', async (request, reply) => deliver(request, reply, false));
  fastify.post('/api/plugin/v1/notify/:pluginId/clear', async (request, reply) => deliver(request, reply, true));

  return {
    /** Forget the phone lists, after a connection changes. */
    reset() {
      haCache = null;
    },
  };
}

module.exports = { registerPluginNotifyRoutes, checkNote, pickPhones, NoteError };
