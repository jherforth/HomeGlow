// Stacks and Home Assistant, end to end: a real HomeGlow server on a
// throwaway database, connected to a fake Home Assistant.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');
const { startFakeHomeAssistant } = require('./helpers/fakeHomeAssistant');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `widget-stacks-ha-${process.pid}-${Date.now()}.db`);
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
  return { status: response.status, body, headers: response.headers };
}
const put = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body) });
const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fake = await startFakeHomeAssistant({ token: 'ha-secret' });
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk; });
  serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk; });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      if ((await fetch(`${baseUrl}/api/test`)).ok) break;
    } catch { /* starting */ }
    await delay(250);
  }
  const saved = await put('/api/connections/homeassistant', { url: fake.url, token: 'ha-secret' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
});

// Wait for the server to exit: Windows won't delete a database it still has open.
const stopServer = () => new Promise((resolve) => {
  if (!serverProcess || serverProcess.exitCode !== null) return resolve();
  serverProcess.once('close', resolve);
  serverProcess.kill();
  setTimeout(resolve, 5000);
});

test.after(async () => {
  await stopServer();
  await fake?.close();
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});


const D = '/api/devices/hall-wall';
const stacks = [{
  id: 'hall1234',
  widgets: ['calendar', 'weather', 'plugin:Grill.html'],
  attention: [{ widget: 'plugin:Grill.html', entity: 'switch.coffee', op: 'is', state: 'on' }],
}];

test('a display reads only what its Stacks bring to front for', async () => {
  const saved = await patch(`${D}/settings`, {
    widgetStacks: { stacks },
    displayModes: { modes: [{ id: 'm', name: 'Guest', schedule: null, when: { entity: 'input_boolean.guest_mode', state: 'on' } }] },
  });
  assert.equal(saved.status, 200);
  const { status, body } = await api(`${D}/stacks/ha`);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.connected, true);
  assert.deepEqual(Object.keys(body.states), ['switch.coffee']);
  assert.equal(body.states['switch.coffee'].attributes.friendly_name, 'Coffee maker');
});

test('no Stacks, nothing read', async () => {
  const { body } = await api('/api/devices/empty-wall/stacks/ha');
  assert.equal(body.connected, true);
  assert.deepEqual(body.states, {});
});

test('the picker lists entities by name', async () => {
  const { status, body } = await api(`${D}/stacks/ha/entities`);
  assert.equal(status, 200, JSON.stringify(body));
  const names = body.entities.map((e) => e.name);
  assert.ok(body.entities.some((e) => e.entity_id === 'switch.coffee'));
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});
