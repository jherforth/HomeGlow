// Pushover (pushover.net): phone notifications without Home Assistant.
//
// The household registers an application on pushover.net (its API token)
// and gives HomeGlow its user key, or a delivery group's key for the whole
// family. Both are stored encrypted in the settings table, like the other
// credentials, and never sent to a browser: the status helper reports only
// whether each is stored.
//
// Plugins reach it through the plugin notify API (routes/pluginNotify.js),
// beside Home Assistant's Companion app phones. Messages are text only. An
// urgent one is Pushover's emergency priority: it repeats until someone
// acknowledges it on a phone (or HomeGlow cancels it by its tag), and rings
// through silent where the phone allows it (an iPhone's Critical Alerts).

const { encrypt, decrypt, isEncryptionConfigured } = require('../utils/encryption');

const TOKEN_KEY = 'PUSHOVER_APP_TOKEN_ENC';
const USER_KEY = 'PUSHOVER_USER_KEY_ENC';

// Tests point this at a stand-in.
const API_BASE = () => (process.env.HOMEGLOW_PUSHOVER_API_BASE || 'https://api.pushover.net').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10000;
// Pushover's keys: 30 letters and digits.
const KEY_PATTERN = /^[A-Za-z0-9]{30}$/;
// Device names on a Pushover account: letters, digits, _ and -, up to 25.
const DEVICE_PATTERN = /^[A-Za-z0-9_-]{1,25}$/;
// An emergency message repeats every minute for up to an hour, until acknowledged.
const EMERGENCY_RETRY_S = 60;
const EMERGENCY_EXPIRE_S = 3600;
const MAX_TITLE = 60;
const MAX_MESSAGE = 300;
const DEVICES_TTL_MS = 60000;

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

class PushoverError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function getConfig(db) {
  const tokenEnc = getSetting(db, TOKEN_KEY) || '';
  const userEnc = getSetting(db, USER_KEY) || '';
  return {
    token: tokenEnc ? decrypt(tokenEnc) : '',
    user: userEnc ? decrypt(userEnc) : '',
  };
}

function isConfigured(db) {
  return !!getSetting(db, TOKEN_KEY) && !!getSetting(db, USER_KEY);
}

function getStatus(db) {
  return {
    has_token: !!getSetting(db, TOKEN_KEY),
    has_user: !!getSetting(db, USER_KEY),
    configured: isConfigured(db),
    encryption_configured: isEncryptionConfigured(),
  };
}

/**
 * Write blind: a blank field leaves what's stored as it is; each key is
 * checked for Pushover's shape before it's kept.
 */
function saveConfig(db, { token, user }) {
  const write = (value, key, label) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const clean = String(value).trim();
    if (!KEY_PATTERN.test(clean)) throw new PushoverError(`The ${label} is 30 letters and numbers.`, 400);
    if (!isEncryptionConfigured()) throw new PushoverError('ENCRYPTION_KEY is not configured on the server.', 400);
    setSetting(db, key, encrypt(clean));
  };
  write(token, TOKEN_KEY, 'application key');
  write(user, USER_KEY, 'user or group key');
  cache.devices = null;
}

function clearConfig(db) {
  setSetting(db, TOKEN_KEY, '');
  setSetting(db, USER_KEY, '');
  cache.devices = null;
}

/** POST a form to Pushover's API. Calls through module.exports so tests can stub it. */
async function pushoverFetch(apiPath, fields) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE()}/1/${apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null)).toString(),
      signal: controller.signal,
    });
  } catch (error) {
    throw new PushoverError(error.name === 'AbortError' ? 'Pushover did not answer in time.' : 'Could not reach Pushover.', 504);
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try { body = await response.json(); } catch { /* not JSON */ }
  if (!response.ok || !body || body.status !== 1) {
    const reason = Array.isArray(body?.errors) && body.errors.length ? body.errors.join(' ') : `Pushover answered ${response.status}.`;
    throw new PushoverError(reason, response.status >= 400 && response.status < 500 ? 400 : 502);
  }
  return body;
}

const cache = { devices: null };

/**
 * Check the keys with Pushover and list what they reach:
 * { group: boolean, devices: [name] }. A group key reaches every member's
 * devices, so it lists none.
 */
async function validate(db) {
  const { token, user } = getConfig(db);
  if (!token || !user) throw new PushoverError('Pushover is not set up.', 503);
  const body = await module.exports.pushoverFetch('users/validate.json', { token, user });
  const devices = (Array.isArray(body.devices) ? body.devices : []).filter((d) => typeof d === 'string' && DEVICE_PATTERN.test(d));
  return { group: body.group === 1, devices };
}

/**
 * What the plugin notify API offers: one entry for every device on the
 * account, or one for the whole group. Asked of Pushover at most every
 * 60 seconds. -> [{ id, name, platform: null, via: 'pushover' }]
 */
async function phones(db, { fresh = false } = {}) {
  if (!isConfigured(db)) return [];
  if (!fresh && cache.devices && Date.now() - cache.devices.at < DEVICES_TTL_MS) return cache.devices.list;
  const { group, devices } = await validate(db);
  const list = group || devices.length === 0
    ? [{ id: 'pushover', name: group ? 'Pushover group' : 'Pushover', platform: null, via: 'pushover' }]
    : devices.map((device) => ({ id: `pushover:${device}`, name: `${device} (Pushover)`, platform: null, via: 'pushover' }));
  cache.devices = { list, at: Date.now() };
  return list;
}

const text = (value, max) => (typeof value === 'string'
  ? value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max)
  : '');

/**
 * The form for one message to the given phones (ids from phones()).
 * Pushover's `tags` (an emergency message's label, for cancelling) carries
 * the plugin's own tag. -> fields for messages.json
 */
function messageFields({ token, user }, { phones: ids, title, message, urgent, tag }) {
  const body = text(message, MAX_MESSAGE);
  if (!body) throw new PushoverError('A notification needs a message.', 400);
  const named = ids.filter((id) => id.startsWith('pushover:')).map((id) => id.slice('pushover:'.length));
  const everyone = ids.includes('pushover');
  const heading = text(title, MAX_TITLE);
  return {
    token,
    user,
    message: body,
    ...(heading ? { title: heading } : {}),
    ...(!everyone && named.length ? { device: named.join(',') } : {}),
    priority: urgent ? 2 : 0,
    ...(urgent ? { retry: EMERGENCY_RETRY_S, expire: EMERGENCY_EXPIRE_S } : {}),
    ...(urgent && tag ? { tags: tag } : {}),
  };
}

/** Send one message to these Pushover phones. */
async function send(db, note) {
  const config = getConfig(db);
  if (!config.token || !config.user) throw new PushoverError('Pushover is not set up.', 503);
  return module.exports.pushoverFetch('messages.json', messageFields(config, note));
}

/**
 * Stop an emergency message repeating, by its tag. Pushover can't take back
 * a message a phone already shows; this is what "clear" can do there.
 */
async function cancel(db, tag) {
  const { token } = getConfig(db);
  if (!token) throw new PushoverError('Pushover is not set up.', 503);
  return module.exports.pushoverFetch(`receipts/cancel_by_tag/${encodeURIComponent(tag)}.json`, { token });
}

/** Admin's Send test: checks the keys and sends one plain message to every device. */
async function sendTest(db) {
  const reach = await validate(db);
  await send(db, { phones: ['pushover'], title: 'HomeGlow', message: 'Pushover is connected. Plugins can send notifications here.' });
  return reach;
}

module.exports = {
  TOKEN_KEY,
  USER_KEY,
  PushoverError,
  cancel,
  clearConfig,
  getStatus,
  isConfigured,
  messageFields,
  phones,
  pushoverFetch,
  saveConfig,
  send,
  sendTest,
  validate,
  _cache: cache,
};
