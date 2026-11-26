// Plugin permissions (issue #402): a plugin asks for the microphone in its
// manifest, and gets it only once an admin switches it on. The rules, and a
// real server: validation on install, the grant route and its PIN, what the
// plugin's page and the plugin list say, and updates that ask for something
// new.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');
const permissions = require('../utils/pluginPermissions');

// ---- The rules.

test('a manifest may ask only for known permissions, each once', () => {
  assert.deepEqual(permissions.validateManifestPermissions(undefined), []);
  assert.deepEqual(permissions.validateManifestPermissions(['microphone']), []);
  assert.match(permissions.validateManifestPermissions('microphone')[0], /array of strings/);
  assert.match(permissions.validateManifestPermissions([1])[0], /array of strings/);
  assert.match(permissions.validateManifestPermissions(['camera'])[0], /"camera" is not a known permission/);
  assert.match(permissions.validateManifestPermissions(['microphone', 'microphone'])[0], /twice/);
});

test('a plugin has what it asks for and an admin granted, nothing more', () => {
  const asks = { permissions: ['microphone'] };
  assert.deepEqual(permissions.grantedPermissions(asks, null), []);
  assert.deepEqual(permissions.grantedPermissions(asks, '["microphone"]'), ['microphone']);
  // Granted once, no longer asked for: nothing.
  assert.deepEqual(permissions.grantedPermissions({}, '["microphone"]'), []);
  // A stored value that isn't a list, or names nothing known: nothing.
  assert.deepEqual(permissions.grantedPermissions(asks, 'not json'), []);
  assert.deepEqual(permissions.grantedPermissions(asks, '["camera"]'), []);
});

test('only what the manifest asks for can be granted', () => {
  const asks = { permissions: ['microphone'] };
  assert.deepEqual(permissions.normalizeGrantRequest(['microphone'], asks), { value: '["microphone"]' });
  assert.deepEqual(permissions.normalizeGrantRequest([], asks), { value: '[]' });
  assert.match(permissions.normalizeGrantRequest('microphone', asks).error, /array/);
  assert.match(permissions.normalizeGrantRequest(['camera'], asks).error, /not a known permission/);
  assert.match(permissions.normalizeGrantRequest(['microphone'], {}).error, /doesn't ask for "microphone"/);
});

test('a granted microphone adds microphone to the frame', () => {
  assert.deepEqual(permissions.frameAllowTokens([]), []);
  assert.deepEqual(permissions.frameAllowTokens(['microphone']), ['microphone']);
});

// ---- A real server.

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `plugin-permissions-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let { body } = options;
  if (body !== undefined && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, body, headers });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

const manifestPage = (manifest) => `<html><head><title>t</title><script type="application/json" id="homeglow-manifest">${JSON.stringify(manifest)}</script></head><body>p</body></html>`;
const pluginManifest = (id, extra = {}) => ({ manifestVersion: 1, id, name: id, apiVersion: 'v1', ...extra });

async function upload(filename, html) {
  const form = new FormData();
  form.append('file', new Blob([html], { type: 'text/html' }), filename);
  return api('/api/widgets/upload', { method: 'POST', body: form });
}
const listed = async (filename) => (await api('/api/widgets')).body.find((plugin) => plugin.filename === filename);
// What the plugin's own page is told it has.
async function pageGrants(filename) {
  const page = await api(`/widgets/${filename}`);
  assert.equal(page.status, 200);
  const match = page.body.match(/apiVersion:"v1",permissions:Object\.freeze\((\[[^\]]*\])\)/);
  assert.ok(match, 'the page carries its permissions');
  return JSON.parse(match[1]);
}
const grant = (filename, granted, extra = {}) => api(`/api/widgets/${filename}/permissions`, { method: 'PUT', body: { granted, ...extra } });

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: testDbPath, TZ: 'UTC', DEMO_MODE: 'false',
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1', HOMEGLOW_DISABLE_CALENDAR_SYNC: '1', HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk; });
  serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk; });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if ((await fetch(`${baseUrl}/api/test`)).ok) return; } catch { /* starting */ }
    await delay(250);
  }
  throw new Error('server did not start');
});

test.after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    await new Promise((resolve) => { serverProcess.once('close', resolve); serverProcess.kill(); setTimeout(resolve, 5000); });
  }
  if (process.exitCode && serverLogs) console.error(serverLogs.slice(-4000));
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});

test('a manifest asking for an unknown permission is refused at install', async () => {
  const res = await upload('asks-camera.html', manifestPage(pluginManifest('asks-camera', { permissions: ['camera'] })));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /"camera" is not a known permission/);
  assert.equal(await listed('asks-camera.html'), undefined);
});

test('installing never grants: the microphone is off until an admin switches it on', async () => {
  const res = await upload('scorekeeper.html', manifestPage(pluginManifest('scorekeeper', { permissions: ['microphone'] })));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual((await listed('scorekeeper.html')).permissions, { requested: ['microphone'], granted: [] });
  assert.deepEqual(await pageGrants('scorekeeper.html'), []);

  // A plugin that asks for nothing lists nothing, and its page says so.
  assert.equal((await upload('quiet.html', manifestPage(pluginManifest('quiet')))).status, 200);
  assert.deepEqual((await listed('quiet.html')).permissions, { requested: [], granted: [] });
  assert.deepEqual(await pageGrants('quiet.html'), []);
});

test('an admin grants it, and the plugin and every display hear of it', async () => {
  const before = (await api('/api/changes')).body.settings;
  const res = await grant('scorekeeper.html', ['microphone']);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.permissions, { requested: ['microphone'], granted: ['microphone'] });
  assert.deepEqual((await listed('scorekeeper.html')).permissions.granted, ['microphone']);
  assert.deepEqual(await pageGrants('scorekeeper.html'), ['microphone']);

  // The settings counter moves, so other displays rebuild the frame.
  let after = before;
  for (let i = 0; i < 20 && after === before; i += 1) {
    await delay(150);
    after = (await api('/api/changes')).body.settings;
  }
  assert.ok(after > before, `settings counter moved (${before} -> ${after})`);

  // And off again.
  assert.equal((await grant('scorekeeper.html', [])).status, 200);
  assert.deepEqual(await pageGrants('scorekeeper.html'), []);
});

test('only what the manifest asks for can be granted, and only to a plugin that exists', async () => {
  assert.equal((await grant('quiet.html', ['microphone'])).status, 400);
  assert.equal((await grant('scorekeeper.html', ['camera'])).status, 400);
  assert.equal((await grant('scorekeeper.html', 'microphone')).status, 400);
  assert.equal((await grant('nothing-here.html', ['microphone'])).status, 404);
  assert.deepEqual((await listed('quiet.html')).permissions.granted, []);
});

test('a plugin frame cannot grant itself anything, nor can another website', async () => {
  const page = await api('/widgets/scorekeeper.html');
  const token = page.body.match(/var TOKEN="([^"]+)"/)[1];
  const fromPlugin = await api('/api/widgets/scorekeeper.html/permissions', {
    method: 'PUT',
    body: { granted: ['microphone'] },
    headers: { Origin: 'null', 'Sec-Fetch-Mode': 'cors', 'X-HomeGlow-Plugin-Token': token },
  });
  assert.equal(fromPlugin.status, 403);
  const crossSite = await api('/api/widgets/scorekeeper.html/permissions', {
    method: 'PUT',
    body: { granted: ['microphone'] },
    headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.equal(crossSite.status, 403);
  assert.deepEqual((await listed('scorekeeper.html')).permissions.granted, []);
});

test('an update that drops a permission and later asks again starts with it off', async () => {
  assert.equal((await grant('scorekeeper.html', ['microphone'])).status, 200);
  // An update that still asks keeps the grant.
  assert.equal((await upload('scorekeeper.html', manifestPage(pluginManifest('scorekeeper', { version: '1.1.0', permissions: ['microphone'] })))).status, 200);
  assert.deepEqual((await listed('scorekeeper.html')).permissions.granted, ['microphone']);
  // One that drops it loses it...
  assert.equal((await upload('scorekeeper.html', manifestPage(pluginManifest('scorekeeper', { version: '1.2.0' })))).status, 200);
  assert.deepEqual((await listed('scorekeeper.html')).permissions, { requested: [], granted: [] });
  // ...so asking again later starts with it off, as a new request does.
  assert.equal((await upload('scorekeeper.html', manifestPage(pluginManifest('scorekeeper', { version: '1.3.0', permissions: ['microphone'] })))).status, 200);
  assert.deepEqual((await listed('scorekeeper.html')).permissions, { requested: ['microphone'], granted: [] });
});

test('a different plugin under the same file name inherits no grant', async () => {
  assert.equal((await upload('shared-name.html', manifestPage(pluginManifest('first-plugin', { permissions: ['microphone'] })))).status, 200);
  assert.equal((await grant('shared-name.html', ['microphone'])).status, 200);
  // Free the id-to-file link first: a new id under the same file name.
  assert.equal((await upload('shared-name.html', manifestPage(pluginManifest('second-plugin', { permissions: ['microphone'] })))).status, 200);
  assert.deepEqual((await listed('shared-name.html')).permissions, { requested: ['microphone'], granted: [] });
});

// Last: it sets the admin PIN, which the tests above don't expect.
test('with an admin PIN set, granting needs it', async () => {
  const set = await api('/api/admin-pin/set', { method: 'POST', body: { pin: '2468' } });
  assert.equal(set.status, 200, JSON.stringify(set.body));

  const missing = await grant('scorekeeper.html', ['microphone']);
  assert.equal(missing.status, 403);
  const wrong = await grant('scorekeeper.html', ['microphone'], { pin: '1111' });
  assert.equal(wrong.status, 403);
  assert.deepEqual((await listed('scorekeeper.html')).permissions.granted, []);

  const right = await grant('scorekeeper.html', ['microphone'], { pin: '2468' });
  assert.equal(right.status, 200, JSON.stringify(right.body));
  assert.deepEqual((await listed('scorekeeper.html')).permissions.granted, ['microphone']);
});

// ---- What the SDK tells the plugin.

const vm = require('node:vm');
const sdkSource = fs.readFileSync(path.resolve(__dirname, '..', 'plugin-sdk', 'v1.js'), 'utf8');
function sdkWith(identity) {
  const window = {
    parent: {},
    location: { search: '', href: 'https://hg.example/widgets/x.html', origin: 'https://hg.example' },
    addEventListener() {},
    ...(identity ? { __HOMEGLOW_PLUGIN__: identity } : {}),
  };
  const document = { documentElement: { style: { setProperty() {} }, setAttribute() {} }, fonts: { add() {} } };
  vm.runInNewContext(sdkSource, { window, document, URLSearchParams, URL, console: { error() {} }, fetch: () => Promise.reject(new Error('no network')) });
  return window.HomeGlow;
}

test('HomeGlow.permissions lists what was granted, as a copy', () => {
  // The SDK runs in its own realm: copy its arrays into this one to compare.
  const list = (value) => [...value];
  assert.deepEqual(list(sdkWith(null).permissions), []);
  assert.deepEqual(list(sdkWith(Object.freeze({ id: 'p', apiVersion: 'v1' })).permissions), []);
  const granted = sdkWith(Object.freeze({ id: 'p', apiVersion: 'v1', permissions: Object.freeze(['microphone']) }));
  assert.deepEqual(list(granted.permissions), ['microphone']);
  // Changing the copy changes nothing.
  granted.permissions.push('camera');
  assert.deepEqual(list(granted.permissions), ['microphone']);
});
