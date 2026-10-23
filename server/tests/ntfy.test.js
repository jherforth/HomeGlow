// ntfy (services/ntfy.js) on a scratch database, with the ntfy server stood
// in for: the connection, the topic list, and the same messages browser push
// sends going to the topics that asked for them, plugins' and urgent ones too.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createNotifier, OPEN_URL_SETTING } = require('../services/notifications');
const { createNtfy, TOKEN_SETTING, randomTopic } = require('../services/ntfy');

const migrate = (db, file, target) => {
  const migration = path.resolve(__dirname, `../migrations/${file}`);
  globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT = { db, schemaIdKey: 'schema_id', targetSchemaId: target };
  delete require.cache[migration];
  require(migration);
  delete globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
};

function setup({ fail = () => null } = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE devices (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, updateTime TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT);
    CREATE TABLE chores (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT);
    CREATE TABLE routines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, chore_id INTEGER);
    CREATE TABLE plugins (id INTEGER PRIMARY KEY AUTOINCREMENT, plugin_id TEXT, name TEXT, manifest_json TEXT);
    INSERT INTO plugins (plugin_id, name, manifest_json) VALUES ('grill', 'Grill', '{"notify":true}'), ('clock', 'Clock', '{}');
    INSERT INTO users (id, username) VALUES (0, 'bonus'), (1, 'Ava'), (2, 'Leo');
    INSERT INTO chores (id, title) VALUES (10, 'Feed the cat');
    INSERT INTO devices (name) VALUES ('Mom phone');
  `);
  migrate(db, 'schema33-deviceNotifications.js', 33);
  migrate(db, 'schema34-notificationChannels.js', 34);

  const posted = [];
  const pushed = [];
  const ntfy = createNtfy({
    db,
    post: async (url, body, options) => {
      posted.push({ url, body, headers: options.headers, timeout: options.timeout });
      const failure = fail(url, body);
      if (failure) throw failure;
      return { data: { id: 'x' } };
    },
    encrypt: (text) => `enc:${text}`,
    decrypt: (text) => text.replace(/^enc:/, ''),
    log: { warn() {}, error() {} },
  });
  const notifier = createNotifier({
    db,
    send: async (sub, payload) => { pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); },
    generateKeys: () => ({ publicKey: 'PUBLIC', privateKey: 'PRIVATE' }),
    encrypt: (text) => `enc:${text}`,
    decrypt: (text) => text.replace(/^enc:/, ''),
    log: { warn() {}, error() {} },
    channels: [ntfy],
  });
  return { db, ntfy, notifier, posted, pushed };
}

const completed = (userId, choreId, clamValue = 0) => ({
  event: 'chore.completed', payload: { userId, choreId, scheduleId: 100 + choreId, clamValue, date: '2026-10-17' },
});
const refused = () => Object.assign(new Error('Request failed with status code 403'), { response: { status: 403, data: { error: 'forbidden' } } });

test('the connection: ntfy.sh by default, a token kept encrypted and never shown', () => {
  const { db, ntfy } = setup();
  assert.deepEqual(ntfy.connection(), {
    enabled: false, server: 'https://ntfy.sh', hasToken: false, defaultServer: 'https://ntfy.sh',
  });

  const saved = ntfy.saveConnection({ enabled: true, server: 'https://ntfy.example.com/', token: 'tk_secret' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, {
    enabled: true, server: 'https://ntfy.example.com', hasToken: true, defaultServer: 'https://ntfy.sh',
  });
  assert.equal(db.prepare('SELECT value FROM settings WHERE key = ?').get(TOKEN_SETTING).value, 'enc:tk_secret');
  assert.ok(!JSON.stringify(saved.body).includes('tk_secret'));

  // Left out, the token stays; cleared, it goes.
  ntfy.saveConnection({ enabled: true });
  assert.equal(ntfy.connection().hasToken, true);
  ntfy.saveConnection({ token: '' });
  assert.equal(ntfy.connection().hasToken, false);

  assert.equal(ntfy.saveConnection({ server: 'ftp://ntfy.example.com' }).status, 400);
  assert.equal(ntfy.saveConnection({ server: 'https://user:pass@ntfy.example.com' }).status, 400);
});

test('testing the connection publishes to a throwaway topic and says what went wrong', async () => {
  let refuse = false;
  const { ntfy, posted } = setup({ fail: () => (refuse ? refused() : null) });
  ntfy.saveConnection({ enabled: true, token: 'tk_secret' });
  const ok = await ntfy.testConnection();
  assert.equal(ok.status, 200);
  assert.equal(posted[0].url, 'https://ntfy.sh/');
  assert.match(posted[0].body.topic, /^homeglow-[a-z0-9]+-check$/);
  assert.equal(posted[0].headers.Authorization, 'Bearer tk_secret');

  refuse = true;
  const bad = await ntfy.testConnection();
  assert.equal(bad.status, 400);
  assert.match(bad.error, /refused the access token/);
});

test('topics: a name, a valid unique topic, and the same events and members as a device', () => {
  const { ntfy } = setup();
  const made = ntfy.create({ label: "Mom's phone", topic: 'homeglow-mom-1', members: [1], language: 'en' });
  assert.equal(made.status, 200, made.error);
  assert.deepEqual(
    { label: made.body.label, topic: made.body.topic, events: made.body.events, members: made.body.members },
    { label: "Mom's phone", topic: 'homeglow-mom-1', events: ['chore.completed', 'chore.allCompleted'], members: [1] },
  );
  assert.equal(ntfy.create({ label: '', topic: 'abc' }).status, 400);
  assert.equal(ntfy.create({ label: 'Bad', topic: 'has spaces' }).status, 400);
  assert.equal(ntfy.create({ label: 'Again', topic: 'homeglow-mom-1' }).status, 400, 'a topic can be listed once');
  assert.equal(ntfy.create({ label: 'Who', topic: 'abc', members: [99] }).status, 400);
  assert.equal(ntfy.create({ label: 'What', topic: 'abc', events: ['chore.deleted'] }).status, 400);
  assert.equal(ntfy.create({ label: 'What', topic: 'abc', events: ['plugin:clock'] }).status, 400, 'only plugins that may notify');
  assert.deepEqual(ntfy.create({ label: 'Grill', topic: 'abc', events: ['plugin:grill'] }).body.events, ['plugin:grill']);

  const edited = ntfy.update(made.body.id, { members: 'all', events: ['chore.allCompleted'] });
  assert.equal(edited.body.members, 'all');
  assert.deepEqual(edited.body.events, ['chore.allCompleted']);
  assert.equal(ntfy.list().length, 2);
  assert.equal(ntfy.remove(made.body.id).status, 200);
  assert.equal(ntfy.list().length, 1);
  assert.match(randomTopic(), /^homeglow-[a-z0-9]{6,12}$/);
});

test('a completion goes to the topics that asked, alongside browser push, with a tap that opens HomeGlow', async () => {
  const { db, ntfy, notifier, posted, pushed } = setup();
  ntfy.saveConnection({ enabled: true, token: 'tk_secret' });
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(OPEN_URL_SETTING, 'http://homeglow.lan:3000');
  notifier.save('Mom phone', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/mom', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } } });
  ntfy.create({ label: 'Mom', topic: 'homeglow-mom' });
  ntfy.create({ label: 'Dad', topic: 'homeglow-dad', members: [2] });
  ntfy.create({ label: 'Grandma', topic: 'homeglow-gran', events: ['chore.allCompleted'] });

  await notifier.handle(completed(1, 10, 5));
  assert.deepEqual(pushed.map((p) => p.payload.title), ['Ava finished Feed the cat'], 'browser push still goes');
  assert.deepEqual(posted.map((p) => p.body.topic), ['homeglow-mom'], 'Dad hears only about Leo; Grandma only about whole days');
  assert.deepEqual(posted[0].body, {
    topic: 'homeglow-mom', priority: 3, title: 'Ava finished Feed the cat', message: '+5 clams',
    click: 'http://homeglow.lan:3000/', tags: ['white_check_mark'],
  });
  assert.equal(posted[0].url, 'https://ntfy.sh/');
  assert.equal(posted[0].headers.Authorization, 'Bearer tk_secret');

  // A day finished, with no bonus: the title is the message.
  posted.length = 0;
  await notifier.handle({ event: 'chore.allCompleted', payload: { userId: 1, date: '2026-10-17', reward: 0 } });
  assert.deepEqual(posted.map((p) => p.body.topic).sort(), ['homeglow-gran', 'homeglow-mom']);
  assert.equal(posted[0].body.message, "Ava finished all of today's chores");
  assert.equal(posted[0].body.title, undefined);
  assert.deepEqual(posted[0].body.tags, ['tada']);
});

test('switched off, nothing goes to ntfy; a refused publish is recorded and the topic kept', async () => {
  let refuse = false;
  const { ntfy, notifier, posted } = setup({ fail: () => (refuse ? refused() : null) });
  const topic = ntfy.create({ label: 'Mom', topic: 'homeglow-mom' }).body;
  await notifier.handle(completed(1, 10));
  assert.equal(posted.length, 0, 'ntfy is off');
  assert.equal((await ntfy.sendTest(topic.id)).status, 400);

  ntfy.saveConnection({ enabled: true });
  refuse = true;
  await notifier.handle(completed(1, 10));
  const [row] = ntfy.list();
  assert.match(row.lastFailure, /refused the access token/);
  assert.equal(ntfy.list().length, 1);

  refuse = false;
  const sent = await ntfy.sendTest(topic.id);
  assert.equal(sent.status, 200);
  assert.equal(posted.at(-1).body.title, 'Notifications are working');
  assert.equal(posted.at(-1).body.message, 'This is Mom. Chore news will arrive here.');
  assert.ok(ntfy.list()[0].lastSuccessAt);
});

test('a plugin message reaches the topics that ticked it; urgent goes at priority 5', async () => {
  const { ntfy, notifier, posted } = setup();
  ntfy.saveConnection({ enabled: true });
  ntfy.create({ label: 'Mom', topic: 'homeglow-mom', events: ['plugin:grill'] });
  ntfy.create({ label: 'Dad', topic: 'homeglow-dad' });

  const plain = await notifier.sendFromPlugin({ pluginId: 'grill', pluginName: 'Grill', message: 'Brisket is 198°.' });
  assert.equal(plain.body.sent, 1);
  assert.deepEqual(posted.map((p) => p.body), [{
    topic: 'homeglow-mom', priority: 3, title: 'Grill', message: 'Brisket is 198°.', tags: ['white_check_mark'],
  }], 'no open address set: no click');

  posted.length = 0;
  await notifier.sendFromPlugin({ pluginId: 'grill', pluginName: 'Grill', message: 'Fire!', urgent: true });
  assert.equal(posted[0].body.priority, 5);
  assert.deepEqual(posted[0].body.tags, ['rotating_light']);
  assert.equal((await notifier.sendFromPlugin({ pluginId: 'grill', message: 'x', urgent: 'yes' })).status, 400);
});
