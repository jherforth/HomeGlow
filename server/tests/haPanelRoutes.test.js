// Home Assistant panels (issue #252), end to end: a real HomeGlow server on a
// throwaway database, connected to a fake Home Assistant. Builds panels, reads
// and operates them, and checks every refusal the server owes the household.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');
const { startFakeHomeAssistant } = require('./helpers/fakeHomeAssistant');

// Areas and live changes come over Home Assistant's WebSocket, which needs
// Node's built-in client (Node 22 and later; the Docker image runs 24).
const needsWebSocket = typeof globalThis.WebSocket === 'function' ? {} : { skip: 'needs Node 22 or later (built-in WebSocket)' };

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `ha-panels-${process.pid}-${Date.now()}.db`);
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
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const put = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body) });
const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });
const del = (p) => api(p, { method: 'DELETE' });

const kitchen = {
  name: 'Kitchen',
  tiles: [
    { id: 'lights', entities: ['light.kitchen'] },
    { id: 'coffee', entities: ['switch.coffee'], hold: true },
    { id: 'garage', entities: ['cover.garage_door'] },
    { id: 'front', entities: ['lock.front_door'] },
    { id: 'alarm', entities: ['alarm_control_panel.home'], view: true },
    { id: 'temp', entities: ['sensor.outside_temp'], when: { entity: 'person.sam', states: ['home'] } },
    { id: 'porch', entities: ['camera.porch'] },
  ],
};

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

let panel;

test('the builder lists what can go on a panel, with areas, leaving hidden entities out', needsWebSocket, async () => {
  const { status, body } = await api('/api/ha-panels/entities');
  assert.equal(status, 200, JSON.stringify(body));
  const ids = body.entities.map((entity) => entity.entity_id);
  assert.ok(ids.includes('light.kitchen'));
  assert.ok(!ids.includes('switch.secret_hidden'), 'hidden in Home Assistant');
  assert.ok(!ids.includes('automation.morning'), 'not something a panel shows');
  assert.equal(body.entities.find((e) => e.entity_id === 'light.kitchen').area, 'Kitchen');
  assert.equal(body.entities.find((e) => e.entity_id === 'cover.living_shade').area, 'Living room', 'area from the device');
  assert.equal(body.entities.find((e) => e.entity_id === 'cover.garage_door').sensitive, true);
  assert.ok(body.areas.some((area) => area.name === 'Outside'));
});

test('a saved panel becomes a plugin that serves the template with its recipe', async () => {
  const created = await post('/api/ha-panels', { recipe: kitchen });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  panel = created.body.panel;
  assert.equal(panel.pluginId, 'ha-kitchen');
  assert.equal(panel.filename, 'ha-kitchen.html');

  const plugins = await api('/api/widgets');
  const row = plugins.body.find((p) => p.filename === 'ha-kitchen.html');
  assert.ok(row, 'listed with the plugins');
  assert.equal(row.source, 'builder');
  assert.deepEqual(row.manifest.hideableControls.map((c) => c.id), ['operate']);

  const page = await api('/widgets/ha-kitchen.html');
  assert.match(page.body, /window\.__HA_PANEL__=/);
  assert.match(page.body, /"pluginId":"ha-kitchen"/);
  assert.match(page.body, /window\.__HOMEGLOW_PLUGIN__=\{id:"ha-kitchen"/);
  assert.doesNotMatch(page.body, /ha-secret/, 'the token never reaches a page');

  // An upload of the same file name must not replace the panel.
  const clash = new FormData();
  clash.append('file', new Blob(['<html><body>hi</body></html>'], { type: 'text/html' }), 'ha-kitchen.html');
  assert.equal((await fetch(`${baseUrl}/api/widgets/upload`, { method: 'POST', body: clash })).status, 409);
  assert.match((await api('/widgets/ha-kitchen.html')).body, /__HA_PANEL__/);

  const again = await post('/api/ha-panels', { recipe: kitchen });
  assert.equal(again.body.panel.pluginId, 'ha-kitchen-2', 'a second panel of the same name gets its own id');
  await del(`/api/ha-panels/${again.body.panel.id}`);
});

test('a panel reads only its own entities, and only the attributes it needs', async () => {
  const { status, body } = await api('/api/plugin/v1/ha/ha-kitchen/state');
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(Object.keys(body.entities).sort(), [
    'alarm_control_panel.home', 'camera.porch', 'cover.garage_door', 'light.kitchen', 'lock.front_door', 'person.sam', 'sensor.outside_temp', 'switch.coffee',
  ]);
  assert.equal(body.entities['light.kitchen'].state, 'on');
  assert.ok(!('switch.secret_hidden' in body.entities));
  assert.ok(!body.control.includes('alarm_control_panel.home'), 'view-only tile');
  assert.equal(body.unit, '°F');
  assert.equal(body.pinProtection, true);
});

test('a panel operates its own entities, and nothing else', async () => {
  const before = fake.calls.length;
  const ok = await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'light.kitchen', action: 'brightness', value: 40, device: 'kitchen-tablet' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(fake.calls.at(-1), { domain: 'light', service: 'turn_on', data: { brightness_pct: 40, entity_id: 'light.kitchen' } });
  assert.equal(ok.body.entities['light.kitchen'].attributes.brightness, 102);

  const refusals = [
    [{ entity: 'switch.secret_hidden', action: 'turn_on' }, 403],
    [{ entity: 'alarm_control_panel.home', action: 'disarm' }, 403],
    [{ entity: 'sensor.outside_temp', action: 'toggle' }, 400],
    [{ entity: 'light.kitchen', action: '__proto__' }, 400],
    [{ entity: 'person.sam', action: 'toggle' }, 403],
  ];
  for (const [body, status] of refusals) {
    const res = await post('/api/plugin/v1/ha/ha-kitchen/action', body);
    assert.equal(res.status, status, `${body.entity} ${body.action}: ${JSON.stringify(res.body)}`);
  }
  assert.equal(fake.calls.length, before + 1, 'no refused action reached Home Assistant');
  assert.equal((await post('/api/plugin/v1/ha/no-such-plugin/action', { entity: 'light.kitchen', action: 'toggle' })).status, 404);
});

test('opening a garage, unlocking and disarming need the PIN when protection is on', async () => {
  await delay(1100); // a fresh rate-limit window
  // No household PIN yet: nothing to ask for.
  assert.equal((await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'cover.garage_door', action: 'open' })).status, 200);
  assert.equal((await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'cover.garage_door', action: 'close' })).status, 200);

  assert.equal((await post('/api/admin-pin/set', { pin: '2468' })).status, 200);
  const asked = await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'lock.front_door', action: 'unlock', device: 'hallway' });
  assert.equal(asked.status, 401);
  assert.equal(asked.body.needsPin, true);
  assert.equal(fake.states.get('lock.front_door').state, 'locked');

  assert.equal((await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'lock.front_door', action: 'unlock', pin: '1111' })).status, 401);
  assert.equal((await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'lock.front_door', action: 'unlock', pin: '2468' })).status, 200);
  assert.equal(fake.states.get('lock.front_door').state, 'unlocked');
  // Locking again closes the home up: no PIN.
  assert.equal((await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'lock.front_door', action: 'lock' })).status, 200);
});

test('a display that remembers the PIN is trusted with it', async () => {
  await delay(1100);
  await patch('/api/devices/kids-room/settings', { adminPinRemembered: true });
  const res = await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'cover.garage_door', action: 'open', device: 'kids-room' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const other = await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'cover.garage_door', action: 'open', device: 'hallway' });
  assert.equal(other.status, 401);
});

test('turning PIN protection off lets the household decide', async () => {
  await delay(1100);
  assert.equal((await put('/api/ha-panels/settings', { pinProtection: false })).status, 200);
  const res = await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'lock.front_door', action: 'unlock', device: 'hallway' });
  assert.equal(res.status, 200);
  assert.equal((await api('/api/plugin/v1/ha/ha-kitchen/state')).body.pinProtection, false);
  await put('/api/ha-panels/settings', { pinProtection: true });
});

test('too many presses at once are refused', async () => {
  await delay(1100);
  const results = await Promise.all(Array.from({ length: 14 }, () => post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'switch.coffee', action: 'toggle' })));
  assert.ok(results.some((r) => r.status === 429), 'some were refused');
  await delay(1100);
});

test('the history records what panels did, from which display', async () => {
  const { body } = await api('/api/ha-panels/history?limit=100');
  const unlock = body.actions.find((a) => a.entity === 'lock.front_door' && a.action === 'unlock' && a.ok);
  assert.ok(unlock);
  assert.equal(unlock.panel, 'Kitchen');
  assert.ok(body.actions.some((a) => a.error === 'PIN needed' && a.device === 'hallway'));
});

test('a camera on the panel is proxied; other cameras are not', async () => {
  const res = await fetch(`${baseUrl}/api/plugin/v1/ha/ha-kitchen/camera/camera.porch`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${baseUrl}/api/plugin/v1/ha/ha-kitchen/camera/camera.garage`)).status, 404);
});

test('editing keeps the plugin id; deleting the plugin deletes the panel', async () => {
  const edited = await put(`/api/ha-panels/${panel.id}`, { recipe: { ...kitchen, name: 'Kitchen wall', tiles: kitchen.tiles.slice(0, 2) } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.panel.pluginId, 'ha-kitchen', 'displays keep naming the same plugin');
  assert.equal(edited.body.panel.name, 'Kitchen wall');
  const state = await api('/api/plugin/v1/ha/ha-kitchen/state');
  assert.deepEqual(Object.keys(state.body.entities).sort(), ['light.kitchen', 'switch.coffee']);
  assert.equal((await post('/api/plugin/v1/ha/ha-kitchen/action', { entity: 'lock.front_door', action: 'lock' })).status, 403, 'removed tile, removed access');

  const copy = await post(`/api/ha-panels/${panel.id}/duplicate`, {});
  assert.equal(copy.body.panel.name, 'Kitchen wall copy');

  assert.equal((await del('/api/widgets/ha-kitchen.html')).status, 200);
  const list = await api('/api/ha-panels');
  assert.ok(!list.body.panels.some((p) => p.id === panel.id), 'the recipe went with its plugin');
  assert.equal((await api('/api/plugin/v1/ha/ha-kitchen/state')).status, 404);
});

test('a recipe from another home is imported with its entities swapped', async () => {
  const res = await post('/api/ha-panels/import', {
    recipe: { name: 'Shared', tiles: [{ id: 'a', entities: ['light.their_kitchen'] }, { id: 'b', entities: ['light.gone'] }] },
    replacements: { 'light.their_kitchen': 'light.kitchen' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.panel.recipe.tiles.map((t) => t.entities[0]), ['light.kitchen', 'light.gone']);
  assert.deepEqual(res.body.missing, ['light.gone']);
  assert.equal((await post('/api/ha-panels/import', { recipe: { name: 'Bad', tiles: [{ id: 'a', entities: ['shell_command.x'] }] } })).status, 400);
});

test('the builder previews any entity, read only', async () => {
  const res = await api('/api/ha-panels/preview-state?entities=light.kitchen,lock.front_door,not-an-entity');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.entities).sort(), ['light.kitchen', 'lock.front_door']);
  const page = await api('/ha-panels/preview');
  assert.match(page.body, /"preview":true/);
});

test('a hand-written plugin gets the same access through its manifest', async () => {
  const html = `<!DOCTYPE html><html><head><script type="application/json" id="homeglow-manifest">${JSON.stringify({
    manifestVersion: 1, id: 'porch-light', name: 'Porch light', homeAssistant: { entities: ['light.kitchen', 'sensor.outside_temp'] },
  })}</script></head><body></body></html>`;
  const form = new FormData();
  form.append('file', new Blob([html], { type: 'text/html' }), 'porch-light.html');
  const uploaded = await fetch(`${baseUrl}/api/widgets/upload`, { method: 'POST', body: form });
  assert.equal(uploaded.status, 200, await uploaded.text());
  const state = await api('/api/plugin/v1/ha/porch-light/state');
  assert.deepEqual(Object.keys(state.body.entities).sort(), ['light.kitchen', 'sensor.outside_temp']);
  assert.equal((await post('/api/plugin/v1/ha/porch-light/action', { entity: 'light.kitchen', action: 'toggle' })).status, 200);
  assert.equal((await post('/api/plugin/v1/ha/porch-light/action', { entity: 'lock.front_door', action: 'unlock', pin: '2468' })).status, 403);

  const bad = new FormData();
  bad.append('file', new Blob([html.replace('"light.kitchen"', '"shell_command.reboot"')], { type: 'text/html' }), 'bad.html');
  assert.equal((await fetch(`${baseUrl}/api/widgets/upload`, { method: 'POST', body: bad })).status, 400);
});

test('a change in the home reaches the panel through the live link', needsWebSocket, async () => {
  const created = await post('/api/ha-panels', { recipe: { name: 'Live', tiles: [{ id: 'a', entities: ['switch.coffee'] }] } });
  assert.equal(created.status, 200);
  await api('/api/plugin/v1/ha/ha-live/state');
  const start = Date.now();
  while (fake.subscriptionCount() === 0 && Date.now() - start < 5000) await delay(50);
  assert.ok(fake.subscriptionCount() > 0, 'HomeGlow subscribed');
  fake.setState('switch.coffee', 'on');
  let state;
  for (let i = 0; i < 50; i += 1) {
    state = (await api('/api/plugin/v1/ha/ha-live/state')).body;
    if (state.entities['switch.coffee'].state === 'on' && state.live) break;
    await delay(50);
  }
  assert.equal(state.entities['switch.coffee'].state, 'on');
  assert.equal(state.live, true);
});

test('recipes the server cannot accept are refused with reasons', async () => {
  const res = await post('/api/ha-panels', { recipe: { name: 'x'.repeat(41), tiles: [{ id: 'A!', entities: ['light.kitchen'] }] } });
  assert.equal(res.status, 400);
  assert.ok(res.body.errors.length >= 2);
});
