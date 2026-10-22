// Phone notifications from plugins, end to end: a real HomeGlow server on a
// throwaway database, a fake Home Assistant with two Companion app phones,
// and a stand-in for Pushover. Lists phones both ways, sends and clears
// through each, and checks every refusal.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');
const { startFakeHomeAssistant } = require('./helpers/fakeHomeAssistant');

// Phone names come from Home Assistant's device registry, over its WebSocket.
const needsWebSocket = typeof globalThis.WebSocket === 'function' ? {} : { skip: 'needs Node 22 or later (built-in WebSocket)' };

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `plugin-notify-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const TOKEN = 'azGDORePK8gMaC0QOYAMyEEuzJnyUi';
const USER = 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG';
let baseUrl;
let serverProcess;
let fake;
let pushoverServer;
const pushoverCalls = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const put = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body) });
const del = (p) => api(p, { method: 'DELETE' });

async function uploadPlugin(filename, manifest) {
  const html = `<!DOCTYPE html><html><head><script type="application/json" id="homeglow-manifest">${JSON.stringify(manifest)}</script></head><body></body></html>`;
  const form = new FormData();
  form.append('file', new Blob([html], { type: 'text/html' }), filename);
  const res = await fetch(`${baseUrl}/api/widgets/upload`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Pushover's API, as far as HomeGlow uses it.
function startFakePushover() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const fields = Object.fromEntries(new URLSearchParams(body));
        pushoverCalls.push({ path: req.url, fields });
        const send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
        if (fields.token !== TOKEN) return send(400, { status: 0, errors: ['application token is invalid'] });
        if (req.url === '/1/users/validate.json') {
          return fields.user === USER ? send(200, { status: 1, group: 0, devices: ['pixel8', 'ipad'] }) : send(400, { status: 0, errors: ['user key is invalid'] });
        }
        if (req.url === '/1/messages.json') return send(200, { status: 1, request: 'req-1', ...(fields.priority === '2' ? { receipt: 'rcpt-1' } : {}) });
        if (req.url.startsWith('/1/receipts/cancel_by_tag/')) return send(200, { status: 1, canceled: 1 });
        return send(404, { status: 0, errors: ['not found'] });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fake = await startFakeHomeAssistant({ token: 'ha-secret' });
  pushoverServer = await startFakePushover();
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: testDbPath,
      TZ: 'UTC',
      ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
      HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
      HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
      HOMEGLOW_PUSHOVER_API_BASE: `http://127.0.0.1:${pushoverServer.address().port}`,
    },
    stdio: 'ignore',
  });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      if ((await fetch(`${baseUrl}/api/test`)).ok) break;
    } catch { /* starting */ }
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
  await fake?.close();
  await new Promise((resolve) => (pushoverServer ? pushoverServer.close(resolve) : resolve()));
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});

test('a plugin must say "notify": true, and some way to reach phones must be set up', async () => {
  assert.equal((await uploadPlugin('bad-notify.html', { manifestVersion: 1, id: 'bad-notify', notify: 'yes' })).status, 400);
  const up = await uploadPlugin('phone-test.html', { manifestVersion: 1, id: 'phone-test', name: 'Phone test', notify: true });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const quiet = await uploadPlugin('no-phones.html', { manifestVersion: 1, id: 'no-phones', name: 'No phones' });
  assert.equal(quiet.status, 200, JSON.stringify(quiet.body));

  // Nothing set up yet.
  const none = await api('/api/plugin/v1/notify/phone-test/phones');
  assert.equal(none.status, 503);
  assert.equal(none.body.notConnected, true);
  assert.equal((await api('/api/plugin/v1/notify/no-phones/phones')).status, 403);
  assert.equal((await post('/api/plugin/v1/notify/no-phones', { phones: ['pushover'], message: 'hi' })).status, 403);
  assert.equal((await api('/api/plugin/v1/notify/nobody/phones')).status, 404);
});

test('Pushover: keys saved blind and encrypted, checked by Send test', async () => {
  assert.equal((await put('/api/connections/pushover', { token: 'nope', user: USER })).status, 400);
  const saved = await put('/api/connections/pushover', { token: TOKEN, user: USER });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.status, { has_token: true, has_user: true, configured: true, encryption_configured: true });
  const settings = await api('/api/settings');
  assert.ok(!JSON.stringify(settings.body).includes(TOKEN) && !JSON.stringify(settings.body).includes('PUSHOVER'), 'never in the settings list');

  const tested = await post('/api/connections/pushover/test', {});
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  assert.deepEqual(tested.body, { ok: true, group: false, devices: ['pixel8', 'ipad'] });
  assert.equal(pushoverCalls.at(-1).path, '/1/messages.json');
  assert.equal(pushoverCalls.at(-1).fields.title, 'HomeGlow');
});

test('Pushover alone: its devices are the phones, and urgent is emergency priority', async () => {
  const listed = await api('/api/plugin/v1/notify/phone-test/phones');
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.deepEqual(listed.body.phones, [
    { id: 'pushover:pixel8', name: 'pixel8 (Pushover)', platform: null, via: 'pushover' },
    { id: 'pushover:ipad', name: 'ipad (Pushover)', platform: null, via: 'pushover' },
  ]);
  const sent = await post('/api/plugin/v1/notify/phone-test', {
    phones: ['pushover:pixel8', 'pushover:ipad'], title: 'Grill', message: 'Grill is 310°, set to 250°.', urgent: true, tag: 'problem', device: 'Kitchen',
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.deepEqual(sent.body, { ok: true, results: { 'pushover:pixel8': { ok: true }, 'pushover:ipad': { ok: true } } });
  assert.deepEqual(pushoverCalls.at(-1), {
    path: '/1/messages.json',
    fields: { token: TOKEN, user: USER, message: 'Grill is 310°, set to 250°.', title: 'Grill', device: 'pixel8,ipad', priority: '2', retry: '60', expire: '3600', tags: 'homeglow-phone-test-problem' },
  });
  const cleared = await post('/api/plugin/v1/notify/phone-test/clear', { phones: ['pushover:pixel8'], tag: 'problem' });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(pushoverCalls.at(-1).path, '/1/receipts/cancel_by_tag/homeglow-phone-test-problem.json');
});

test('Home Assistant and Pushover together: each phone the way it is reached', needsWebSocket, async () => {
  await delay(1100);
  assert.equal((await put('/api/connections/homeassistant', { url: fake.url, token: 'ha-secret' })).status, 200);
  const listed = await api('/api/plugin/v1/notify/phone-test/phones');
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.deepEqual(listed.body.phones.map((p) => [p.id, p.platform, p.via]), [
    ['mobile_app_alex_s_iphone', 'ios', 'home_assistant'],
    ['mobile_app_sam_s_pixel', 'android', 'home_assistant'],
    ['pushover:pixel8', null, 'pushover'],
    ['pushover:ipad', null, 'pushover'],
  ]);
  const before = { ha: fake.calls.length, po: pushoverCalls.length };
  const sent = await post('/api/plugin/v1/notify/phone-test', {
    phones: ['mobile_app_sam_s_pixel', 'mobile_app_alex_s_iphone', 'pushover:ipad'], title: 'Grill', message: 'Brisket reached 203°.', urgent: true, tag: 'food',
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const haCalls = fake.calls.slice(before.ha);
  assert.deepEqual(haCalls.find((c) => c.service === 'mobile_app_sam_s_pixel').data,
    { title: 'Grill', message: 'Brisket reached 203°.', data: { priority: 'high', ttl: 0, channel: 'alarm_stream', tag: 'homeglow-phone-test-food' } });
  assert.deepEqual(haCalls.find((c) => c.service === 'mobile_app_alex_s_iphone').data.data,
    { push: { sound: { name: 'default', critical: 1, volume: 1.0 } }, tag: 'homeglow-phone-test-food' });
  assert.equal(pushoverCalls.length - before.po, 1);
  assert.equal(pushoverCalls.at(-1).fields.device, 'ipad');

  const history = await api('/api/ha-panels/history?limit=10');
  assert.ok(history.body.actions.some((a) => a.pluginId === 'phone-test' && a.entity === 'notify.mobile_app_alex_s_iphone' && a.action === 'notify (urgent)'), JSON.stringify(history.body.actions));
  assert.ok(history.body.actions.some((a) => a.pluginId === 'phone-test' && a.entity === 'pushover:ipad'));
});

test('only phones, only text: anything else is refused before it goes out', needsWebSocket, async () => {
  await delay(1100);
  const before = { ha: fake.calls.length, po: pushoverCalls.length };
  const send = (body) => post('/api/plugin/v1/notify/phone-test', { message: 'hi', ...body });
  assert.equal((await send({ phones: ['notify'] })).status, 404, 'notify.notify is no phone');
  assert.equal((await send({ phones: ['persistent_notification'] })).status, 404);
  assert.equal((await send({ phones: ['pushover:someone-else'] })).status, 404);
  assert.equal((await send({ phones: [] })).status, 400);
  await delay(1100);
  assert.equal((await send({ phones: ['mobile_app_sam_s_pixel'], message: '  ' })).status, 400);
  assert.equal((await send({ phones: ['mobile_app_sam_s_pixel'], urgent: 'loud' })).status, 400);
  assert.equal((await send({ phones: ['mobile_app_sam_s_pixel'], tag: 'Not OK!' })).status, 400);
  assert.equal(fake.calls.length, before.ha, 'nothing refused reached Home Assistant');
  assert.equal(pushoverCalls.length, before.po, 'or Pushover');

  // Notify data of the plugin's own never reaches a phone.
  await delay(1100);
  const sneaky = await send({ phones: ['mobile_app_sam_s_pixel'], data: { command: 'command_activity', clickAction: 'https://evil.example' } });
  assert.equal(sneaky.status, 200, JSON.stringify(sneaky.body));
  assert.deepEqual(fake.calls.at(-1).data, { message: 'hi', data: { priority: 'high', ttl: 0 } });
});

test('a plugin sends at most 30 messages a minute', async () => {
  const up = await uploadPlugin('phone-busy.html', { manifestVersion: 1, id: 'phone-busy', notify: true });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  let refused = 0;
  for (let i = 0; i < 31; i += 1) {
    if (i && i % 9 === 0) await delay(1100);   // stay under 10 a second
    const res = await post('/api/plugin/v1/notify/phone-busy', { phones: ['pushover:pixel8'], message: `n${i}` });
    if (res.status === 429) refused += 1;
  }
  assert.equal(refused, 1);
  await del('/api/widgets/phone-busy.html');
});

test('removing Pushover leaves Home Assistant\'s phones', needsWebSocket, async () => {
  assert.equal((await del('/api/connections/pushover')).status, 200);
  const listed = await api('/api/plugin/v1/notify/phone-test/phones');
  assert.deepEqual(listed.body.phones.map((p) => p.via), ['home_assistant', 'home_assistant']);
});
