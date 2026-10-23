// Plugin isolation, end to end (mrramam/HomeGlow#50, #49): a real server, and
// requests made the way a plugin's sandboxed frame makes them (Origin: null,
// with or without the token its page was served with).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `plugin-isolation-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && typeof options.body === 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}

// As a plugin's frame asks: Origin null, and the page's token when it has one.
const fromPlugin = (pathname, token, options = {}) => api(pathname, {
  ...options,
  headers: { Origin: 'null', ...(token ? { 'X-HomeGlow-Plugin-Token': token } : {}), ...(options.headers || {}) },
});

const manifestPage = (manifest) => `<html><head><title>t</title><script type="application/json" id="homeglow-manifest">${JSON.stringify(manifest)}</script></head><body>p</body></html>`;
const pluginManifest = (id, extra = {}) => ({ manifestVersion: 1, id, name: id, apiVersion: 'v1', storage: true, ...extra });

async function upload(filename, html) {
  const form = new FormData();
  form.append('file', new Blob([html], { type: 'text/html' }), filename);
  const res = await api('/api/widgets/upload', { method: 'POST', body: form });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

// The token a page was served with, read from the frame script.
async function tokenOf(filename) {
  const page = await api(`/widgets/${filename}`);
  assert.equal(page.status, 200);
  const match = page.body.match(/var TOKEN="([^"]+)"/);
  assert.ok(match, 'the page carries a token');
  return match[1];
}

let tokenA;
let tokenB;
let tokenWidget;

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: testDbPath, TZ: 'UTC',
      ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
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
  await upload('plugin-a.html', manifestPage(pluginManifest('plugin-a', { notify: true })));
  await upload('plugin-b.html', manifestPage(pluginManifest('plugin-b', { notify: true })));
  await upload('plain-widget.html', '<html><head><title>plain</title></head><body>no manifest</body></html>');
  tokenA = await tokenOf('plugin-a.html');
  tokenB = await tokenOf('plugin-b.html');
  tokenWidget = await tokenOf('plain-widget.html');
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

test('a plugin\'s request with no token, or a forged one, is refused, readably', async () => {
  for (const token of [null, 'plugin:plugin-a.forged', `${tokenA}x`]) {
    const res = await fromPlugin('/api/users', token);
    assert.equal(res.status, 403, String(token));
    assert.equal(res.headers.get('access-control-allow-origin'), 'null', 'the plugin can read why');
    assert.match(res.body.error, /plugin token/);
  }
});

test('a plugin reaches its own platform API, and not another\'s', async () => {
  const own = await fromPlugin('/api/plugin/v1/storage/plugin-a/notes', tokenA, { method: 'PUT', body: JSON.stringify({ hi: 1 }) });
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.headers.get('access-control-allow-origin'), 'null');
  assert.deepEqual((await fromPlugin('/api/plugin/v1/storage/plugin-a/notes', tokenA)).body, { hi: 1 });

  // Plugin B, written by plugin A's page: storage, settings, notifications, Home Assistant.
  await fromPlugin('/api/plugin/v1/storage/plugin-b/secret', tokenB, { method: 'PUT', body: JSON.stringify({ pin: '1234' }) });
  for (const [method, url, body] of [
    ['GET', '/api/plugin/v1/storage/plugin-b/secret'],
    ['GET', '/api/plugin/v1/storage/plugin-b'],
    ['PUT', '/api/plugin/v1/storage/plugin-b/secret', { pin: 'x' }],
    ['GET', '/api/plugin/v1/settings/plugin-b'],
    ['POST', '/api/plugin/v1/notify/plugin-b', { message: 'not from B' }],
    ['POST', '/api/plugin/v1/ha/plugin-b/action', { entity: 'lock.front_door', action: 'unlock' }],
  ]) {
    const res = await fromPlugin(url, tokenA, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(res.status, 403, `${method} ${url}`);
    assert.match(res.body.error, /its own platform API/);
  }
  assert.deepEqual((await fromPlugin('/api/plugin/v1/storage/plugin-b/secret', tokenB)).body, { pin: '1234' }, 'B\'s data untouched');
});

test('a plain widget\'s token reads core data, and reaches no plugin\'s API', async () => {
  assert.equal((await fromPlugin('/api/users', tokenWidget)).status, 200);
  assert.equal((await fromPlugin('/api/plugin/v1/storage/plugin-a/notes', tokenWidget)).status, 403);
});

test('core data is readable, with a calendar\'s address and account left out', async () => {
  const created = await api('/api/calendar-sources', {
    method: 'POST',
    body: JSON.stringify({ name: 'Family', type: 'ICS', url: 'https://calendar.example/private-key-abc/basic.ics', username: 'mom', color: '#123456' }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));

  for (const url of ['/api/users', '/api/settings', '/api/timezone', '/api/chore-history', '/api/devices', '/api/sun']) {
    const res = await fromPlugin(url, tokenA);
    assert.notEqual(res.status, 403, url);
    assert.equal(res.headers.get('access-control-allow-origin'), 'null', url);
  }
  const forPlugin = (await fromPlugin('/api/calendar-sources', tokenA)).body;
  assert.equal(forPlugin[0].name, 'Family');
  assert.equal(forPlugin[0].url, undefined);
  assert.equal(forPlugin[0].username, undefined);
  const forDashboard = (await api('/api/calendar-sources')).body;
  assert.equal(forDashboard[0].url, 'https://calendar.example/private-key-abc/basic.ics', 'the dashboard still sees it');
});

test('everything else is closed to a plugin, token or not', async () => {
  for (const [method, url, body] of [
    ['POST', '/api/settings', { key: 'PROXY_WHITELIST', value: '192.168.1.1' }],
    ['POST', '/api/backup/local/export', {}],
    ['POST', '/api/backup/drive/restart', {}],
    ['POST', '/api/admin-pin/verify', { pin: '1234' }],
    ['POST', '/api/admin-pin/set', { pin: '1234' }],
    ['POST', '/api/widgets/github/install', { download_url: 'x', filename: 'x.html' }],
    ['DELETE', '/api/widgets/plugin-b.html'],
    ['POST', '/api/users', { username: 'x', email: 'x@x' }],
    ['GET', '/api/plugin/v1/events/stream'],
    ['GET', '/widgets/plugin-b.html'],
    ['PUT', '/api/devices/Kitchen/settings', {}],
  ]) {
    const res = await fromPlugin(url, tokenA, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(res.status, 403, `${method} ${url}`);
  }
  const settings = (await api('/api/settings')).body;
  assert.notEqual(settings.PROXY_WHITELIST, '192.168.1.1', 'the write never happened');
  assert.equal(settings.PLUGIN_TOKEN_SECRET, undefined, 'the signing secret is never handed out');
});

test('a preflight is answered only for what a plugin may do', async () => {
  const preflight = (url, method) => api(url, {
    method: 'OPTIONS',
    headers: { Origin: 'null', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'content-type,x-homeglow-plugin-token' },
  });
  const allowed = await preflight('/api/plugin/v1/storage/plugin-a/notes', 'PUT');
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'null');
  assert.match(allowed.headers.get('access-control-allow-headers'), /X-HomeGlow-Plugin-Token/i);
  for (const [url, method] of [['/api/settings', 'POST'], ['/api/backup/local/export', 'POST'], ['/api/users', 'POST']]) {
    assert.equal((await preflight(url, method)).headers.get('access-control-allow-origin'), null, `${method} ${url}`);
  }
});

test('other websites can no longer read the API; the dev server and HomeGlow itself still can', async () => {
  const foreign = await api('/api/users', { headers: { Origin: 'https://evil.example' } });
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  const dev = await api('/api/users', { headers: { Origin: 'http://localhost:3001' } });
  assert.equal(dev.headers.get('access-control-allow-origin'), 'http://localhost:3001');
  // No Origin (same-origin pages, <img>, server-side callers): as before.
  assert.equal((await api('/api/users')).status, 200);
  const write = await api('/api/settings', { method: 'POST', body: JSON.stringify({ key: 'isolation_probe', value: 'ok' }) });
  assert.equal(write.status, 200, JSON.stringify(write.body));
});

test('each page gets its own token, fixed identity first and frame script before plugin content', async () => {
  assert.notEqual(tokenA, tokenB);
  assert.ok(tokenA.startsWith('plugin:plugin-a.'));
  assert.ok(tokenWidget.startsWith('widget:plain-widget.html.'));
  const page = (await api('/widgets/plugin-a.html')).body;
  assert.ok(page.indexOf('__HOMEGLOW_PLUGIN__') < page.indexOf('var TOKEN='));
  assert.ok(page.indexOf('var TOKEN=') < page.indexOf('homeglow-manifest'));
  assert.equal(await tokenOf('plugin-a.html'), tokenA, 'stable across loads');
});
