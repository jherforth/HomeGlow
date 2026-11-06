// Display modes and Home Assistant, end to end: a real HomeGlow server on a
// throwaway database, connected to a fake Home Assistant.
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
const testDbPath = path.join(tmpDir, `display-modes-ha-${process.pid}-${Date.now()}.db`);
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


const D = '/api/devices/kitchen-wall';
const modes = [
  { id: 'morning', name: 'Morning', schedule: null, alarm: { entity: 'sensor.pixel_next_alarm', until: '09:00' }, onlyHome: ['person.jason'] },
  { id: 'guest', name: 'Guest', schedule: null, when: { entity: 'input_boolean.guest_mode', state: 'on' } },
];

test('without a helper, a display reads only what its modes name', async () => {
  const saved = await patch(`${D}/settings`, { displayModes: { modes, ha: { wake: ['person.wife'] } } });
  assert.equal(saved.status, 200);
  const { status, body } = await api(`${D}/modes/ha`);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.connected, true);
  assert.deepEqual(Object.keys(body.states).sort(), ['input_boolean.guest_mode', 'person.jason', 'person.wife', 'sensor.pixel_next_alarm']);
  assert.equal(body.states['person.jason'].state, 'home');
  assert.deepEqual(Object.keys(body.states['person.jason'].attributes), ['friendly_name'], 'no other attributes');
});

test('the pickers list helpers, alarms (next alarm first) and people', async () => {
  const alarm = await api(`${D}/modes/ha/entities?kind=alarm`);
  assert.equal(alarm.body.entities[0].entity_id, 'sensor.pixel_next_alarm');
  const people = await api(`${D}/modes/ha/entities?kind=people`);
  assert.deepEqual(people.body.entities.map((e) => e.entity_id).sort(), ['person.jason', 'person.sam', 'person.wife', 'zone.home']);
});

test('one tap makes the mode helper with Automatic, Normal and the modes', needsWebSocket, async () => {
  const made = await post(`${D}/modes/ha/helper`, { title: 'Kitchen display mode' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal(made.body.settings.displayModes.ha.helper, 'input_select.kitchen_display_mode');
  assert.deepEqual(fake.states.get('input_select.kitchen_display_mode').attributes.options, ['Automatic', 'Normal', 'Morning', 'Guest']);
  assert.deepEqual(made.body.settings.displayModes.modes.map((m) => m.id), ['morning', 'guest'], 'modes kept');

  const read = await api(`${D}/modes/ha`);
  assert.equal(read.body.states['input_select.kitchen_display_mode'].state, 'Automatic');
});

test('renamed or added modes reach the helper', needsWebSocket, async () => {
  const current = (await api(`${D}/settings`)).body.displayModes;
  const next = { ...current, modes: [...current.modes, { id: 'night', name: 'Night' }] };
  await patch(`${D}/settings`, { displayModes: next });
  const synced = await post(`${D}/modes/ha/sync`, {});
  assert.equal(synced.status, 200, JSON.stringify(synced.body));
  assert.deepEqual(fake.states.get('input_select.kitchen_display_mode').attributes.options, ['Automatic', 'Normal', 'Morning', 'Guest', 'Night']);
});

test('the wall sets its own helper, only to one of its options', async () => {
  const ok = await post(`${D}/modes/ha/select`, { option: 'Night' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(fake.states.get('input_select.kitchen_display_mode').state, 'Night');
  const bad = await post(`${D}/modes/ha/select`, { option: 'Party' });
  assert.equal(bad.status, 400);
});

test('the showing mode is posted to its own sensor', async () => {
  const sent = await post(`${D}/modes/ha/report`, { mode: 'Night', source: 'wall', pinned: true });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.sensor, 'sensor.homeglow_kitchen_display_showing');
  const sensor = fake.states.get('sensor.homeglow_kitchen_display_showing');
  assert.equal(sensor.state, 'Night');
  assert.equal(sensor.attributes.source, 'wall');
  assert.equal(sensor.attributes.pinned, true);
});

test('an existing dropdown can be used instead, and the helper let go', async () => {
  fake.setState('input_select.my_modes', 'x', { options: ['x'], friendly_name: 'My modes' });
  const used = await post(`${D}/modes/ha/helper`, { entity_id: 'input_select.my_modes' });
  assert.equal(used.status, 200, JSON.stringify(used.body));
  assert.equal(used.body.settings.displayModes.ha.helperId, null);
  assert.deepEqual(fake.states.get('input_select.my_modes').attributes.options, ['Automatic', 'Normal', 'Morning', 'Guest', 'Night']);
  const notADropdown = await post(`${D}/modes/ha/helper`, { entity_id: 'light.kitchen' });
  assert.equal(notADropdown.status, 400);
  const off = await post(`${D}/modes/ha/helper`, { entity_id: null });
  assert.equal(off.body.settings.displayModes.ha.helper, null);
  const noHelper = await post(`${D}/modes/ha/select`, { option: 'Night' });
  assert.equal(noHelper.status, 409);
});

// The helper is what /sync and /select write to, so only /helper (with the
// admin PIN) chooses it: a settings save can't point them at another dropdown.
test('a settings save keeps the helper the display has', async () => {
  fake.setState('input_select.house_mode', 'Home', { options: ['Home', 'Away', 'Vacation'], friendly_name: 'House mode' });
  const houseOptions = () => fake.states.get('input_select.house_mode').attributes.options;

  const current = (await api(`${D}/settings`)).body.displayModes;
  const sneaky = await patch(`${D}/settings`, { displayModes: { ...current, ha: { ...current.ha, helper: 'input_select.house_mode', helperId: 'house_mode' } } });
  assert.equal(sneaky.status, 200, JSON.stringify(sneaky.body));
  assert.equal(sneaky.body.displayModes.ha.helper, null, 'no helper taken from the save');
  assert.equal(sneaky.body.displayModes.ha.helperId, null);
  assert.equal((await post(`${D}/modes/ha/sync`, {})).body.synced, false);
  assert.equal((await post(`${D}/modes/ha/select`, { option: 'Normal' })).status, 409);
  assert.deepEqual(houseOptions(), ['Home', 'Away', 'Vacation'], 'the house helper is untouched');
  assert.equal(fake.states.get('input_select.house_mode').state, 'Home');

  const used = await post(`${D}/modes/ha/helper`, { entity_id: 'input_select.my_modes' });
  assert.equal(used.status, 200, JSON.stringify(used.body));
  const now = (await api(`${D}/settings`)).body.displayModes;
  const saved = await put(`${D}/settings`, { displayModes: { ...now, ha: { ...now.ha, helper: 'input_select.house_mode', helperId: null, wake: ['person.sam'] } } });
  assert.equal(saved.body.displayModes.ha.helper, 'input_select.my_modes', 'the chosen helper stays');
  assert.deepEqual(saved.body.displayModes.ha.wake, ['person.sam'], 'the rest of ha saves');
  const dropped = await patch(`${D}/settings`, { displayModes: { modes: now.modes } });
  assert.equal(dropped.body.displayModes.ha.helper, 'input_select.my_modes', 'a save without ha keeps it too');
  await post(`${D}/modes/ha/sync`, {});
  assert.deepEqual(houseOptions(), ['Home', 'Away', 'Vacation']);
});

test('copying another display\'s settings keeps this display\'s own helper', async () => {
  await patch('/api/devices/hall/settings', { displayModes: { modes } });
  const copied = await post('/api/devices/hall/copy-from/kitchen-wall', {});
  assert.equal(copied.status, 200, JSON.stringify(copied.body));
  const hall = (await api('/api/devices/hall/settings')).body;
  assert.deepEqual(hall.displayModes.modes.map((m) => m.id), ['morning', 'guest', 'night'], 'the modes are copied');
  assert.equal(hall.displayModes.ha.helper, undefined, 'the kitchen\'s helper is not');
});

test('choosing the helper of an unknown display is refused, and makes no display', async () => {
  const made = await post('/api/devices/not-a-display/modes/ha/helper', { entity_id: 'input_select.house_mode' });
  assert.equal(made.status, 404);
  const devices = (await api('/api/devices')).body;
  assert.ok(!JSON.stringify(devices).includes('not-a-display'));
  assert.deepEqual(fake.states.get('input_select.house_mode').attributes.options, ['Home', 'Away', 'Vacation']);
});

test('with an admin PIN set, choosing the helper needs it', async () => {
  assert.equal((await post('/api/admin-pin/set', { pin: '2468' })).status, 200);
  try {
    // A display that says it remembers the PIN still has to give it.
    await patch(`${D}/settings`, { adminPinRemembered: true });
    const none = await post(`${D}/modes/ha/helper`, { entity_id: 'input_select.house_mode' });
    assert.equal(none.status, 403, JSON.stringify(none.body));
    assert.equal(none.body.needsPin, true);
    const wrong = await post(`${D}/modes/ha/helper`, { entity_id: null, pin: '1111' });
    assert.equal(wrong.status, 403);
    assert.deepEqual(fake.states.get('input_select.house_mode').attributes.options, ['Home', 'Away', 'Vacation']);
    assert.equal((await api(`${D}/settings`)).body.displayModes.ha.helper, 'input_select.my_modes', 'nothing changed');

    const right = await post(`${D}/modes/ha/helper`, { entity_id: null, pin: '2468' });
    assert.equal(right.status, 200, JSON.stringify(right.body));
    assert.equal(right.body.settings.displayModes.ha.helper, null);
  } finally {
    await patch(`${D}/settings`, { adminPinRemembered: false });
    await api('/api/admin-pin', { method: 'DELETE', body: JSON.stringify({ pin: '2468' }) });
  }
});
