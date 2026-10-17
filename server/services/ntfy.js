// ntfy (https://ntfy.sh): a second way, beside browser push, to tell a phone
// that a chore or a day is done (issue #288).
//
// HomeGlow publishes each message to a *topic* on an ntfy server, and the
// free ntfy app on the phone shows it. Unlike browser push it needs no HTTPS
// on HomeGlow, no web app added to the Home Screen, and (with the F-Droid
// build of the app) no Google services: only that the server can reach ntfy.
//
// The connection (System → Connections) is one per household, in settings:
// on/off, the server (ntfy.sh or self-hosted), an optional access token
// (stored encrypted, never returned) and the HomeGlow address a tap opens.
// The topics (Family → Notifications) are a list, each hearing about the
// events and family members it chose, in ntfy_topics (schema34).
//
// The messages themselves are composed by services/notifications.js, the
// same as browser push sends; this module publishes them and keeps the list.

const crypto = require('crypto');
const { NOTIFICATION_EVENTS, parseEvents, parseMembers, textFor, wants } = require('./notifications');

const ENABLED_SETTING = 'NTFY_ENABLED';
const SERVER_SETTING = 'NTFY_SERVER';
const TOKEN_SETTING = 'NTFY_TOKEN_ENC';
const OPEN_URL_SETTING = 'NTFY_OPEN_URL';

const DEFAULT_SERVER = 'https://ntfy.sh';

// ntfy's own rule for a topic name.
const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_LABEL = 60;
const TIMEOUT_MS = 15000;

const parseJson = (text, fallback) => {
  try { return JSON.parse(text); } catch { return fallback; }
};

/**
 * An http(s) address with no credentials in it, without its trailing slash,
 * or { error }. `what` names it in the error.
 */
function parseAddress(raw, what) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || text.length > 512) return { error: `${what} is required` };
  let url;
  try { url = new URL(text); } catch { return { error: `${what} must be an http:// or https:// address` }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { error: `${what} must be an http:// or https:// address` };
  if (url.username || url.password) return { error: `${what} must not contain a user name or password` };
  return { value: text.replace(/\/+$/, '') };
}

/** A topic name, checked: ntfy allows letters, digits, - and _. */
function parseTopic(raw) {
  const topic = typeof raw === 'string' ? raw.trim() : '';
  if (!TOPIC.test(topic)) return { error: 'The topic may use letters, digits, - and _, up to 64 characters.' };
  return { value: topic };
}

/** A fresh, hard-to-guess topic name. */
const randomTopic = () => `homeglow-${crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toLowerCase()}`;

/**
 * The ntfy connection and topic list. `post(url, body, options)` is
 * axios.post (injected, so tests need no ntfy); `agentFor(url)` is
 * utils/outboundTls's httpsAgentFor.
 */
function createNtfy({ db, post, agentFor = () => undefined, encrypt, decrypt, log = console }) {
  // Prepared when used, not here: the server creates this before its
  // database is open (a lazy handle).
  const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
  const putSetting = { run: (key, value) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value) };
  const dropSetting = { run: (key) => db.prepare('DELETE FROM settings WHERE key = ?').run(key) };

  const enabled = () => getSetting(ENABLED_SETTING) === 'true';
  const server = () => getSetting(SERVER_SETTING) || DEFAULT_SERVER;
  const token = () => {
    const stored = getSetting(TOKEN_SETTING);
    return stored ? decrypt(stored) : null;
  };

  // --- the connection ---------------------------------------------------------

  function connection() {
    return {
      enabled: enabled(),
      server: server(),
      hasToken: Boolean(getSetting(TOKEN_SETTING)),
      openUrl: getSetting(OPEN_URL_SETTING),
      defaultServer: DEFAULT_SERVER,
    };
  }

  /**
   * Save the connection. `token` left out keeps the stored one; '' or null
   * clears it. `open_url` is the HomeGlow address a tap on a notification
   * opens; '' or null clears it.
   */
  function saveConnection(body = {}) {
    const address = body.server === undefined ? { value: server() } : parseAddress(body.server || DEFAULT_SERVER, 'The ntfy server');
    if (address.error) return { status: 400, error: address.error };
    let openUrl;
    if (body.open_url !== undefined && body.open_url !== null && body.open_url !== '') {
      openUrl = parseAddress(body.open_url, 'The HomeGlow address');
      if (openUrl.error) return { status: 400, error: openUrl.error };
    }
    let tokenText;
    if (body.token !== undefined) {
      tokenText = typeof body.token === 'string' ? body.token.trim() : '';
      if (tokenText.length > 256) return { status: 400, error: 'The access token is too long.' };
    }
    db.transaction(() => {
      if (body.enabled !== undefined) putSetting.run(ENABLED_SETTING, body.enabled === true ? 'true' : 'false');
      putSetting.run(SERVER_SETTING, address.value);
      if (body.open_url !== undefined) {
        if (openUrl) putSetting.run(OPEN_URL_SETTING, openUrl.value);
        else dropSetting.run(OPEN_URL_SETTING);
      }
      if (tokenText !== undefined) {
        if (tokenText) putSetting.run(TOKEN_SETTING, encrypt(tokenText));
        else dropSetting.run(TOKEN_SETTING);
      }
    })();
    return { status: 200, body: connection() };
  }

  // --- publishing ---------------------------------------------------------------

  /**
   * Publish one message to `topic`. Resolves { ok } or { ok: false, error }.
   * A message is { title?, message, click?, tags? }.
   */
  async function publish(topic, message) {
    const url = `${server()}/`;
    const headers = { 'Content-Type': 'application/json' };
    const bearer = token();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    try {
      await post(url, { topic, priority: 3, ...message }, { headers, timeout: TIMEOUT_MS, httpsAgent: agentFor(url) });
      return { ok: true };
    } catch (error) {
      const status = error?.response?.status;
      let reason;
      if (status === 401 || status === 403) reason = 'The ntfy server refused the access token.';
      else if (status === 429) reason = 'The ntfy server is limiting how many messages it takes; try again later.';
      else if (status) reason = `The ntfy server answered ${status}: ${String(error.response?.data?.error || error.message).slice(0, 200)}`;
      else reason = `Couldn't reach the ntfy server: ${String(error?.message || error).slice(0, 200)}`;
      return { ok: false, error: reason };
    }
  }

  /** Check the server and token by publishing to a throwaway topic. */
  async function testConnection() {
    const result = await publish(`${randomTopic()}-check`, { message: 'HomeGlow is checking its ntfy connection.' });
    return result.ok
      ? { status: 200, body: { success: true, message: `Connected to ${server()}.` } }
      : { status: 400, error: result.error };
  }

  // A composed message (services/notifications.js) as ntfy's: an empty body
  // makes the title the message, since ntfy needs one.
  function toNtfy(payload) {
    const allDone = String(payload.tag || '').startsWith('homeglow-alldone');
    const message = payload.body
      ? { title: payload.title, message: payload.body }
      : { message: payload.title };
    const openUrl = getSetting(OPEN_URL_SETTING);
    if (openUrl) message.click = `${openUrl}${payload.url && payload.url !== '/' ? payload.url : '/'}`;
    message.tags = [allDone ? 'tada' : 'white_check_mark'];
    return message;
  }

  /** Send one composed message to one topic's row, and record how it went. */
  async function deliver(row, payload) {
    const result = await publish(row.topic, toNtfy(payload));
    if (result.ok) {
      db.prepare('UPDATE ntfy_topics SET last_success_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    } else {
      db.prepare('UPDATE ntfy_topics SET last_failure_at = CURRENT_TIMESTAMP, last_failure = ? WHERE id = ?').run(result.error, row.id);
      log.warn?.(`ntfy: publishing to topic ${row.id} failed: ${result.error}`);
    }
    return result;
  }

  // --- the topics -------------------------------------------------------------------

  const describe = (row) => ({
    id: row.id,
    label: row.label,
    topic: row.topic,
    events: parseJson(row.events_json, []),
    members: row.members_json ? parseJson(row.members_json, null) : 'all',
    language: row.language || null,
    createdAt: row.created_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastFailure: row.last_failure,
  });

  const topicRow = (id) => db.prepare('SELECT * FROM ntfy_topics WHERE id = ?').get(Number(id));
  const list = () => db.prepare('SELECT * FROM ntfy_topics ORDER BY label COLLATE NOCASE, id').all().map(describe);

  // A topic's fields, checked against `existing` (null for a new one).
  function parseTopicBody(body, existing) {
    const label = body.label === undefined && existing ? existing.label : (typeof body.label === 'string' ? body.label.trim() : '');
    if (!label) return { error: 'Give the topic a name, like "Mom\'s phone".' };
    if (label.length > MAX_LABEL) return { error: `The name can be at most ${MAX_LABEL} characters.` };
    const topic = body.topic === undefined && existing ? { value: existing.topic } : parseTopic(body.topic);
    if (topic.error) return { error: topic.error };
    const taken = db.prepare('SELECT id FROM ntfy_topics WHERE topic = ?').get(topic.value);
    if (taken && taken.id !== existing?.id) return { error: 'That topic is already in the list.' };
    const events = body.events === undefined && existing
      ? { events: parseJson(existing.events_json, []) }
      : parseEvents(body.events ?? NOTIFICATION_EVENTS);
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
      value: {
        label, topic: topic.value, events: JSON.stringify(events.events),
        members: members.members ? JSON.stringify(members.members) : null, language,
      },
    };
  }

  function create(body = {}) {
    const checked = parseTopicBody(body, null);
    if (checked.error) return { status: 400, error: checked.error };
    const v = checked.value;
    const id = db.prepare('INSERT INTO ntfy_topics (label, topic, events_json, members_json, language) VALUES (?, ?, ?, ?, ?)')
      .run(v.label, v.topic, v.events, v.members, v.language).lastInsertRowid;
    return { status: 200, body: describe(topicRow(id)) };
  }

  function update(id, body = {}) {
    const existing = topicRow(id);
    if (!existing) return { status: 404, error: 'No such topic.' };
    const checked = parseTopicBody(body, existing);
    if (checked.error) return { status: 400, error: checked.error };
    const v = checked.value;
    // A topic renamed starts its send record afresh.
    const fresh = v.topic !== existing.topic;
    db.prepare(`
      UPDATE ntfy_topics SET label = ?, topic = ?, events_json = ?, members_json = ?, language = ?
      ${fresh ? ', last_success_at = NULL, last_failure_at = NULL, last_failure = NULL' : ''}
      WHERE id = ?
    `).run(v.label, v.topic, v.events, v.members, v.language, existing.id);
    return { status: 200, body: describe(topicRow(existing.id)) };
  }

  function remove(id) {
    const info = db.prepare('DELETE FROM ntfy_topics WHERE id = ?').run(Number(id));
    return info.changes ? { status: 200, body: { success: true } } : { status: 404, error: 'No such topic.' };
  }

  async function sendTest(id) {
    const row = topicRow(id);
    if (!row) return { status: 404, error: 'No such topic.' };
    if (!enabled()) return { status: 400, error: 'Turn ntfy on in System → Connections first.' };
    const text = textFor(row.language);
    const result = await deliver(row, { title: text.testTitle, body: text.testBody(row.label), tag: 'homeglow-test', url: '/' });
    return result.ok ? { status: 200, body: { sent: true } } : { status: 502, error: result.error };
  }

  /** The topics that want `event` about `userId`, while ntfy is on. */
  function recipients(event, userId) {
    if (!enabled()) return [];
    return db.prepare('SELECT * FROM ntfy_topics').all().filter((row) => wants(row, event, userId));
  }

  return {
    enabled, connection, saveConnection, testConnection,
    list, create, update, remove, sendTest,
    recipients, deliver, publish, toNtfy,
  };
}

module.exports = {
  TOKEN_SETTING,
  randomTopic,
  createNtfy,
};
