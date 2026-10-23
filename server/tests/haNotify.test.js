// The Home Assistant Companion app (services/haNotify.js) on a scratch
// database, with Home Assistant stood in for: which phones there are, what a
// message to each becomes, and the same messages browser push and ntfy send
// reaching the phones that asked for them.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createNotifier, OPEN_URL_SETTING } = require('../services/notifications');
const { createNtfy } = require('../services/ntfy');
const { phonesFrom, notifyCall, createHaNotify } = require('../services/haNotify');

const SERVICES = [
  { domain: 'light', services: { turn_on: {} } },
  { domain: 'notify', services: { notify: {}, persistent_notification: {}, mobile_app_jason_s_pixel: {}, mobile_app_sam_s_iphone: {}, mobile_app_old_tablet: {}, send_message: {} } },
];
const DEVICES = [
  { id: 'd1', name: "Jason's Pixel", manufacturer: 'Google', model: 'Pixel 8', sw_version: '15', identifiers: [['mobile_app', 'abc']] },
  { id: 'd2', name: "Sam's iPhone", name_by_user: 'Sam', manufacturer: 'Apple', model: 'iPhone16,1', sw_version: '18.1', identifiers: [['mobile_app', 'def']] },
  { id: 'd3', name: 'Jasons Pixel', manufacturer: 'Google', identifiers: [['zha', 'x']] },
];

test('phones are the notify.mobile_app_* actions, named and told apart by their devices', () => {
  assert.deepEqual(phonesFrom(SERVICES, DEVICES), [
    { id: 'mobile_app_jason_s_pixel', name: "Jason's Pixel", platform: 'android' },
    { id: 'mobile_app_old_tablet', name: 'Old Tablet', platform: null },
    { id: 'mobile_app_sam_s_iphone', name: 'Sam', platform: 'ios' },
  ]);
  // No device list (no WebSocket): still every phone, by its action's name.
  assert.deepEqual(phonesFrom(SERVICES, null).map((p) => [p.id, p.platform]),
    [['mobile_app_jason_s_pixel', null], ['mobile_app_old_tablet', null], ['mobile_app_sam_s_iphone', null]]);
  assert.deepEqual(phonesFrom(null, null), []);
});

test('a message is a title and text; urgent rings through silent on each kind of phone', () => {
  const [android, tablet, iphone] = phonesFrom(SERVICES, DEVICES);
  const payload = { title: 'Grill', body: 'Brisket is 198°.', url: '/' };
  assert.deepEqual(notifyCall({ phone: android, payload }), {
    domain: 'notify', service: 'mobile_app_jason_s_pixel', data: { title: 'Grill', message: 'Brisket is 198°.', data: { priority: 'high', ttl: 0 } },
  });
  assert.deepEqual(notifyCall({ phone: android, payload: { ...payload, urgent: true, tag: 'homeglow-plugin-grill-food' } }).data.data,
    { priority: 'high', ttl: 0, channel: 'alarm_stream', tag: 'homeglow-plugin-grill-food' });
  assert.deepEqual(notifyCall({ phone: iphone, payload: { ...payload, urgent: true } }).data.data,
    { push: { sound: { name: 'default', critical: 1, volume: 1.0 } } });
  assert.deepEqual(notifyCall({ phone: iphone, payload }).data.data, {});
  // Not sure which: both, and each app ignores the other's.
  const both = notifyCall({ phone: tablet, payload: { ...payload, urgent: true }, openUrl: 'http://homeglow.lan:3000' }).data.data;
  assert.equal(both.channel, 'alarm_stream');
  assert.equal(both.push.sound.critical, 1);
  assert.equal(both.url, 'http://homeglow.lan:3000/');
  assert.equal(both.clickAction, 'http://homeglow.lan:3000/');
});

test('the text is plain and trimmed; no body makes the title the message', () => {
  const [android] = phonesFrom(SERVICES, DEVICES);
  const call = notifyCall({ phone: android, payload: { title: 'x'.repeat(200), body: `  ${'y'.repeat(400)}\u0007 ` } });
  assert.equal(call.data.title.length, 60);
  assert.equal(call.data.message.length, 300);
  assert.deepEqual(notifyCall({ phone: android, payload: { title: 'Ava finished all of today\'s chores', body: '' } }).data,
    { message: 'Ava finished all of today\'s chores', data: { priority: 'high', ttl: 0 } });
  assert.throws(() => notifyCall({ phone: android, payload: { title: ' ', body: '' } }), /needs a message/);
});

const migrate = (db, file, target) => {
  const migration = path.resolve(__dirname, `../migrations/${file}`);
  globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT = { db, schemaIdKey: 'schema_id', targetSchemaId: target };
  delete require.cache[migration];
  require(migration);
  delete globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
};

const quiet = { warn() {}, error() {} };

function setup({ refuse = () => false } = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE devices (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, updateTime TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT);
    CREATE TABLE chores (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT);
    CREATE TABLE routines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, chore_id INTEGER);
    CREATE TABLE plugins (id INTEGER PRIMARY KEY AUTOINCREMENT, plugin_id TEXT, name TEXT, manifest_json TEXT);
    INSERT INTO plugins (plugin_id, name, manifest_json) VALUES ('grill', 'Grill', '{"notify":true}');
    INSERT INTO users (id, username) VALUES (0, 'bonus'), (1, 'Ava'), (2, 'Leo');
    INSERT INTO chores (id, title) VALUES (10, 'Feed the cat');
    INSERT INTO devices (name) VALUES ('Mom phone');
  `);
  migrate(db, 'schema33-deviceNotifications.js', 33);
  migrate(db, 'schema34-notificationChannels.js', 34);

  const state = { connected: true, listed: SERVICES };
  const calls = [];
  const ha = {
    isConfigured: () => state.connected,
    homeAssistantFetch: async (_db, method, apiPath) => {
      assert.equal(`${method} ${apiPath}`, 'GET /api/services');
      return state.listed;
    },
  };
  const live = {
    commands: async ([command]) => {
      assert.equal(command.type, 'config/device_registry/list');
      return [DEVICES];
    },
    callService: async (domain, service, data) => {
      calls.push({ domain, service, data });
      if (refuse(service)) throw Object.assign(new Error('Service not found'), { status: 400 });
      return [];
    },
  };
  const haNotify = createHaNotify({ db, ha, live, log: quiet });
  const posted = [];
  const ntfy = createNtfy({
    db,
    post: async (url, body) => { posted.push(body); if (refuse('ntfy')) throw new Error('down'); },
    encrypt: (t) => t,
    decrypt: (t) => t,
    log: quiet,
  });
  const pushed = [];
  const notifier = createNotifier({
    db,
    send: async (sub, payload, options) => { pushed.push({ payload: JSON.parse(payload), options }); },
    generateKeys: () => ({ publicKey: 'PUBLIC', privateKey: 'PRIVATE' }),
    encrypt: (t) => t,
    decrypt: (t) => t,
    log: quiet,
    channels: [ntfy, haNotify],
  });
  return { db, state, calls, haNotify, ntfy, posted, notifier, pushed };
}

test('every phone Home Assistant lists can be turned on, changed and turned off', async () => {
  const { haNotify, state } = setup();
  let listed = await haNotify.list();
  assert.equal(listed.connected, true);
  assert.deepEqual(listed.phones.map((p) => [p.phoneId, p.enabled]),
    [['mobile_app_jason_s_pixel', false], ['mobile_app_old_tablet', false], ['mobile_app_sam_s_iphone', false]]);

  const on = await haNotify.save('mobile_app_sam_s_iphone', { members: [1] });
  assert.equal(on.status, 200, on.error);
  assert.deepEqual({ label: on.body.label, platform: on.body.platform, events: on.body.events, members: on.body.members },
    { label: 'Sam', platform: 'ios', events: ['chore.completed', 'chore.allCompleted'], members: [1] });
  assert.equal((await haNotify.save('mobile_app_nobody', {})).status, 404);
  assert.equal((await haNotify.save('notify', {})).status, 400);
  assert.equal((await haNotify.save('mobile_app_old_tablet', { events: ['plugin:clock'] })).status, 400);

  const changed = await haNotify.save('mobile_app_sam_s_iphone', { label: "Sam's phone", events: ['plugin:grill'] });
  assert.equal(changed.body.label, "Sam's phone");
  assert.deepEqual(changed.body.events, ['plugin:grill']);
  assert.deepEqual(changed.body.members, [1], 'left out, the members stay');

  // A phone Home Assistant no longer lists stays, marked missing.
  state.listed = [{ domain: 'notify', services: { mobile_app_jason_s_pixel: {} } }];
  listed = await haNotify.list({ fresh: true });
  assert.deepEqual(listed.phones.map((p) => [p.phoneId, p.enabled, Boolean(p.missing)]),
    [['mobile_app_jason_s_pixel', false, false], ['mobile_app_sam_s_iphone', true, true]]);

  // Disconnected: only the phones turned on, and none can be added.
  state.connected = false;
  listed = await haNotify.list();
  assert.deepEqual(listed, { connected: false, phones: [{ ...listed.phones[0], phoneId: 'mobile_app_sam_s_iphone' }] });
  assert.equal((await haNotify.save('mobile_app_jason_s_pixel', {})).status, 400);

  assert.equal(haNotify.remove('mobile_app_sam_s_iphone').status, 200);
  assert.equal(haNotify.remove('mobile_app_sam_s_iphone').status, 404);
});

test('one completion reaches a browser device, an ntfy topic and a phone, each as asked', async () => {
  const { db, haNotify, ntfy, notifier, calls, posted, pushed } = setup();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(OPEN_URL_SETTING, 'http://homeglow.lan:3000');
  notifier.save('Mom phone', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/mom', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } } });
  ntfy.saveConnection({ enabled: true });
  ntfy.create({ label: 'Mom', topic: 'homeglow-mom' });
  await haNotify.save('mobile_app_jason_s_pixel', {});
  await haNotify.save('mobile_app_sam_s_iphone', { members: [2] });

  await notifier.handle({ event: 'chore.completed', payload: { userId: 1, choreId: 10, clamValue: 2, date: '2026-10-23' } });
  assert.equal(pushed.length, 1);
  assert.equal(posted.length, 1);
  assert.deepEqual(calls, [{
    domain: 'notify',
    service: 'mobile_app_jason_s_pixel',
    data: {
      title: 'Ava finished Feed the cat',
      message: '+2 clams',
      data: { priority: 'high', ttl: 0, tag: 'homeglow-chores-1-2026-10-23', clickAction: 'http://homeglow.lan:3000/' },
    },
  }], "Sam's iPhone hears only about Leo");
  assert.ok((await haNotify.list()).phones.find((p) => p.phoneId === 'mobile_app_jason_s_pixel').lastSuccessAt);
});

test('an urgent plugin message is urgent everywhere; one way failing stops no other', async () => {
  const { haNotify, ntfy, notifier, calls, posted, pushed } = setup({ refuse: (service) => service === 'ntfy' || service === 'mobile_app_old_tablet' });
  notifier.save('Mom phone', {
    subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/mom', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } },
    events: ['plugin:grill'],
  });
  ntfy.saveConnection({ enabled: true });
  ntfy.create({ label: 'Mom', topic: 'homeglow-mom', events: ['plugin:grill'] });
  await haNotify.save('mobile_app_old_tablet', { events: ['plugin:grill'] });
  await haNotify.save('mobile_app_jason_s_pixel', { events: ['plugin:grill'] });

  const sent = await notifier.sendFromPlugin({ pluginId: 'grill', pluginName: 'Grill', message: 'Fire!', urgent: true });
  assert.equal(sent.body.sent, 2, 'browser push and the Pixel; ntfy and the tablet failed');
  assert.equal(pushed[0].options.urgency, 'high');
  assert.equal(posted[0].priority, 5);
  assert.equal(calls.find((c) => c.service === 'mobile_app_jason_s_pixel').data.data.channel, 'alarm_stream');
  const tablet = (await haNotify.list()).phones.find((p) => p.phoneId === 'mobile_app_old_tablet');
  assert.match(tablet.lastFailure, /no longer has this phone/);
  assert.match(ntfy.list()[0].lastFailure, /Couldn't reach the ntfy server/);

  // Not urgent: normal everywhere.
  await notifier.sendFromPlugin({ pluginId: 'grill', pluginName: 'Grill', message: 'Done.' });
  assert.equal(pushed[1].options.urgency, 'normal');
  assert.equal(calls.at(-1).data.data.channel, undefined);
});

test('a test message reaches the phone, in its language', async () => {
  const { haNotify, calls, state } = setup();
  assert.equal((await haNotify.sendTest('mobile_app_jason_s_pixel')).status, 404);
  await haNotify.save('mobile_app_jason_s_pixel', { language: 'es' });
  assert.equal((await haNotify.sendTest('mobile_app_jason_s_pixel')).status, 200);
  assert.equal(calls[0].data.title, 'Las notificaciones funcionan');
  state.connected = false;
  assert.equal((await haNotify.sendTest('mobile_app_jason_s_pixel')).status, 400);
  assert.deepEqual(haNotify.recipients('chore.completed', 1), [], 'disconnected: no recipients');
});
