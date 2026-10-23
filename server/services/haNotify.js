// The Home Assistant Companion app: a way, beside browser push and ntfy, to
// tell a phone that a chore or a day is done, or what a plugin has to say.
//
// HomeGlow already talks to Home Assistant (System → Connections), and every
// phone with the Companion app has a notify.mobile_app_<name> action there.
// Set up in Admin → System → Notifications: each phone Home Assistant lists
// can be turned on, choosing its events, plugins and family members as a
// device does (ha_notify_phones, schema34).
//
// services/notifications.js composes the messages; this module delivers them,
// as one of the notifier's channels. Only a title, a message, a tag, the tap
// address and the urgent sound ever reach the phone: never notify data from
// anywhere else, so nothing here can run a command on a phone.

const {
  parseAudience, audienceOf, textFor, wants, openUrlFrom,
} = require('./notifications');

const PHONE_ID = /^mobile_app_[a-z0-9_]{1,80}$/;
const MAX_TITLE = 60;
const MAX_MESSAGE = 300;
const MAX_LABEL = 60;
const PHONES_TTL_MS = 60 * 1000;

/** Home Assistant's slugify, as it names a phone's notify action. */
const slugify = (text) => String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Plain text, one line apart from line breaks, trimmed to `max`. */
const noteText = (value, max) => (typeof value === 'string'
  ? value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
  : '');

/**
 * The household's phones: every notify.mobile_app_* action Home Assistant
 * offers (`services`, from GET /api/services), named from its device
 * (`devices`, the device registry; null when it can't be read), and whether
 * it is an iPhone or an Android, which "urgent" needs. Sorted by name.
 * -> [{ id, name, platform: 'ios' | 'android' | null }]
 */
function phonesFrom(services, devices) {
  const notify = Array.isArray(services) ? services.find((entry) => entry?.domain === 'notify') : null;
  const ids = Object.keys(notify?.services || {}).filter((name) => PHONE_ID.test(name));
  const apps = (Array.isArray(devices) ? devices : [])
    .filter((device) => Array.isArray(device?.identifiers) && device.identifiers.some((pair) => Array.isArray(pair) && pair[0] === 'mobile_app'));
  return ids.map((id) => {
    const slug = id.slice('mobile_app_'.length);
    const device = apps.find((d) => slugify(d.name) === slug) || apps.find((d) => slugify(d.name_by_user) === slug);
    const maker = String(device?.manufacturer || '').toLowerCase();
    const os = String(device?.sw_version || '').toLowerCase();
    const platform = !device ? null : (maker === 'apple' || /^(ios|ipados)\b/.test(os) ? 'ios' : 'android');
    const fallback = slug.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return { id, name: String(device?.name_by_user || device?.name || fallback).slice(0, MAX_LABEL), platform };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A composed message (services/notifications.js) as the notify call for one
 * phone: { phone, payload, openUrl } -> { domain, service, data }.
 *
 * Every message asks to arrive at once (`priority: high`, `ttl: 0`), so a
 * sleeping Android doesn't hold it. Urgent rings through silent: Android's
 * alarm stream, an iPhone's critical alert (which the phone's owner must
 * allow for the app). A phone of unknown make gets both sets of keys; each
 * app ignores the other's. An empty body makes the title the message, since
 * the app needs one.
 */
function notifyCall({ phone, payload, openUrl }) {
  const title = noteText(payload.title, MAX_TITLE);
  const body = noteText(payload.body, MAX_MESSAGE);
  const message = body || title;
  if (!message) throw new Error('A notification needs a message.');
  const ios = phone.platform !== 'android';
  const android = phone.platform !== 'ios';
  const data = {};
  if (android) Object.assign(data, { priority: 'high', ttl: 0 }, payload.urgent ? { channel: 'alarm_stream' } : {});
  if (ios && payload.urgent) data.push = { sound: { name: 'default', critical: 1, volume: 1.0 } };
  if (typeof payload.tag === 'string' && payload.tag) data.tag = payload.tag.slice(0, 120);
  if (openUrl) {
    const target = `${openUrl}${payload.url && payload.url !== '/' ? payload.url : '/'}`;
    if (ios) data.url = target;
    if (android) data.clickAction = target;
  }
  return {
    domain: 'notify',
    service: phone.id,
    data: { ...(body && title ? { title } : {}), message, data },
  };
}

/**
 * The Companion app phones. `ha` is services/homeAssistant.js; `live` the
 * server's HaLive (its device registry, and the service calls).
 */
function createHaNotify({ db, ha, live, now = () => Date.now(), log = console }) {
  const connected = () => ha.isConfigured(db);

  // Home Assistant's phones, asked for at most every 60 seconds.
  let cache = null;
  async function discover(fresh) {
    if (!connected()) return [];
    if (!fresh && cache && now() - cache.at < PHONES_TTL_MS) return cache.phones;
    const services = await ha.homeAssistantFetch(db, 'GET', '/api/services');
    // Without the WebSocket there are still phones, named by their actions.
    const [devices] = await live.commands([{ type: 'config/device_registry/list' }]).catch(() => [null]);
    const phones = phonesFrom(services, devices);
    cache = { phones, at: now() };
    return phones;
  }

  // Prepared when used, not here: the server creates this before its
  // database is open (a lazy handle).
  const phoneRow = (phoneId) => db.prepare('SELECT * FROM ha_notify_phones WHERE phone_id = ?').get(phoneId);

  const describe = (row) => ({
    phoneId: row.phone_id,
    label: row.label,
    platform: row.platform,
    ...audienceOf(row),
    createdAt: row.created_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastFailure: row.last_failure,
  });

  /**
   * Every phone Home Assistant lists, each with its row when turned on, and
   * the turned-on phones Home Assistant no longer lists (`missing`).
   * Resolves { connected, phones, error? }.
   */
  async function list({ fresh = false } = {}) {
    const rows = db.prepare('SELECT * FROM ha_notify_phones ORDER BY label COLLATE NOCASE, id').all();
    if (!connected()) return { connected: false, phones: rows.map((row) => ({ ...describe(row), name: row.label, enabled: true })) };
    let found = [];
    let error;
    try {
      found = await discover(fresh);
    } catch (err) {
      error = `Couldn't list Home Assistant's phones: ${String(err?.message || err).slice(0, 200)}`;
    }
    const byId = new Map(rows.map((row) => [row.phone_id, row]));
    const phones = found.map((phone) => {
      const row = byId.get(phone.id);
      return row
        ? { ...describe(row), name: phone.name, platform: phone.platform ?? row.platform, enabled: true }
        : { phoneId: phone.id, name: phone.name, platform: phone.platform, enabled: false };
    });
    const listed = new Set(found.map((phone) => phone.id));
    for (const row of rows) {
      if (!listed.has(row.phone_id)) phones.push({ ...describe(row), name: row.label, enabled: true, missing: !error });
    }
    return error ? { connected: true, phones, error } : { connected: true, phones };
  }

  /** Turn a phone on, or change what it hears. Resolves { status, body | error }. */
  async function save(phoneId, body = {}) {
    if (!PHONE_ID.test(String(phoneId))) return { status: 400, error: 'That is not a Companion app phone.' };
    const existing = phoneRow(phoneId);
    let platform = existing?.platform ?? null;
    let name = existing?.label;
    if (!existing) {
      if (!connected()) return { status: 400, error: 'Connect Home Assistant first, in System → Connections.' };
      let phone;
      try {
        phone = (await discover(true)).find((p) => p.id === phoneId);
      } catch (err) {
        return { status: 502, error: `Couldn't list Home Assistant's phones: ${String(err?.message || err).slice(0, 200)}` };
      }
      if (!phone) return { status: 404, error: 'Home Assistant has no such phone.' };
      platform = phone.platform;
      name = phone.name;
    }
    const label = body.label === undefined ? name : (typeof body.label === 'string' ? body.label.trim() : '');
    if (!label) return { status: 400, error: 'Give the phone a name.' };
    if (label.length > MAX_LABEL) return { status: 400, error: `The name can be at most ${MAX_LABEL} characters.` };
    const audience = parseAudience(db, body, existing);
    if (audience.error) return { status: 400, error: audience.error };
    if (existing) {
      db.prepare('UPDATE ha_notify_phones SET label = ?, events_json = ?, members_json = ?, language = ? WHERE id = ?')
        .run(label, audience.events, audience.members, audience.language, existing.id);
    } else {
      db.prepare('INSERT INTO ha_notify_phones (phone_id, label, platform, events_json, members_json, language) VALUES (?, ?, ?, ?, ?, ?)')
        .run(phoneId, label, platform, audience.events, audience.members, audience.language);
    }
    return { status: 200, body: { ...describe(phoneRow(phoneId)), name: label, enabled: true } };
  }

  function remove(phoneId) {
    const info = db.prepare('DELETE FROM ha_notify_phones WHERE phone_id = ?').run(String(phoneId));
    return info.changes ? { status: 200, body: { enabled: false } } : { status: 404, error: 'That phone is not turned on.' };
  }

  /** Send one composed message to one phone's row, and record how it went. */
  async function deliver(row, payload) {
    let result;
    try {
      const call = notifyCall({ phone: { id: row.phone_id, platform: row.platform }, payload, openUrl: openUrlFrom(db) });
      await live.callService(call.domain, call.service, call.data);
      result = { ok: true };
    } catch (error) {
      const status = error?.status || error?.response?.status;
      const reason = status === 400 || status === 404
        ? 'Home Assistant no longer has this phone; is the Companion app still signed in?'
        : `Home Assistant didn't send it: ${String(error?.message || error).slice(0, 200)}`;
      result = { ok: false, error: reason };
    }
    if (result.ok) {
      db.prepare('UPDATE ha_notify_phones SET last_success_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    } else {
      db.prepare('UPDATE ha_notify_phones SET last_failure_at = CURRENT_TIMESTAMP, last_failure = ? WHERE id = ?').run(result.error, row.id);
      log.warn?.(`haNotify: sending to ${row.phone_id} failed: ${result.error}`);
    }
    return result;
  }

  async function sendTest(phoneId) {
    const row = phoneRow(String(phoneId));
    if (!row) return { status: 404, error: 'That phone is not turned on.' };
    if (!connected()) return { status: 400, error: 'Connect Home Assistant first, in System → Connections.' };
    const text = textFor(row.language);
    const result = await deliver(row, { title: text.testTitle, body: text.testBody(row.label), tag: 'homeglow-test', url: '/' });
    return result.ok ? { status: 200, body: { sent: true } } : { status: 502, error: result.error };
  }

  /** The phones that want `event` about `userId`, while Home Assistant is connected. */
  function recipients(event, userId) {
    if (!connected()) return [];
    return db.prepare('SELECT * FROM ha_notify_phones').all().filter((row) => wants(row, event, userId));
  }

  return {
    kind: 'homeassistant',
    connected, list, save, remove, sendTest,
    recipients, deliver,
  };
}

module.exports = {
  PHONE_ID,
  phonesFrom,
  notifyCall,
  createHaNotify,
};
