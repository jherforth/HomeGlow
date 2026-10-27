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
  assert.match(page.body, /"__HOMEGLOW_PLUGIN__",\{value:Object\.freeze\(\{id:"ha-kitchen"/);
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

// --- Music: a media player's library ------------------------------------------
// Browsing, searching and playing go through Home Assistant's own
// media_player/browse_media and search_media, and a panel plays only what
// HomeGlow showed it. Calls are spaced out to stay under the press limit.

const music = (pluginId, entityId, rest) => `/api/plugin/v1/ha/${pluginId}/media/${entityId}${rest}`;
const paced = async (request) => { await delay(120); return request(); };
let musicPanel;

test('a player\'s library opens a level at a time, by key, never showing a content id', needsWebSocket, async () => {
  const created = await post('/api/ha-panels', { recipe: { name: 'Music', tiles: [
    { id: 'music', entities: ['media_player.kitchen_music'], size: '2x2' },
    { id: 'radio', entities: ['media_player.living'] },
  ] } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  musicPanel = created.body.panel.pluginId;

  const root = await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/browse')));
  assert.equal(root.status, 200, JSON.stringify(root.body));
  assert.equal(root.body.title, 'Music Assistant');
  assert.deepEqual(root.body.items.map((item) => item.title), ['Playlists', 'Artists']);
  assert.doesNotMatch(JSON.stringify(root.body), /library:\/\//);

  const playlists = await paced(() => api(music(musicPanel, 'media_player.kitchen_music', `/browse?item=${root.body.items[0].key}`)));
  assert.equal(playlists.status, 200, JSON.stringify(playlists.body));
  const byTitle = Object.fromEntries(playlists.body.items.map((item) => [item.title, item]));
  assert.deepEqual(Object.keys(byTitle), ['Kitchen Mix', 'Dinner Jazz', 'Sneaky'], 'a dead end is left out');
  assert.equal(byTitle['Kitchen Mix'].thumb, 'https://images.example/kitchen-mix.jpg');
  assert.equal(byTitle.Sneaky.thumb, null, 'a script address is no picture');
  assert.match(byTitle['Dinner Jazz'].thumb, new RegExp(`^/api/plugin/v1/ha/${musicPanel}/media/media_player.kitchen_music/image/[\\w-]{22}$`));

  const picture = await paced(() => fetch(`${baseUrl}${byTitle['Dinner Jazz'].thumb}`));
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/png');
  assert.equal((await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/image/not-a-key')))).status, 404);

  const stale = await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/browse?item=not-a-key')));
  assert.equal(stale.status, 410);
  assert.equal(stale.body.stale, true);
});

test('playing takes a key from the library, never a content id', needsWebSocket, async () => {
  const root = await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/browse')));
  const playlists = await paced(() => api(music(musicPanel, 'media_player.kitchen_music', `/browse?item=${root.body.items[0].key}`)));
  const mix = playlists.body.items.find((item) => item.title === 'Kitchen Mix');

  const played = await paced(() => post(`/api/plugin/v1/ha/${musicPanel}/action`, { entity: 'media_player.kitchen_music', action: 'play_media', value: mix.key }));
  assert.equal(played.status, 200, JSON.stringify(played.body));
  assert.deepEqual(fake.calls.at(-1), {
    domain: 'media_player', service: 'play_media',
    data: { media_content_id: 'library://playlist/1', media_content_type: 'playlist', enqueue: 'replace', entity_id: 'media_player.kitchen_music' },
  });
  assert.equal(played.body.entities['media_player.kitchen_music'].state, 'playing');

  const before = fake.calls.length;
  for (const value of ['library://playlist/1', 'http://evil.example/stream.mp3', { media_content_id: 'library://playlist/1', media_content_type: 'playlist', fromLibrary: true }]) {
    const refused = await paced(() => post(`/api/plugin/v1/ha/${musicPanel}/action`, { entity: 'media_player.kitchen_music', action: 'play_media', value }));
    assert.equal(refused.status, 410, JSON.stringify(value));
  }
  // A key another panel was shown is no use here.
  const other = await post('/api/ha-panels', { recipe: { name: 'Other music', tiles: [{ id: 'm', entities: ['media_player.kitchen_music'] }] } });
  const borrowed = await paced(() => post(`/api/plugin/v1/ha/${other.body.panel.pluginId}/action`, { entity: 'media_player.kitchen_music', action: 'play_media', value: mix.key }));
  assert.equal(borrowed.status, 410);
  assert.equal(fake.calls.length, before, 'nothing refused reached Home Assistant');
  await del(`/api/ha-panels/${other.body.panel.id}`);
});

test('search finds music and remembers the panel\'s recent searches', needsWebSocket, async () => {
  const found = await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/search?q=heart')));
  assert.equal(found.status, 200, JSON.stringify(found.body));
  assert.deepEqual(found.body.items.map((item) => item.title), ['Heart of Gold']);
  assert.deepEqual(found.body.recent, ['heart']);
  assert.equal(fake.calls.at(-1).ws, 'search_media');

  await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/search?q=neil')));
  await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/search?q=Heart')));
  assert.deepEqual((await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/recent')))).body.recent, ['Heart', 'neil']);

  // What was found can be played.
  const played = await paced(() => post(`/api/plugin/v1/ha/${musicPanel}/action`, { entity: 'media_player.kitchen_music', action: 'play_media', value: found.body.items[0].key }));
  assert.equal(played.status, 200, JSON.stringify(played.body));
  assert.equal(fake.calls.at(-1).data.media_content_id, 'ytmusic://track/hog');

  assert.equal((await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/search?q=%20%20')))).status, 400);
  assert.deepEqual((await paced(() => del(music(musicPanel, 'media_player.kitchen_music', '/recent')))).body.recent, []);
  assert.deepEqual((await paced(() => api(music(musicPanel, 'media_player.kitchen_music', '/recent')))).body.recent, []);
});

test('shuffle, album and the playing picture, without its address', needsWebSocket, async () => {
  const shuffled = await paced(() => post(`/api/plugin/v1/ha/${musicPanel}/action`, { entity: 'media_player.kitchen_music', action: 'shuffle', value: true }));
  assert.equal(shuffled.status, 200, JSON.stringify(shuffled.body));
  const state = (await paced(() => api(`/api/plugin/v1/ha/${musicPanel}/state`))).body.entities['media_player.kitchen_music'];
  assert.equal(state.attributes.shuffle, true);
  assert.equal(typeof state.attributes.media_album_name, 'string');
  assert.match(state.attributes.media_art, /^[\w-]{12}$/);
  assert.doesNotMatch(JSON.stringify(state), /proxy-token|media_player_proxy/);

  const art = await paced(() => fetch(`${baseUrl}${music(musicPanel, 'media_player.kitchen_music', '/art')}?v=${state.attributes.media_art}`));
  assert.equal(art.status, 200);
  assert.equal(art.headers.get('content-type'), 'image/png');

  // A picture on the web (Music Assistant's own server, say, which a
  // display may not reach) comes through Home Assistant's proxy.
  fake.setState('media_player.kitchen_music', 'playing', { entity_picture: 'http://192.168.1.5:8095/imageproxy?path=cover.jpg' });
  for (let i = 0; i < 60; i += 1) {
    const now = (await api(`/api/plugin/v1/ha/${musicPanel}/state`)).body.entities['media_player.kitchen_music'];
    if (now.attributes.media_art !== state.attributes.media_art) break;
    await delay(50);
  }
  const fetchesBefore = fake.proxyFetches.length;
  const proxied = await paced(() => fetch(`${baseUrl}${music(musicPanel, 'media_player.kitchen_music', '/art')}`, { redirect: 'manual' }));
  assert.equal(proxied.status, 200);
  assert.equal(proxied.headers.get('content-type'), 'image/png');
  assert.equal(fake.proxyFetches.at(-1), '/api/media_player_proxy/media_player.kitchen_music');
  assert.equal(fake.proxyFetches.length, fetchesBefore + 1);
  // If Home Assistant can't fetch it either, the browser is sent to it.
  fake.setProxyBroken(true);
  try {
    const redirect = await paced(() => fetch(`${baseUrl}${music(musicPanel, 'media_player.kitchen_music', '/art')}`, { redirect: 'manual' }));
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), 'http://192.168.1.5:8095/imageproxy?path=cover.jpg');
  } finally {
    fake.setProxyBroken(false);
  }
});

test('a slow speaker: the panel hears "still working" at once, and sees the change when it comes', needsWebSocket, async () => {
  fake.setState('media_player.kitchen_music', 'playing', { media_title: 'Harvest Moon' });
  fake.setServiceDelay(3000);
  try {
    const started = Date.now();
    const skipped = await post(`/api/plugin/v1/ha/${musicPanel}/action`, { entity: 'media_player.kitchen_music', action: 'next' });
    const took = Date.now() - started;
    assert.equal(skipped.status, 200, JSON.stringify(skipped.body));
    assert.equal(skipped.body.pending, true);
    assert.ok(took < 2800, `answered after ${took} ms, not when the speaker finished`);
    assert.equal(skipped.body.entities['media_player.kitchen_music'].attributes.media_title, 'Harvest Moon');
    let title;
    for (let i = 0; i < 80; i += 1) {
      title = (await api(`/api/plugin/v1/ha/${musicPanel}/state`)).body.entities['media_player.kitchen_music'].attributes.media_title;
      if (title === 'Heart of Gold') break;
      await delay(100);
    }
    assert.equal(title, 'Heart of Gold', 'the new song shows once the speaker reports it');
  } finally {
    fake.setServiceDelay(0);
  }
});

test('a player that can\'t browse, a view-only tile and a player not on the panel are refused', needsWebSocket, async () => {
  const plain = await paced(() => api(music(musicPanel, 'media_player.living', '/browse')));
  assert.equal(plain.status, 400);
  assert.equal((await paced(() => api(music(musicPanel, 'media_player.living', '/search?q=jazz')))).status, 400);
  assert.equal((await paced(() => api(music(musicPanel, 'media_player.not_here', '/browse')))).status, 404);
  assert.equal((await paced(() => api(music('ha-kitchen', 'camera.porch', '/art')))).status, 404);

  const look = await post('/api/ha-panels', { recipe: { name: 'Look only', tiles: [{ id: 'm', entities: ['media_player.kitchen_music'], view: true }] } });
  const lookId = look.body.panel.pluginId;
  assert.equal((await paced(() => api(music(lookId, 'media_player.kitchen_music', '/browse')))).status, 403);
  assert.equal((await paced(() => api(music(lookId, 'media_player.kitchen_music', '/search?q=x')))).status, 403);
  const art = await paced(() => fetch(`${baseUrl}${music(lookId, 'media_player.kitchen_music', '/art')}`, { redirect: 'manual' }));
  assert.equal(art.status, 200, 'a view-only tile still shows the picture');
  await del(`/api/ha-panels/${look.body.panel.id}`);
  await del(`/api/ha-panels/${(await api('/api/ha-panels')).body.panels.find((p) => p.pluginId === musicPanel).id}`);
});

// --- A published plugin: a whole domain, and its own media server -----------
// A music plugin can't know a household's speakers, so its manifest grants
// media_player whole; and it may play addresses on the media server the
// household named in its settings (a Jellyfin server), and nowhere else.

async function uploadPlugin(filename, manifest) {
  const html = `<!DOCTYPE html><html><head><script type="application/json" id="homeglow-manifest">${JSON.stringify(manifest)}</script></head><body></body></html>`;
  const form = new FormData();
  form.append('file', new Blob([html], { type: 'text/html' }), filename);
  const res = await fetch(`${baseUrl}/api/widgets/upload`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const musicManifest = {
  manifestVersion: 1, id: 'music-test', name: 'Music test', apiVersion: 'v1',
  settings: [{ key: 'jellyfinUrl', label: 'Jellyfin address', type: 'string', default: '' }],
  homeAssistant: { domains: ['media_player'], playUrlsFrom: 'jellyfinUrl' },
};

test('a plugin granted media_player sees every speaker, and nothing else', async () => {
  await delay(1100);
  const up = await uploadPlugin('music-test.html', musicManifest);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const { status, body } = await api('/api/plugin/v1/ha/music-test/state');
  assert.equal(status, 200, JSON.stringify(body));
  const ids = Object.keys(body.entities).sort();
  assert.ok(ids.includes('media_player.living') && ids.includes('media_player.kitchen_music'), ids.join(','));
  assert.ok(ids.every((id) => id.startsWith('media_player.')), 'only media players');
  assert.deepEqual([...body.control].sort(), ids);
  assert.equal((await post('/api/plugin/v1/ha/music-test/action', { entity: 'light.kitchen', action: 'toggle' })).status, 403);
  assert.equal((await post('/api/plugin/v1/ha/music-test/action', { entity: 'media_player.living', action: 'play_pause' })).status, 200);
});

test('a plugin groups speakers it may operate, and nothing else', async () => {
  await delay(1100);
  const up = await uploadPlugin('music-grp.html', { ...musicManifest, id: 'music-grp' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const GROUPABLE = 524288 | 16384 | 1 | 4;
  fake.setState('media_player.ma_kitchen', 'playing', { friendly_name: 'Kitchen', supported_features: GROUPABLE, group_members: ['media_player.ma_kitchen'] });
  fake.setState('media_player.ma_den', 'idle', { friendly_name: 'Den', supported_features: GROUPABLE, group_members: ['media_player.ma_den'] });
  const act = (entity, action, value) => post('/api/plugin/v1/ha/music-grp/action', { entity, action, ...(value === undefined ? {} : { value }) });

  const joined = await act('media_player.ma_kitchen', 'join', ['media_player.ma_den']);
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.deepEqual(fake.calls.at(-1), { domain: 'media_player', service: 'join', data: { group_members: ['media_player.ma_den'], entity_id: 'media_player.ma_kitchen' } });
  assert.deepEqual(joined.body.entities['media_player.ma_kitchen'].attributes.group_members, ['media_player.ma_kitchen', 'media_player.ma_den']);

  // Not a speaker, the speaker itself, nothing, or too many: refused before Home Assistant.
  const before = fake.calls.length;
  for (const value of [['light.kitchen'], ['media_player.ma_kitchen'], [], 'media_player.ma_den', [7], Array.from({ length: 9 }, (_, i) => `media_player.s${i}`)]) {
    assert.equal((await act('media_player.ma_kitchen', 'join', value)).status, 400, JSON.stringify(value));
  }
  assert.equal(fake.calls.length, before);

  const left = await act('media_player.ma_den', 'unjoin');
  assert.equal(left.status, 200, JSON.stringify(left.body));
  assert.equal(fake.calls.at(-1).service, 'unjoin');
  assert.deepEqual(left.body.entities['media_player.ma_den'].attributes.group_members, ['media_player.ma_den']);
  await del('/api/widgets/music-grp.html');
});

test('a plugin sees which integration and device each speaker comes from, and not those hidden in Home Assistant', needsWebSocket, async () => {
  await delay(1100);
  const up = await uploadPlugin('music-src.html', { ...musicManifest, id: 'music-src' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  // One speaker twice (Music Assistant's entity and its Cast one, one
  // device), and a TV hidden in Home Assistant.
  fake.setState('media_player.uxb_ma', 'playing', { friendly_name: 'Uxbridge', supported_features: 16384 | 1 });
  fake.setState('media_player.uxb_cast', 'playing', { friendly_name: 'Uxbridge', supported_features: 16384 | 1 });
  fake.setState('media_player.old_tv', 'off', { friendly_name: 'Old TV', supported_features: 16384 });
  fake.setRegistryEntry('media_player.uxb_ma', { platform: 'music_assistant', device_id: 'dev-uxbridge' });
  fake.setRegistryEntry('media_player.uxb_cast', { platform: 'cast', device_id: 'dev-uxbridge' });
  fake.setRegistryEntry('media_player.old_tv', { platform: 'cast', device_id: 'dev-tv', hidden_by: 'user' });
  // Start the link again, so the entity list and registry are read afresh.
  assert.equal((await put('/api/connections/homeassistant', { url: fake.url, token: 'ha-secret' })).status, 200);
  let body;
  for (let i = 0; i < 40; i += 1) {
    body = (await api('/api/plugin/v1/ha/music-src/state')).body;
    if (body.sources?.['media_player.uxb_ma']) break;
    await delay(100);
  }
  const { sources } = body;
  assert.equal(sources['media_player.uxb_ma'].integration, 'music_assistant');
  assert.equal(sources['media_player.uxb_cast'].integration, 'cast');
  assert.match(sources['media_player.uxb_ma'].device, /^[\w-]{12}$/);
  assert.equal(sources['media_player.uxb_ma'].device, sources['media_player.uxb_cast'].device, 'one device, one tag');
  assert.notEqual(sources['media_player.uxb_ma'].device, 'dev-uxbridge', 'the device id itself is not given out');
  assert.ok(!('media_player.old_tv' in body.entities), 'hidden in Home Assistant, so not offered');
  assert.equal(sources['media_player.kitchen_music'], null, 'no registry entry, no source');
  await del('/api/widgets/music-src.html');
});

test('play and pause go on their own, for a speaker that reports only one of them', async () => {
  await delay(1100);
  const up = await uploadPlugin('music-pp.html', { ...musicManifest, id: 'music-pp' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const press = (entity) => post('/api/plugin/v1/ha/music-pp/action', { entity, action: 'play_pause' });
  // A Cast speaker, paused, that reports play but not pause: Home Assistant
  // refuses it media_play_pause ("does not support action").
  fake.setState('media_player.uxbridge', 'paused', { friendly_name: 'Marshall Uxbridge', supported_features: 16384 | 4 | 512 });
  const play = await press('media_player.uxbridge');
  assert.equal(play.status, 200, JSON.stringify(play.body));
  assert.equal(fake.calls.at(-1).service, 'media_play');
  // Playing, one that reports pause but not play is paused.
  fake.setState('media_player.uxbridge_2', 'playing', { friendly_name: 'Uxbridge 2', supported_features: 1 | 4 | 512 });
  const pause = await press('media_player.uxbridge_2');
  assert.equal(pause.status, 200, JSON.stringify(pause.body));
  assert.equal(fake.calls.at(-1).service, 'media_pause');
  await del('/api/widgets/music-pp.html');
});

test('a plugin may not be granted locks, alarms, covers or cameras whole', async () => {
  for (const domain of ['lock', 'alarm_control_panel', 'cover', 'camera']) {
    const up = await uploadPlugin(`grab-${domain}.html`, { manifestVersion: 1, id: `grab-${domain.replace(/_/g, '-')}`, homeAssistant: { domains: [domain] } });
    assert.equal(up.status, 400, `${domain}: ${JSON.stringify(up.body)}`);
  }
  // playUrlsFrom must name a household string setting the manifest declares.
  const noSetting = await uploadPlugin('no-setting.html', { manifestVersion: 1, id: 'no-setting', homeAssistant: { domains: ['media_player'], playUrlsFrom: 'server' } });
  assert.equal(noSetting.status, 400);
});

test('play_url plays only on the media server the household named', async () => {
  await delay(1100);
  const play = (url, extra = {}) => post('/api/plugin/v1/ha/music-test/action', { entity: 'media_player.kitchen_music', action: 'play_url', value: { url, ...extra } });
  // No server set yet.
  assert.equal((await play('http://jelly.local:8096/Audio/1/stream.mp3')).status, 400);

  assert.equal((await put('/api/plugin/v1/settings/music-test', { jellyfinUrl: 'http://jelly.local:8096/jf' })).status, 200);
  const ok = await play('http://jelly.local:8096/jf/Audio/abc/stream.mp3?api_key=t');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(fake.calls.at(-1), {
    domain: 'media_player', service: 'play_media',
    data: { media_content_id: 'http://jelly.local:8096/jf/Audio/abc/stream.mp3?api_key=t', media_content_type: 'music', enqueue: 'replace', entity_id: 'media_player.kitchen_music' },
  });
  assert.equal((await play('http://jelly.local:8096/jf/Audio/def/stream.mp3', { enqueue: 'add' })).status, 200);
  assert.equal(fake.calls.at(-1).data.enqueue, 'add');

  await delay(1100);
  const before = fake.calls.length;
  for (const url of [
    'http://evil.example/song.mp3',               // another host
    'http://jelly.local:9999/jf/Audio/1',         // another port
    'https://jelly.local:8096/jf/Audio/1',        // another scheme
    'http://jelly.local:8096/other/Audio/1',      // outside its path
    'http://user:pass@jelly.local:8096/jf/a',     // credentials in the address
    'not an address',
  ]) {
    const res = await play(url);
    assert.ok(res.status === 403 || res.status === 400, `${url}: ${res.status}`);
  }
  // A player that can't play from an address.
  assert.equal((await post('/api/plugin/v1/ha/music-test/action', { entity: 'media_player.living', action: 'play_url', value: { url: 'http://jelly.local:8096/jf/a' } })).status, 400);
  assert.equal(fake.calls.length, before, 'nothing refused reached Home Assistant');
});

test('a plugin granted media_player browses a speaker\'s library like a panel', needsWebSocket, async () => {
  await delay(1100);
  const top = await api('/api/plugin/v1/ha/music-test/media/media_player.kitchen_music/browse');
  assert.equal(top.status, 200, JSON.stringify(top.body));
  assert.deepEqual(top.body.items.map((item) => item.title), ['Playlists', 'Artists']);
  const playlists = await api(`/api/plugin/v1/ha/music-test/media/media_player.kitchen_music/browse?item=${top.body.items[0].key}`);
  const mix = playlists.body.items.find((item) => item.title === 'Kitchen Mix');
  assert.equal((await post('/api/plugin/v1/ha/music-test/action', { entity: 'media_player.kitchen_music', action: 'play_media', value: mix.key })).status, 200);
  assert.equal(fake.calls.at(-1).data.media_content_id, 'library://playlist/1');
  // Deleting the plugin forgets its recent searches.
  await api('/api/plugin/v1/ha/music-test/media/media_player.kitchen_music/search?q=neil');
  assert.equal((await del('/api/widgets/music-test.html')).status, 200);
  assert.equal((await api('/api/plugin/v1/ha/music-test/state')).status, 404);
});

test('play_url carries what is playing, with a cover from the same server only', async () => {
  await delay(1100);
  const up = await uploadPlugin('music-meta.html', { ...musicManifest, id: 'music-meta' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  await put('/api/plugin/v1/settings/music-meta', { jellyfinUrl: 'http://jelly.local:8096' });
  const play = (value) => post('/api/plugin/v1/ha/music-meta/action', { entity: 'media_player.kitchen_music', action: 'play_url', value });
  const ok = await play({ url: 'http://jelly.local:8096/Audio/1/stream.mp3', title: 'Harvest Moon', artist: 'Neil Young', album: 'Harvest Moon', image: 'http://jelly.local:8096/Items/1/Images/Primary' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(fake.calls.at(-1).data.extra, {
    title: 'Harvest Moon',
    thumb: 'http://jelly.local:8096/Items/1/Images/Primary',
    metadata: { metadataType: 3, title: 'Harvest Moon', artist: 'Neil Young', albumName: 'Harvest Moon', images: [{ url: 'http://jelly.local:8096/Items/1/Images/Primary' }] },
  });
  const before = fake.calls.length;
  const elsewhere = await play({ url: 'http://jelly.local:8096/Audio/1/stream.mp3', image: 'http://tracker.example/pixel.gif' });
  assert.equal(elsewhere.status, 403);
  assert.equal(fake.calls.length, before);
  await del('/api/widgets/music-meta.html');
});

test('a panel resized in the builder is resized where it is placed, and every display hears of it', async () => {
  const created = await post('/api/ha-panels', { recipe: { name: 'Sized', tiles: [{ id: 'a', entities: ['light.kitchen'] }] } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const { id, filename } = created.body.panel;
  const widget = `plugin:${filename}`;
  // On a tab on two displays, at different sizes.
  const place = async (device, w, h) => {
    const base = `/api/devices/${device}`;
    assert.equal((await post(`${base}/tabs`, { label: 'Home', icon: 'home', show_label: true })).status, 200);
    assert.equal((await post(`${base}/widget-assignments`, { widget_name: widget, tabNumber: 1 })).status, 200);
    const saved = await patch(`${base}/widget-assignments/layout/bulk`, { layouts: [{ widget_name: widget, tabNumber: 1, layout_x: 0, layout_y: 0, layout_w: w, layout_h: h }] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  };
  await place('sized-hall', 4, 3);
  await place('sized-kitchen', 2, 2);
  const placed = async (device) => (await api(`/api/ha-panels?device=${device}`)).body.panels.find((p) => p.id === id).placed;
  assert.deepEqual(await placed('sized-kitchen'), { w: 2, h: 2 }, "the size picker starts from this display's placement");
  assert.deepEqual(await placed('sized-hall'), { w: 4, h: 3 });

  const etag = async () => { await delay(150); return (await api('/api/changes')).headers.get('etag'); };
  const before = await etag();
  const recipe = { name: 'Sized', widget: { w: 3, h: 2 }, tiles: [{ id: 'a', entities: ['light.kitchen'] }] };
  // Without resize, only the panel's own size changes.
  const kept = await put(`/api/ha-panels/${id}`, { recipe });
  assert.equal(kept.body.resized, false);
  assert.equal(await etag(), before, 'no layout changed, so no display reloads');
  assert.deepEqual(await placed('sized-kitchen'), { w: 2, h: 2 });

  const resized = await put(`/api/ha-panels/${id}`, { recipe, resize: true });
  assert.equal(resized.body.resized, true);
  for (const device of ['sized-hall', 'sized-kitchen']) {
    const layout = (await api(`/api/devices/${device}/widget-assignments`)).body.find((a) => a.widget_name === widget);
    assert.deepEqual([layout.layout_w, layout.layout_h], [3, 2], device);
  }
  assert.notEqual(await etag(), before, 'displays hear a layout changed');
  // Saved again at the size it already has: nothing to tell anyone.
  const after = await etag();
  assert.equal((await put(`/api/ha-panels/${id}`, { recipe, resize: true })).body.resized, false);
  assert.equal(await etag(), after);
  await del(`/api/ha-panels/${id}`);
});
