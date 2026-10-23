// Admin → System → Notifications, end to end: a real HomeGlow server on a
// throwaway database, a stand-in ntfy server that keeps what is published to
// it, and the fake Home Assistant with two Companion app phones. The shared
// settings, ntfy's connection and topics, the phones, and chore and plugin
// messages reaching both.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');
const { startFakeHomeAssistant } = require('./helpers/fakeHomeAssistant');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `notification-channels-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';
let fake;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const put = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body) });
const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });
const del = (p) => api(p, { method: 'DELETE' });
const until = async (check) => {
  for (let i = 0; i < 60 && !check(); i += 1) await delay(50);
  return check();
};

// A stand-in ntfy server: every publish is kept.
const published = [];
let ntfyServer;
let ntfyUrl;
let refuse = false;

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fake = await startFakeHomeAssistant({ token: 'ha-secret' });
  ntfyServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (refuse) { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"error":"forbidden"}'); return; }
      published.push({ path: req.url, auth: req.headers.authorization || null, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"id":"x"}');
    });
  });
  const ntfyPort = await freePort();
  await new Promise((resolve) => ntfyServer.listen(ntfyPort, '127.0.0.1', resolve));
  ntfyUrl = `http://127.0.0.1:${ntfyPort}`;

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: testDbPath, TZ: 'UTC',
      ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1', HOMEGLOW_DISABLE_CALENDAR_SYNC: '1', HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk; });
  serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk; });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if ((await fetch(`${baseUrl}/api/test`)).ok) break; } catch { /* starting */ }
    await delay(250);
  }
});

const stopServer = () => new Promise((resolve) => {
  if (!serverProcess || serverProcess.exitCode !== null) return resolve();
  serverProcess.once('close', resolve);
  serverProcess.kill();
  setTimeout(resolve, 5000);
});

test.after(async () => {
  await stopServer();
  await new Promise((resolve) => ntfyServer.close(resolve));
  await fake?.close();
  if (process.exitCode && serverLogs) console.error(serverLogs.slice(-4000));
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});

test('the address a tap opens is checked, kept and shared; the plugins that may notify are listed', async () => {
  const db = new Database(testDbPath);
  db.prepare('INSERT INTO plugins (plugin_id, filename, name, content, source, manifest_json) VALUES (?, ?, ?, ?, ?, ?)')
    .run('grill', 'Grill.html', 'Grill', '<html></html>', 'github', JSON.stringify({ id: 'grill', name: 'Grill', notify: true }));
  db.close();

  assert.deepEqual((await api('/api/notifications/settings')).body, { openUrl: null, plugins: [{ id: 'grill', name: 'Grill' }] });
  assert.equal((await put('/api/notifications/settings', { openUrl: 'ftp://homeglow.lan' })).status, 400);
  assert.equal((await put('/api/notifications/settings', { openUrl: 'http://me:pw@homeglow.lan' })).status, 400);
  const saved = await put('/api/notifications/settings', { openUrl: 'http://homeglow.lan:3000/' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.openUrl, 'http://homeglow.lan:3000');
  assert.equal((await api('/api/notifications/settings')).body.openUrl, 'http://homeglow.lan:3000');
  assert.deepEqual((await api('/api/notifications/devices')).body, { devices: [] });
});

test('ntfy is off until turned on; the token never leaves the server', async () => {
  const status = await api('/api/notifications/ntfy');
  assert.equal(status.status, 200);
  assert.equal(status.body.enabled, false);
  assert.equal(status.body.server, 'https://ntfy.sh');

  const saved = await put('/api/notifications/ntfy', { enabled: true, server: ntfyUrl, token: 'tk_route_secret' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.hasToken, true);
  for (const res of [saved, await api('/api/notifications/ntfy'), await api('/api/settings')]) {
    assert.ok(!JSON.stringify(res.body).includes('tk_route_secret'), 'no token in the response');
  }
  const settings = (await api('/api/settings')).body;
  assert.equal(settings.NTFY_TOKEN_ENC, undefined, 'the encrypted token is not handed to browsers either');

  assert.equal((await put('/api/notifications/ntfy', { server: 'ftp://nope' })).status, 400);

  const tested = await post('/api/notifications/ntfy/test', {});
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  assert.equal(published.at(-1).auth, 'Bearer tk_route_secret');
});

test('Home Assistant phones: none until connected, then each listed, turned on and tested', async () => {
  assert.deepEqual((await api('/api/notifications/ha/phones')).body, { connected: false, phones: [] });
  assert.equal((await put('/api/notifications/ha/phones/mobile_app_sam_s_pixel', {})).status, 400);

  assert.equal((await put('/api/connections/homeassistant', { url: fake.url, token: 'ha-secret' })).status, 200);
  const listed = await api('/api/notifications/ha/phones?fresh=1');
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.deepEqual(listed.body.phones.map((p) => [p.phoneId, p.name, p.platform, p.enabled]), [
    ['mobile_app_alex_s_iphone', "Alex's iPhone", 'ios', false],
    ['mobile_app_sam_s_pixel', "Sam's Pixel", 'android', false],
  ]);

  const on = await put('/api/notifications/ha/phones/mobile_app_sam_s_pixel', { events: ['chore.completed', 'plugin:grill'] });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  assert.equal(on.body.enabled, true);
  assert.equal((await put('/api/notifications/ha/phones/mobile_app_nobody', {})).status, 404);
  assert.equal((await put('/api/notifications/ha/phones/notify', {})).status, 400);

  fake.calls.length = 0;
  assert.equal((await post('/api/notifications/ha/phones/mobile_app_sam_s_pixel/test', {})).status, 200);
  assert.deepEqual(fake.calls, [{
    domain: 'notify',
    service: 'mobile_app_sam_s_pixel',
    data: {
      title: 'Notifications are working',
      message: "This is Sam's Pixel. Chore news will arrive here.",
      data: { priority: 'high', ttl: 0, tag: 'homeglow-test', clickAction: 'http://homeglow.lan:3000/' },
    },
  }]);
});

test('a finished chore reaches the ntfy topic and the phone; a plugin\'s urgent message rings', async () => {
  const kid = (await post('/api/users', { username: 'Ava', email: 'ava@example.com' })).body.id;
  const made = await post('/api/notifications/ntfy/topics', { label: "Mom's phone", topic: 'homeglow-route-mom', language: 'en' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await post('/api/notifications/ntfy/topics', { label: 'Again', topic: 'homeglow-route-mom' })).status, 400);
  assert.equal((await post('/api/notifications/ntfy/topics', { label: 'Bad', topic: 'has spaces' })).status, 400);

  const listed = await api('/api/notifications/ntfy/topics');
  assert.equal(listed.body.enabled, true);
  assert.deepEqual(listed.body.topics.map((t) => t.topic), ['homeglow-route-mom']);

  published.length = 0;
  assert.equal((await post(`/api/notifications/ntfy/topics/${made.body.id}/test`, {})).status, 200);
  assert.equal(published[0].body.topic, 'homeglow-route-mom');
  assert.equal(published[0].body.title, 'Notifications are working');

  // A real completion, through the chore routes.
  const chore = (await post('/api/chores', { title: 'Feed the cat', clam_value: 2 })).body.id;
  const schedule = (await post('/api/chore-schedules', { chore_id: chore, user_id: kid, crontab: '0 0 * * *' })).body.id;
  published.length = 0;
  fake.calls.length = 0;
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await post('/api/chores/complete', { chore_schedule_id: schedule, user_id: kid, date: today })).status, 200);
  assert.ok(await until(() => published.length && fake.calls.length), JSON.stringify({ published, calls: fake.calls }));
  const message = published.find((p) => p.body.title === 'Ava finished Feed the cat');
  assert.ok(message, JSON.stringify(published));
  assert.equal(message.body.topic, 'homeglow-route-mom');
  assert.equal(message.body.message, '+2 clams');
  assert.equal(message.body.click, 'http://homeglow.lan:3000/');
  assert.deepEqual(fake.calls.map((c) => [c.service, c.data.title, c.data.message]),
    [['mobile_app_sam_s_pixel', 'Ava finished Feed the cat', '+2 clams']]);

  // A plugin's urgent message: only the phone ticked it, and it rings.
  fake.calls.length = 0;
  published.length = 0;
  const sent = await post('/api/plugin/v1/notify/grill', { message: 'The grill is on fire.', urgent: true });
  assert.deepEqual(sent.body, { sent: 1 });
  assert.equal(fake.calls[0].data.data.channel, 'alarm_stream');
  assert.equal(published.length, 0, 'the ntfy topic did not tick the plugin');
  assert.equal((await post('/api/plugin/v1/notify/grill', { message: 'x', urgent: 'very' })).status, 400);

  // A refused publish is recorded on the topic.
  refuse = true;
  const failed = await post(`/api/notifications/ntfy/topics/${made.body.id}/test`, {});
  refuse = false;
  assert.equal(failed.status, 502);
  assert.match((await api('/api/notifications/ntfy/topics')).body.topics[0].lastFailure, /refused the access token/);

  const leo = (await post('/api/users', { username: 'Leo', email: 'leo@example.com' })).body.id;
  assert.deepEqual((await patch(`/api/notifications/ntfy/topics/${made.body.id}`, { members: [leo] })).body.members, [leo]);
  assert.equal((await del(`/api/notifications/ntfy/topics/${made.body.id}`)).status, 200);
  assert.equal((await api('/api/notifications/ntfy/topics')).body.topics.length, 0);
});

test('turned off, ntfy keeps its topics but sends nothing; a phone turned off is forgotten', async () => {
  const made = await post('/api/notifications/ntfy/topics', { label: 'Kept', topic: 'homeglow-route-kept' });
  assert.equal((await put('/api/notifications/ntfy', { enabled: false })).status, 200);
  assert.equal((await post(`/api/notifications/ntfy/topics/${made.body.id}/test`, {})).status, 400);
  assert.equal((await api('/api/notifications/ntfy/topics')).body.topics.length, 1);

  assert.deepEqual((await del('/api/notifications/ha/phones/mobile_app_sam_s_pixel')).body, { enabled: false });
  assert.equal((await post('/api/notifications/ha/phones/mobile_app_sam_s_pixel/test', {})).status, 404);
  const phones = (await api('/api/notifications/ha/phones')).body.phones;
  assert.ok(phones.every((p) => !p.enabled));
});
