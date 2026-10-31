// Per-plugin storage counters on a real server (issue #347): every write
// path moves only that plugin's counter, the stream carries the event with
// no key, and uninstall with purge drops the counter.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let child;
let base;
let dataDir;

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-plugin-storage-'));
  const port = await freePort();
  child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: path.join(dataDir, 'tasks.db'), TZ: 'UTC', DEMO_MODE: 'false',
      ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64'),
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1', HOMEGLOW_DISABLE_CALENDAR_SYNC: '1', HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  base = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if ((await fetch(`${base}/api/test`)).ok) break; } catch { /* starting */ }
    await delay(250);
  }
  await upload('plug-a.html', manifestPage(pluginManifest('plug-a')));
  await upload('plug-b.html', manifestPage(pluginManifest('plug-b')));
  await upload('plug-react.html', manifestPage(pluginManifest('plug-react', {
    reactions: [{ on: 'chore.completed', action: 'increment', key: 'done', path: 'count', delta: 1 }],
  })));
});

test.after(async () => {
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('close', resolve);
    child.kill();
    setTimeout(resolve, 5000);
  });
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const manifestPage = (manifest) => `<html><head><title>t</title><script type="application/json" id="homeglow-manifest">${JSON.stringify(manifest)}</script></head><body>p</body></html>`;
const pluginManifest = (id, extra = {}) => ({ manifestVersion: 1, id, name: id, apiVersion: 'v1', storage: true, events: ['plugin.storage.changed'], ...extra });

async function api(pathname, options = {}) {
  const res = await fetch(`${base}${pathname}`, options);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
}

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

// As a plugin's frame asks: Origin null, its page token.
const asPlugin = (pathname, token, options = {}) => api(pathname, {
  ...options,
  headers: {
    Origin: 'null', 'Sec-Fetch-Mode': 'cors', ...(token ? { 'X-HomeGlow-Plugin-Token': token } : {}),
    ...(options.headers || {}),
  },
});

const changes = async () => (await api('/api/changes')).body;
const moved = (before, after) => Object.keys(after).filter((key) => after[key] !== before[key]).sort();

test('each storage write path moves only that plugin counter; reads and failures move nothing', async () => {
  const tokenA = await tokenOf('plug-a.html');
  const tokenB = await tokenOf('plug-b.html');

  let before = await changes();
  assert.equal(before['plugin:plug-a'], undefined, 'no counter before the first write');

  const put = await asPlugin('/api/plugin/v1/storage/plug-a/list', tokenA, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }),
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  let after = await changes();
  assert.deepEqual(moved(before, after), ['plugin:plug-a']);

  before = after;
  const inc = await asPlugin('/api/plugin/v1/storage/plug-a/count/increment', tokenA, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'total', delta: 1 }),
  });
  assert.equal(inc.status, 200, JSON.stringify(inc.body));
  after = await changes();
  assert.deepEqual(moved(before, after), ['plugin:plug-a']);

  before = after;
  const del = await asPlugin('/api/plugin/v1/storage/plug-a/list', tokenA, { method: 'DELETE' });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  after = await changes();
  assert.deepEqual(moved(before, after), ['plugin:plug-a']);

  before = after;
  const other = await asPlugin('/api/plugin/v1/storage/plug-b/list', tokenB, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([]),
  });
  assert.equal(other.status, 200, JSON.stringify(other.body));
  after = await changes();
  assert.deepEqual(moved(before, after), ['plugin:plug-b'], "another plugin's write never moves this plugin's counter");

  before = after;
  await asPlugin('/api/plugin/v1/storage/plug-a', tokenA);
  await asPlugin('/api/plugin/v1/storage/plug-a/count', tokenA);
  await asPlugin('/api/plugin/v1/storage/plug-a/missing', tokenA, { method: 'DELETE' });
  await asPlugin('/api/plugin/v1/storage/plug-a/count/increment', tokenA, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'total' }),
  });
  await asPlugin('/api/plugin/v1/storage/no-such-plugin/list', tokenA, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(1),
  });
  after = await changes();
  assert.deepEqual(moved(before, after), [], 'reads, a missing-key delete, a bad increment and an unknown plugin move nothing');
});

test('a server-side reaction moves the plugin counter, and the stream carries the event with no key', async () => {
  const user = await api('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Ava', email: 'ava@example.com' }) });
  const chore = await api('/api/chores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Dishes', clam_value: 2 }) });
  const schedule = await api('/api/chore-schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chore_id: chore.body.id, user_id: user.body.id, crontab: '0 0 * * *' }) });
  assert.equal(schedule.status, 200, JSON.stringify(schedule.body));

  const before = await changes();
  const messages = [];
  const req = http.get(`${base}/api/plugin/v1/events/stream`, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data: ')) continue;
        messages.push(JSON.parse(line.slice(6)));
      }
    });
  });
  await delay(300);

  const done = await api('/api/chores/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chore_schedule_id: schedule.body.id, user_id: user.body.id, date: new Date().toISOString().slice(0, 10) }) });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  await delay(500);
  req.destroy();

  const after = await changes();
  assert.deepEqual(moved(before, after).filter((key) => key.startsWith('plugin:')), ['plugin:plug-react']);
  const stored = await asPlugin('/api/plugin/v1/storage/plug-react/done', await tokenOf('plug-react.html'));
  assert.equal(stored.body.value?.count ?? stored.body.count, 1, JSON.stringify(stored.body));

  const storageEvents = messages.filter((message) => message.event === 'plugin.storage.changed');
  assert.equal(storageEvents.length, 1, JSON.stringify(messages));
  assert.equal(storageEvents[0].payload.pluginId, 'plug-react');
  assert.equal(typeof storageEvents[0].payload.revision, 'number');
  assert.equal('key' in storageEvents[0].payload, false, 'the event carries no key');
  assert.equal(messages.some((message) => message.event === 'household.changed' && message.payload.domains.some((domain) => domain.startsWith('plugin:'))), false, 'no household event carries a plugin counter');
});

test('uninstall with purge drops the counter; without purge it stays', async () => {
  const tokenA = await tokenOf('plug-a.html');
  await asPlugin('/api/plugin/v1/storage/plug-a/keep', tokenA, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(1),
  });
  let before = await changes();
  assert.ok(before['plugin:plug-a'] !== undefined);

  const kept = await api('/api/widgets/plug-a.html', { method: 'DELETE' });
  assert.equal(kept.status, 200, JSON.stringify(kept.body));
  let after = await changes();
  assert.equal(after['plugin:plug-a'], before['plugin:plug-a'], 'without purge, the counter stays with the kept data');

  const tokenB = await tokenOf('plug-b.html');
  await asPlugin('/api/plugin/v1/storage/plug-b/keep', tokenB, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(1),
  });
  before = await changes();
  assert.ok(before['plugin:plug-b'] !== undefined);

  const purged = await api('/api/widgets/plug-b.html?purgeData=true', { method: 'DELETE' });
  assert.equal(purged.status, 200, JSON.stringify(purged.body));
  after = await changes();
  assert.equal(after['plugin:plug-b'], undefined, 'with purge, the counter goes with the data');
});

test('the etag moves with a plugin write, and 304 holds while nothing changes', async () => {
  await upload('plug-etag.html', manifestPage(pluginManifest('plug-etag')));
  const token = await tokenOf('plug-etag.html');

  const first = await api('/api/changes');
  const tag = first.headers.get('etag');
  assert.ok(tag);

  await asPlugin('/api/plugin/v1/storage/plug-etag/mark', token, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(1),
  });
  const second = await api('/api/changes');
  assert.notEqual(second.headers.get('etag'), tag, 'a plugin write moves the etag, since the counter list grew');
  const again = await fetch(`${base}/api/changes`, { headers: { 'If-None-Match': second.headers.get('etag') } });
  assert.equal(again.status, 304);
});
