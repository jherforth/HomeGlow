// Push notifications (services/notifications.js) on a scratch database, with
// the push services stood in for: what a completion sends, to whom, in which
// language, and what happens when a phone has gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  NOTIFICATION_EVENTS, createNotifier, isPushServiceEndpoint, parseSubscription,
} = require('../services/notifications');

const MIGRATION = path.resolve(__dirname, '../migrations/schema33-deviceNotifications.js');

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE devices (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, updateTime TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT);
    CREATE TABLE chores (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT);
    CREATE TABLE routines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, chore_id INTEGER);
    CREATE TABLE plugins (id INTEGER PRIMARY KEY AUTOINCREMENT, plugin_id TEXT, name TEXT, manifest_json TEXT);
    INSERT INTO plugins (plugin_id, name, manifest_json) VALUES
      ('polls', 'Polls', '{"notify":true}'), ('grill', 'Grill', '{"notify":true}'), ('clock', 'Clock', '{}');
    INSERT INTO users (id, username) VALUES (0, 'bonus'), (1, 'Ava'), (2, 'Leo');
    INSERT INTO chores (id, title) VALUES (10, 'Feed the cat'), (11, 'Make the bed'), (12, 'Morning');
    INSERT INTO routines (name, chore_id) VALUES ('Morning', 12);
    INSERT INTO devices (name) VALUES ('Mom phone'), ('Dad phone'), ('Kitchen');
  `);
  globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT = { db, schemaIdKey: 'schema_id', targetSchemaId: 33 };
  delete require.cache[MIGRATION];
  require(MIGRATION);
  delete globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
  return db;
}

const subscription = (n = 1, host = 'fcm.googleapis.com') => ({
  endpoint: `https://${host}/fcm/send/device-${n}`,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
});

function setup({ sendResult = () => {}, start = 1_000_000 } = {}) {
  const db = freshDb();
  const sent = [];
  let clock = start;
  const notifier = createNotifier({
    db,
    send: async (sub, payload, options) => {
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options });
      const failure = sendResult(sub);
      if (failure) throw failure;
    },
    generateKeys: () => ({ publicKey: 'PUBLIC', privateKey: 'PRIVATE' }),
    encrypt: (text) => `enc:${text}`,
    decrypt: (text) => text.replace(/^enc:/, ''),
    now: () => clock,
    log: { warn() {}, error() {} },
  });
  return { db, notifier, sent, advance: (ms) => { clock += ms; } };
}

const completed = (userId, choreId, clamValue = 0, date = '2026-10-16') => ({
  event: 'chore.completed', payload: { userId, choreId, scheduleId: 100 + choreId, clamValue, date },
});

test('push addresses must be HTTPS at a browser push service', () => {
  assert.equal(isPushServiceEndpoint('https://fcm.googleapis.com/fcm/send/x'), true);
  assert.equal(isPushServiceEndpoint('https://web.push.apple.com/QGx'), true);
  assert.equal(isPushServiceEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
  assert.equal(isPushServiceEndpoint('https://db5p.notify.windows.com/w/?token=x'), true);
  assert.equal(isPushServiceEndpoint('http://fcm.googleapis.com/fcm/send/x'), false);
  assert.equal(isPushServiceEndpoint('https://192.168.1.10/fcm/send/x'), false);
  assert.equal(isPushServiceEndpoint('https://evilfcm.googleapis.com.example.com/x'), false);
  assert.equal(isPushServiceEndpoint('https://fcm.googleapis.com:8443/x'), false);
  assert.equal(isPushServiceEndpoint('https://user:pw@fcm.googleapis.com/x'), false);
  assert.ok(parseSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'short', auth: 'a'.repeat(22) } }).error);
});

test('the server makes its key pair once and keeps the private half encrypted', () => {
  const { db, notifier } = setup();
  assert.equal(notifier.publicKey(), 'PUBLIC');
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'PUSH_VAPID_PRIVATE_KEY_ENC'").get().value, 'enc:PRIVATE');
  assert.equal(notifier.publicKey(), 'PUBLIC');
});

test('a device turns notifications on, changes them, and turns them off', () => {
  const { notifier } = setup();
  assert.deepEqual(notifier.get('Mom phone'), { enabled: false });

  const on = notifier.save('Mom phone', { subscription: subscription(), language: 'es' });
  assert.equal(on.status, 200);
  assert.deepEqual(on.body.events, NOTIFICATION_EVENTS, 'the chore events by default, no plugins');
  assert.equal(on.body.members, 'all');

  const changed = notifier.save('Mom phone', { events: ['chore.allCompleted'], members: [1] });
  assert.deepEqual(changed.body.events, ['chore.allCompleted']);
  assert.deepEqual(changed.body.members, [1]);
  assert.equal(changed.body.language, 'es', 'kept when not sent');

  assert.equal(notifier.save('Mom phone', { members: [99] }).status, 400);
  assert.equal(notifier.save('Mom phone', { events: ['clam.withdrawn'] }).status, 400);
  assert.equal(notifier.save('Nobody', { subscription: subscription() }).status, 404);
  assert.equal(notifier.save('Dad phone', {}).status, 400, 'a first save needs a subscription');
  assert.equal(notifier.save('Dad phone', { subscription: { endpoint: 'https://example.com/x', keys: {} } }).status, 400);

  assert.deepEqual(notifier.remove('Mom phone').body, { enabled: false });
  assert.deepEqual(notifier.get('Mom phone'), { enabled: false });
});

test('a phone subscribing under a new name moves its address there', () => {
  const { db, notifier } = setup();
  notifier.save('Mom phone', { subscription: subscription(7) });
  notifier.save('Dad phone', { subscription: subscription(7) });
  assert.equal(notifier.get('Mom phone').enabled, false);
  assert.equal(notifier.get('Dad phone').enabled, true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM device_notifications').get().n, 1);
});

test('deleting a device deletes its notifications', () => {
  const { db, notifier } = setup();
  notifier.save('Mom phone', { subscription: subscription() });
  db.prepare("DELETE FROM devices WHERE name = 'Mom phone'").run();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM device_notifications').get().n, 0);
});

test('a completion goes to the devices that asked, about the people they asked about', async () => {
  const { notifier, sent } = setup();
  notifier.save('Mom phone', { subscription: subscription(1) });
  notifier.save('Dad phone', { subscription: subscription(2), members: [2] });
  notifier.save('Kitchen', { subscription: subscription(3), events: ['chore.allCompleted'] });

  await notifier.handle(completed(1, 10, 5));
  assert.deepEqual(sent.map((s) => s.endpoint), [subscription(1).endpoint]);
  assert.deepEqual(sent[0].payload, {
    title: 'Ava finished Feed the cat', body: '+5 clams', tag: 'homeglow-chores-1-2026-10-16', url: '/',
  });
  assert.equal(sent[0].options.vapidDetails.publicKey, 'PUBLIC');
  assert.equal(sent[0].options.vapidDetails.privateKey, 'PRIVATE');
  assert.match(sent[0].options.vapidDetails.subject, /^(https:|mailto:)/);
});

test('completions close together grow one message; later ones start afresh', async () => {
  const { notifier, sent, advance } = setup();
  notifier.save('Mom phone', { subscription: subscription() });
  await notifier.handle(completed(1, 10, 5));
  advance(60_000);
  await notifier.handle(completed(1, 11, 2));
  assert.equal(sent[1].payload.title, 'Ava finished 2 chores');
  assert.equal(sent[1].payload.body, 'Feed the cat · Make the bed (+7 clams)');
  assert.equal(sent[1].payload.tag, sent[0].payload.tag, 'replaces the first on the phone');

  advance(11 * 60_000);
  await notifier.handle(completed(1, 11, 0));
  assert.equal(sent[2].payload.title, 'Ava finished Make the bed');
  assert.equal(sent[2].payload.body, '');
});

test('a routine is named as a routine; finishing the day says so', async () => {
  const { notifier, sent } = setup();
  notifier.save('Mom phone', { subscription: subscription() });
  await notifier.handle(completed(2, 12));
  assert.equal(sent[0].payload.title, 'Leo finished the Morning routine');
  await notifier.handle({ event: 'chore.allCompleted', payload: { userId: 2, username: 'Leo', date: '2026-10-16', reward: 3 } });
  assert.deepEqual(sent[1].payload, {
    title: "Leo finished all of today's chores", body: 'Bonus: +3 clams', tag: 'homeglow-alldone-2-2026-10-16', url: '/',
  });
});

test('each device hears in its own language', async () => {
  const { notifier, sent } = setup();
  notifier.save('Mom phone', { subscription: subscription(1), language: 'es-MX' });
  notifier.save('Dad phone', { subscription: subscription(2), language: 'en' });
  await notifier.handle(completed(1, 10, 1));
  const byEndpoint = Object.fromEntries(sent.map((s) => [s.endpoint, s.payload]));
  assert.equal(byEndpoint[subscription(1).endpoint].title, 'Ava terminó Feed the cat');
  assert.equal(byEndpoint[subscription(1).endpoint].body, '+1 almeja');
  assert.equal(byEndpoint[subscription(2).endpoint].title, 'Ava finished Feed the cat');
});

test('other events, the bonus user and unknown people send nothing', async () => {
  const { notifier, sent } = setup();
  notifier.save('Mom phone', { subscription: subscription() });
  await notifier.handle({ event: 'chore.uncompleted', payload: { userId: 1, choreId: 10 } });
  await notifier.handle({ event: 'clam.withdrawn', payload: { userId: 1, amount: 3 } });
  await notifier.handle(completed(0, 10));
  await notifier.handle(completed(42, 10));
  assert.equal(sent.length, 0);
});

test('a phone that has gone is forgotten; other failures are recorded', async () => {
  const gone = Object.assign(new Error('Gone'), { statusCode: 410 });
  const busy = Object.assign(new Error('Too many'), { statusCode: 429, body: 'slow down' });
  const { db, notifier } = setup({ sendResult: (sub) => (sub.endpoint.endsWith('-1') ? gone : busy) });
  notifier.save('Mom phone', { subscription: subscription(1) });
  notifier.save('Dad phone', { subscription: subscription(2) });
  await notifier.handle(completed(1, 10));
  assert.equal(notifier.get('Mom phone').enabled, false);
  const dad = notifier.get('Dad phone');
  assert.equal(dad.enabled, true);
  assert.equal(dad.lastFailure, '429 slow down');
  assert.ok(dad.lastFailureAt);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM device_notifications').get().n, 1);
});

test('a test message reports how it went', async () => {
  const { notifier, sent } = setup();
  assert.equal((await notifier.sendTest('Mom phone')).status, 404);
  notifier.save('Mom phone', { subscription: subscription() });
  const result = await notifier.sendTest('Mom phone');
  assert.equal(result.status, 200);
  assert.equal(sent[0].payload.title, 'Notifications are working');
  assert.ok(notifier.get('Mom phone').lastSuccessAt);
});

test('a device chooses among the plugins that may notify', () => {
  const { notifier } = setup();
  const on = notifier.save('Mom phone', { subscription: subscription() });
  assert.deepEqual(on.body.plugins, [{ id: 'grill', name: 'Grill' }, { id: 'polls', name: 'Polls' }], 'not Clock, which does not notify');
  assert.equal(notifier.save('Mom phone', { events: ['plugin:polls'] }).status, 200);
  assert.equal(notifier.save('Mom phone', { events: ['plugin:clock'] }).status, 400, 'Clock does not notify');
  assert.equal(notifier.save('Mom phone', { events: ['plugin:nothere'] }).status, 400);
});

test('a plugin message goes only to devices that ticked that plugin, about whom they asked', async () => {
  const { notifier, sent } = setup();
  notifier.save('Mom phone', { subscription: subscription(1), events: ['chore.completed', 'plugin:grill', 'plugin:polls'] });
  notifier.save('Dad phone', { subscription: subscription(2), events: ['plugin:grill', 'plugin:polls'], members: [2] });
  notifier.save('Kitchen', { subscription: subscription(3), events: ['plugin:polls'] });

  const anyone = await notifier.sendFromPlugin({ pluginId: 'grill', pluginName: 'Grill', message: ' Brisket is ready ' });
  assert.deepEqual(anyone, { status: 200, body: { sent: 2 } });
  assert.deepEqual(sent.map((s) => s.endpoint.slice(-1)).sort(), ['1', '2'], 'not Kitchen, which ticked only Polls');
  assert.deepEqual(sent[0].payload, { title: 'Grill', body: 'Brisket is ready', url: '/' }, 'titled by the plugin, untagged');

  sent.length = 0;
  const aboutAva = await notifier.sendFromPlugin({ pluginId: 'polls', pluginName: 'Polls', title: 'Vote closed', message: 'Pizza won', tag: 'vote-7', about: 1 });
  assert.equal(aboutAva.body.sent, 2);
  assert.deepEqual(sent.map((s) => s.endpoint.slice(-1)).sort(), ['1', '3'], 'Dad hears only about Leo');
  assert.equal(sent[0].payload.tag, 'homeglow-plugin-polls-vote-7', 'the tag is the plugin\'s own');
  assert.equal(sent[0].payload.title, 'Vote closed');
});

test('a plugin message is checked and limited', async () => {
  const { notifier, advance } = setup();
  const send = (fields) => notifier.sendFromPlugin({ pluginId: 'p', pluginName: 'P', message: 'hi', ...fields });
  assert.equal((await send({ message: '  ' })).status, 400);
  assert.equal((await send({ tag: 'Has Spaces' })).status, 400);
  assert.equal((await send({ about: 0 })).status, 400, 'not the bonus user');
  assert.equal((await send({ about: 99 })).status, 400);
  assert.equal((await send({ title: 5 })).status, 400);

  const long = await notifier.sendFromPlugin({ pluginId: 'q', pluginName: 'Q', message: 'x' });
  assert.equal(long.status, 200);
  for (let i = 0; i < 5; i += 1) assert.equal((await send({})).status, 200, 'refused sends above did not count');
  assert.equal((await send({})).status, 429, 'five a minute');
  assert.equal((await notifier.sendFromPlugin({ pluginId: 'q', pluginName: 'Q', message: 'x' })).status, 200, 'per plugin');
  advance(61 * 1000);
  assert.equal((await send({})).status, 200, 'a minute later');
});
