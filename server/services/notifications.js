// Push notifications to devices (phones, usually): a parent hears when a
// chore or a routine is done, wherever the phone is.
//
// A device turns them on from its own browser, which hands over a push
// subscription: an address at its push service (Apple's, Google's, Mozilla's)
// and the keys that encrypt messages to it (Web Push, RFC 8030 and 8291).
// Each device keeps its own choice of events and whose completions it hears
// about, in device_notifications (schema33). The phone's own quiet hours
// (Focus, Do Not Disturb) decide when it makes a sound.
//
// The server signs its messages with one key pair of its own (VAPID, RFC
// 8292), made the first time it is needed. The private half is stored
// encrypted, like the other secrets, and never leaves the server.
//
// Messages are composed here, in the device's language, from the chore events
// the rest of the server already emits (services/pluginEvents.js). A tap opens
// HomeGlow's start page: an iPhone opens the app on a tap whatever it is told,
// so every message says where.
//
// A plugin whose manifest says "notify": true may send a short message of its
// own (sendFromPlugin). A device hears a plugin only after it ticks that
// plugin, kept with its events as "plugin:<id>"; it starts with none.

const NOTIFICATION_EVENTS = Object.freeze(['chore.completed', 'chore.allCompleted']);
const PLUGIN_EVENT_PREFIX = 'plugin:';

// A plugin's message: a title and a line of text, nothing of its own beyond
// that. Tags are the plugin's own (homeglow-plugin-<id>-<tag>), so one plugin
// can only replace its own messages.
const PLUGIN_TITLE_MAX = 60;
const PLUGIN_MESSAGE_MAX = 300;
const PLUGIN_TAG = /^[a-z0-9][a-z0-9-]{0,39}$/;
// How many messages one plugin may send: a burst, and an hour's worth.
const PLUGIN_LIMITS = [{ windowMs: 60 * 1000, max: 5 }, { windowMs: 60 * 60 * 1000, max: 30 }];

const PUBLIC_KEY_SETTING = 'PUSH_VAPID_PUBLIC_KEY';
const PRIVATE_KEY_SETTING = 'PUSH_VAPID_PRIVATE_KEY_ENC';

// Who the push services may contact about this server's messages. Apple turns
// away a subject it can't read as a real address, so the default names the
// project rather than a made-up mailbox.
const DEFAULT_CONTACT = 'https://github.com/jherforth/HomeGlow';

// The server only ever sends to a push service, never to an address a page
// made up: a subscription's endpoint must be HTTPS on one of these hosts.
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',           // Chrome, Edge on Android, and other Chromium browsers
  'push.apple.com',               // Safari on iPhone, iPad and Mac (web.push.apple.com)
  'push.services.mozilla.com',    // Firefox (updates.push.services.mozilla.com)
  'notify.windows.com',           // Edge on Windows (*.notify.windows.com)
];

// Completions by the same person within this long are told as one message
// that grows ("Ava finished 3 chores"), not a stack of them.
const MERGE_MS = 10 * 60 * 1000;

// How long a push service keeps trying a phone that's off, in seconds. A
// completion a day late is noise.
const TTL_SECONDS = 4 * 60 * 60;

const TEXT = {
  en: {
    finished: (name, what) => `${name} finished ${what}`,
    routine: (routineName) => `the ${routineName} routine`,
    finishedMany: (name, count) => `${name} finished ${count} chores`,
    clams: (count) => `+${count} ${count === 1 ? 'clam' : 'clams'}`,
    allDone: (name) => `${name} finished all of today's chores`,
    bonus: (count) => `Bonus: +${count} ${count === 1 ? 'clam' : 'clams'}`,
    testTitle: 'Notifications are working',
    testBody: (device) => `This is ${device}. Chore news will arrive here.`,
  },
  es: {
    finished: (name, what) => `${name} terminó ${what}`,
    routine: (routineName) => `la rutina ${routineName}`,
    finishedMany: (name, count) => `${name} terminó ${count} tareas`,
    clams: (count) => `+${count} ${count === 1 ? 'almeja' : 'almejas'}`,
    allDone: (name) => `${name} terminó todas las tareas de hoy`,
    bonus: (count) => `Bono: +${count} ${count === 1 ? 'almeja' : 'almejas'}`,
    testTitle: 'Las notificaciones funcionan',
    testBody: (device) => `Este es ${device}. Aquí llegarán las noticias de tareas.`,
  },
};

const textFor = (language) => TEXT[String(language || '').slice(0, 2).toLowerCase()] || TEXT.en;

/** True when `endpoint` is an HTTPS address at a known push service. */
function isPushServiceEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// A push key is URL-safe base64; p256dh is a 65-byte point, auth 16 bytes.
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const isKey = (value, min, max) => typeof value === 'string' && BASE64URL.test(value) && value.length >= min && value.length <= max;

/**
 * The browser's PushSubscription (its toJSON()), checked. Returns
 * { endpoint, p256dh, auth } or { error }.
 */
function parseSubscription(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'subscription is required' };
  const { endpoint, keys } = raw;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !isPushServiceEndpoint(endpoint)) {
    return { error: 'subscription.endpoint must be an HTTPS address at a browser push service' };
  }
  if (!keys || !isKey(keys.p256dh, 80, 100) || !isKey(keys.auth, 16, 32)) {
    return { error: 'subscription.keys must hold p256dh and auth' };
  }
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

/**
 * The events a device asked for, checked: NOTIFICATION_EVENTS, and
 * "plugin:<id>" for any of `pluginIds` (the plugins that may notify).
 */
function parseEvents(raw, pluginIds = new Set()) {
  if (!Array.isArray(raw)) return { error: 'events must be a list' };
  const known = (event) => NOTIFICATION_EVENTS.includes(event)
    || (typeof event === 'string' && event.startsWith(PLUGIN_EVENT_PREFIX) && pluginIds.has(event.slice(PLUGIN_EVENT_PREFIX.length)));
  const unknown = raw.filter((event) => !known(event));
  if (unknown.length) return { error: `unknown events: ${unknown.join(', ')}` };
  return { events: [...new Set(raw)] };
}

/**
 * Whose completions a device hears about: null (everyone) or a list of user
 * ids. `knownIds` is every family member's id.
 */
function parseMembers(raw, knownIds) {
  if (raw === null || raw === undefined || raw === 'all') return { members: null };
  if (!Array.isArray(raw)) return { error: 'members must be "all" or a list of family member ids' };
  const ids = [...new Set(raw.map(Number))];
  const unknown = ids.filter((id) => !Number.isInteger(id) || !knownIds.has(id));
  if (unknown.length) return { error: `unknown family members: ${unknown.join(', ')}` };
  return { members: ids };
}

const parseJson = (text, fallback) => {
  try { return JSON.parse(text); } catch { return fallback; }
};

/**
 * Whether a recipient's row (a device's, an ntfy topic's, a Home Assistant
 * phone's) wants `event` about `userId`: its events_json lists it, and its
 * members_json is everyone (NULL) or names them. A message about no one in
 * particular (userId null) goes to every recipient that wants the event.
 */
function wants(row, event, userId) {
  if (!parseJson(row.events_json, []).includes(event)) return false;
  const members = row.members_json ? parseJson(row.members_json, null) : null;
  return !members || userId === null || members.includes(userId);
}

/** The installed plugins that may notify (their manifest says "notify": true). */
function notifyPluginsFrom(db) {
  return db.prepare('SELECT plugin_id, name, manifest_json FROM plugins ORDER BY name COLLATE NOCASE').all()
    .filter((row) => parseJson(row.manifest_json || 'null', null)?.notify === true)
    .map((row) => ({ id: row.plugin_id, name: row.name || row.plugin_id }));
}

/**
 * A recipient's choices, checked against an existing row (null for a new
 * one), the same for every channel: { events, members, language } with
 * events and members as stored (JSON text, members NULL for everyone), or
 * { error }.
 */
function parseAudience(db, body, existing) {
  const pluginIds = new Set(notifyPluginsFrom(db).map((plugin) => plugin.id));
  const events = body.events === undefined && existing
    ? { events: parseJson(existing.events_json, []) }
    : parseEvents(body.events ?? NOTIFICATION_EVENTS, pluginIds);
  if (events.error) return { error: events.error };
  const knownIds = new Set(db.prepare('SELECT id FROM users WHERE id != 0').all().map((u) => u.id));
  const members = body.members === undefined && existing
    ? { members: existing.members_json ? parseJson(existing.members_json, null) : null }
    : parseMembers(body.members, knownIds);
  if (members.error) return { error: members.error };
  const language = typeof body.language === 'string' && body.language.length <= 16
    ? body.language
    : (existing?.language || null);
  return {
    events: JSON.stringify(events.events),
    members: members.members ? JSON.stringify(members.members) : null,
    language,
  };
}

/** A recipient's choices for the Admin Panel, from its stored row. */
const audienceOf = (row) => ({
  events: parseJson(row.events_json, []),
  members: row.members_json ? parseJson(row.members_json, null) : 'all',
  language: row.language || null,
});

// The HomeGlow address a tap on a notification opens, for the channels that
// need an absolute one (ntfy, the Home Assistant app). Admin → System →
// Notifications; by default the address the Admin Panel was open on.
const OPEN_URL_SETTING = 'NOTIFY_OPEN_URL';
const openUrlFrom = (db) => db.prepare('SELECT value FROM settings WHERE key = ?').get(OPEN_URL_SETTING)?.value || null;

/** The open address, checked: an http(s) URL without credentials, or '' to clear. */
function parseOpenUrl(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { value: null };
  let url;
  try { url = new URL(text); } catch { return { error: 'The address must be an http:// or https:// address.' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { error: 'The address must be an http:// or https:// address.' };
  if (url.username || url.password) return { error: 'The address must not contain a user name or password.' };
  return { value: text.replace(/\/+$/, '') };
}

/**
 * The notifier. `send(subscription, payload, options)` is web-push's
 * sendNotification (injected, so tests can stand in for the push services);
 * `generateKeys()` is its generateVAPIDKeys.
 */
function createNotifier({
  db, send, generateKeys, encrypt, decrypt,
  contact = process.env.HOMEGLOW_PUSH_CONTACT || DEFAULT_CONTACT,
  now = () => Date.now(), log = console,
  // More ways to deliver the same messages: [{ kind, recipients(event,
  // userId), deliver(row, payload) }] (services/ntfy.js, services/haNotify.js).
  channels = [],
}) {
  let keys = null;
  // userId -> { at, date, titles }: recent completions, for merging.
  const recent = new Map();

  function vapidKeys() {
    if (keys) return keys;
    const get = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
    const publicKey = get(PUBLIC_KEY_SETTING);
    const privateEnc = get(PRIVATE_KEY_SETTING);
    if (publicKey && privateEnc) {
      keys = { publicKey, privateKey: decrypt(privateEnc) };
      return keys;
    }
    const made = generateKeys();
    const put = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
      put.run(PUBLIC_KEY_SETTING, made.publicKey);
      put.run(PRIVATE_KEY_SETTING, encrypt(made.privateKey));
    })();
    keys = { publicKey: made.publicKey, privateKey: made.privateKey };
    return keys;
  }

  const deviceRow = (deviceName) => db.prepare(`
    SELECT n.*, d.name AS device_name FROM device_notifications n
    JOIN devices d ON d.id = n.device_id WHERE d.name = ?
  `).get(deviceName);

  // The installed plugins that may notify, for a device to choose from.
  const notifyPlugins = () => notifyPluginsFrom(db);

  const describe = (row) => (row ? {
    enabled: true,
    events: parseJson(row.events_json, []),
    plugins: notifyPlugins(),
    members: row.members_json ? parseJson(row.members_json, null) : 'all',
    language: row.language || null,
    createdAt: row.created_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastFailure: row.last_failure,
  } : { enabled: false });

  /**
   * Turn a device's notifications on, or change what it hears. `subscription`
   * may be left out to keep the device's current one.
   */
  function save(deviceName, body = {}) {
    const device = db.prepare('SELECT id FROM devices WHERE name = ?').get(deviceName);
    if (!device) return { status: 404, error: 'Device not found' };
    const existing = db.prepare('SELECT * FROM device_notifications WHERE device_id = ?').get(device.id);

    let subscription = null;
    if (body.subscription !== undefined || !existing) {
      subscription = parseSubscription(body.subscription);
      if (subscription.error) return { status: 400, error: subscription.error };
    }
    const audience = parseAudience(db, body, existing);
    if (audience.error) return { status: 400, error: audience.error };
    const { language } = audience;
    const events = { events: JSON.parse(audience.events) };
    const membersJson = audience.members;
    if (existing) {
      const sub = subscription || existing;
      // A new subscription starts its send record afresh.
      const fresh = subscription && subscription.endpoint !== existing.endpoint;
      db.prepare(`
        UPDATE device_notifications SET endpoint = ?, p256dh = ?, auth = ?, events_json = ?, members_json = ?, language = ?
        ${fresh ? ', last_success_at = NULL, last_failure_at = NULL, last_failure = NULL' : ''}
        WHERE id = ?
      `).run(sub.endpoint, sub.p256dh, sub.auth, JSON.stringify(events.events), membersJson, language, existing.id);
    } else {
      // A phone that re-subscribes under a new device name moves its endpoint.
      db.prepare('DELETE FROM device_notifications WHERE endpoint = ?').run(subscription.endpoint);
      db.prepare(`
        INSERT INTO device_notifications (device_id, endpoint, p256dh, auth, events_json, members_json, language)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(device.id, subscription.endpoint, subscription.p256dh, subscription.auth, JSON.stringify(events.events), membersJson, language);
    }
    return { status: 200, body: describe(deviceRow(deviceName)) };
  }

  function remove(deviceName) {
    const device = db.prepare('SELECT id FROM devices WHERE name = ?').get(deviceName);
    if (!device) return { status: 404, error: 'Device not found' };
    db.prepare('DELETE FROM device_notifications WHERE device_id = ?').run(device.id);
    return { status: 200, body: { enabled: false } };
  }

  /**
   * Send one message to one device's row. Resolves { ok } or { ok: false,
   * gone, error }. A push service that says the address is gone (404, 410)
   * means the phone dropped it, so the row goes too.
   */
  async function deliver(row, payload) {
    if (row.kind && row.kind !== 'webpush') {
      const channel = channels.find((c) => c.kind === row.kind);
      try {
        return channel ? await channel.deliver(row, payload) : { ok: false, error: `no channel ${row.kind}` };
      } catch (error) {
        log.warn?.(`notifications: ${row.kind} send failed: ${error?.message || error}`);
        return { ok: false, error: String(error?.message || error) };
      }
    }
    const { publicKey, privateKey } = vapidKeys();
    try {
      await send(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject: contact, publicKey, privateKey }, TTL: TTL_SECONDS, urgency: payload.urgent ? 'high' : 'normal' }
      );
      db.prepare('UPDATE device_notifications SET last_success_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
      return { ok: true };
    } catch (error) {
      const status = error?.statusCode;
      if (status === 404 || status === 410) {
        db.prepare('DELETE FROM device_notifications WHERE id = ?').run(row.id);
        return { ok: false, gone: true, error: 'The phone no longer accepts notifications from this server.' };
      }
      const reason = (status ? `${status} ` : '') + String(error?.body || error?.message || error).slice(0, 300);
      db.prepare('UPDATE device_notifications SET last_failure_at = CURRENT_TIMESTAMP, last_failure = ? WHERE id = ?').run(reason, row.id);
      log.warn?.(`notifications: send to device ${row.device_id} failed: ${reason}`);
      return { ok: false, gone: false, error: reason };
    }
  }

  async function sendTest(deviceName) {
    const row = deviceRow(deviceName);
    if (!row) return { status: 404, error: 'Notifications are not on for this device' };
    const text = textFor(row.language);
    const result = await deliver(row, {
      title: text.testTitle, body: text.testBody(deviceName), tag: 'homeglow-test', url: '/',
    });
    if (result.ok) return { status: 200, body: { sent: true } };
    return { status: result.gone ? 410 : 502, error: result.error };
  }

  const userName = (userId) => db.prepare('SELECT username FROM users WHERE id = ?').get(userId)?.username || null;

  // Everyone that wants `event` about `userId`: the devices with browser
  // push, then each channel's own (an ntfy topic, a Home Assistant phone),
  // each row marked with its channel. A message about no one in particular
  // (userId null) goes to every recipient that wants the event. A channel
  // that can't list its recipients just has none this time.
  function recipients(event, userId) {
    const devices = db.prepare('SELECT * FROM device_notifications').all()
      .filter((row) => wants(row, event, userId))
      .map((row) => ({ ...row, kind: 'webpush' }));
    const others = channels.flatMap((channel) => {
      try {
        return channel.recipients(event, userId).map((row) => ({ ...row, kind: channel.kind }));
      } catch (error) {
        log.warn?.(`notifications: ${channel.kind} recipients failed: ${error?.message || error}`);
        return [];
      }
    });
    return [...devices, ...others];
  }

  // What was finished, for the message: a routine by its name, else the chore.
  function finishedThing(choreId, text) {
    const routine = db.prepare('SELECT name FROM routines WHERE chore_id = ?').get(choreId);
    if (routine?.name) return text.routine(routine.name);
    return db.prepare('SELECT title FROM chores WHERE id = ?').get(choreId)?.title || null;
  }

  /**
   * The messages an event makes, one per language its recipients use:
   * [{ rows, payload }]. Exposed for tests; handle() sends them.
   */
  function compose({ event, payload }) {
    const userId = Number(payload?.userId);
    if (!NOTIFICATION_EVENTS.includes(event) || !Number.isInteger(userId) || userId === 0) return [];
    const name = payload.username || userName(userId);
    if (!name) return [];
    const rows = recipients(event, userId);
    if (!rows.length) return [];

    // Completions by one person close together grow one message.
    let merged = null;
    if (event === 'chore.completed') {
      const last = recent.get(userId);
      const fresh = !last || now() - last.at > MERGE_MS || last.date !== payload.date;
      merged = fresh ? { choreIds: [], clams: 0 } : last;
      merged.choreIds.push(payload.choreId);
      merged.clams += Number(payload.clamValue) || 0;
      merged.at = now();
      merged.date = payload.date;
      recent.set(userId, merged);
    }

    const byLanguage = new Map();
    for (const row of rows) {
      const key = textFor(row.language) === TEXT.es ? 'es' : 'en';
      if (!byLanguage.has(key)) byLanguage.set(key, []);
      byLanguage.get(key).push(row);
    }

    return [...byLanguage].map(([language, languageRows]) => {
      const text = TEXT[language];
      let title;
      let body;
      let tag;
      if (event === 'chore.completed') {
        const count = merged.choreIds.length;
        title = count === 1
          ? text.finished(name, finishedThing(payload.choreId, text) || '')
          : text.finishedMany(name, count);
        if (count > 1) {
          body = merged.choreIds.map((id) => finishedThing(id, text)).filter(Boolean).join(' · ');
          if (merged.clams > 0) body += ` (${text.clams(merged.clams)})`;
        } else {
          body = merged.clams > 0 ? text.clams(merged.clams) : '';
        }
        tag = `homeglow-chores-${userId}-${payload.date}`;
      } else {
        title = text.allDone(name);
        body = Number(payload.reward) > 0 ? text.bonus(Number(payload.reward)) : '';
        tag = `homeglow-alldone-${userId}-${payload.date}`;
      }
      return { rows: languageRows, payload: { title, body, tag, url: '/' } };
    });
  }

  const pluginSends = new Map();
  // True when this send would take the plugin over a limit; counts it if not.
  function overLimit(pluginId) {
    const at = now();
    const longest = Math.max(...PLUGIN_LIMITS.map((limit) => limit.windowMs));
    const recentSends = (pluginSends.get(pluginId) || []).filter((sent) => at - sent < longest);
    pluginSends.set(pluginId, recentSends);
    if (PLUGIN_LIMITS.some(({ windowMs, max }) => recentSends.filter((sent) => at - sent < windowMs).length >= max)) return true;
    recentSends.push(at);
    return false;
  }

  /**
   * A plugin's own message, to the devices that ticked that plugin.
   * `about` (a family member's id) lets each device's "About" choice apply;
   * without it every such device hears it. Resolves { status, body | error }.
   */
  async function sendFromPlugin({ pluginId, pluginName, title, message, tag, about, urgent }) {
    if (typeof message !== 'string' || !message.trim()) return { status: 400, error: 'A notification needs a message.' };
    if (urgent !== undefined && urgent !== null && typeof urgent !== 'boolean') return { status: 400, error: 'urgent must be true or false.' };
    if (title !== undefined && title !== null && typeof title !== 'string') return { status: 400, error: 'title must be text.' };
    if (tag !== undefined && tag !== null && (typeof tag !== 'string' || !PLUGIN_TAG.test(tag))) {
      return { status: 400, error: 'tag must be up to 40 lowercase letters, numbers and dashes.' };
    }
    let userId = null;
    if (about !== undefined && about !== null) {
      userId = Number(about);
      if (!Number.isInteger(userId) || userId === 0 || !userName(userId)) return { status: 400, error: 'about must be a family member\'s id.' };
    }
    if (overLimit(pluginId)) return { status: 429, error: 'This plugin has sent too many notifications; try again later.' };

    const payload = {
      title: (title && title.trim() ? title.trim() : pluginName || pluginId).slice(0, PLUGIN_TITLE_MAX),
      body: message.trim().slice(0, PLUGIN_MESSAGE_MAX),
      url: '/',
    };
    if (tag) payload.tag = `homeglow-plugin-${pluginId}-${tag}`;
    // Rings through a silent phone where the way it's delivered allows.
    if (urgent === true) payload.urgent = true;
    const results = await Promise.all(recipients(`${PLUGIN_EVENT_PREFIX}${pluginId}`, userId).map((row) => deliver(row, payload)));
    return { status: 200, body: { sent: results.filter((result) => result.ok).length } };
  }

  /** A pluginEvents subscriber: sends what an event makes, in the background. */
  function handle(message) {
    let messages;
    try {
      messages = compose(message);
    } catch (error) {
      log.error?.('notifications: could not compose a message:', error);
      return Promise.resolve();
    }
    return Promise.all(messages.flatMap(({ rows, payload }) => rows.map((row) => deliver(row, payload))));
  }

  return {
    publicKey: () => vapidKeys().publicKey,
    get: (deviceName) => describe(deviceRow(deviceName)),
    save,
    remove,
    sendTest,
    sendFromPlugin,
    compose,
    handle,
    enabledDeviceIds: () => new Set(db.prepare('SELECT device_id FROM device_notifications').all().map((r) => r.device_id)),
    // Every device with browser push on, for Admin → System → Notifications.
    listDevices: () => db.prepare(`
      SELECT n.*, d.name AS device_name FROM device_notifications n
      JOIN devices d ON d.id = n.device_id ORDER BY d.name COLLATE NOCASE
    `).all().map((row) => ({
      deviceName: row.device_name,
      ...audienceOf(row),
      createdAt: row.created_at,
      lastSuccessAt: row.last_success_at,
      lastFailureAt: row.last_failure_at,
      lastFailure: row.last_failure,
    })),
    plugins: notifyPlugins,
  };
}

module.exports = {
  NOTIFICATION_EVENTS,
  PLUGIN_EVENT_PREFIX,
  OPEN_URL_SETTING,
  parseEvents,
  parseMembers,
  parseAudience,
  audienceOf,
  textFor,
  wants,
  notifyPluginsFrom,
  openUrlFrom,
  parseOpenUrl,
  PUSH_SERVICE_HOSTS,
  PRIVATE_KEY_SETTING,
  isPushServiceEndpoint,
  parseSubscription,
  createNotifier,
};
