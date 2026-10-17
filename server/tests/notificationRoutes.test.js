// Push notifications, end to end: a real HomeGlow server on a throwaway
// database. Nothing is sent: these only turn a device's notifications on and
// off, and check that the server's private key never leaves it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `notifications-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';

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
const del = (p) => api(p, { method: 'DELETE' });


test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
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
  if (process.exitCode && serverLogs) console.error(serverLogs.slice(-4000));
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/route-test',
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
};

test('the server hands out a real public key, and never the private one', async () => {
  const key = await api('/api/notifications/key');
  assert.equal(key.status, 200);
  // An uncompressed P-256 point: 65 bytes, 87 characters of URL-safe base64.
  assert.match(key.body.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal((await api('/api/notifications/key')).body.publicKey, key.body.publicKey, 'made once');

  const settings = (await api('/api/settings')).body;
  assert.equal(settings.PUSH_VAPID_PUBLIC_KEY, key.body.publicKey);
  assert.equal('PUSH_VAPID_PRIVATE_KEY_ENC' in settings, false);
  const searched = (await post('/api/settings/search', ['PUSH_%'])).body;
  assert.equal('PUSH_VAPID_PRIVATE_KEY_ENC' in searched, false);
});

test('a device turns notifications on, the device list shows it, and deleting the device ends them', async () => {
  const name = 'Moms-phone';
  assert.equal((await put(`/api/devices/${name}/settings`, { settings: {} })).status, 200);
  assert.deepEqual((await api(`/api/devices/${name}/notifications`)).body, { enabled: false });

  const on = await put(`/api/devices/${name}/notifications`, { subscription, language: 'en' });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  assert.deepEqual(on.body.events, ['chore.completed', 'chore.allCompleted']);

  const listed = (await api('/api/devices')).body.find((d) => d.name === name);
  assert.equal(listed.notifications, true);
  assert.equal('id' in listed, false, 'the list keeps its shape');

  const bad = await put(`/api/devices/${name}/notifications`, { subscription: { ...subscription, endpoint: 'https://192.168.1.5/push' } });
  assert.equal(bad.status, 400);

  assert.equal((await del(`/api/devices/${name}`)).status, 200);
  const db = new Database(testDbPath, { readonly: true });
  const left = db.prepare('SELECT COUNT(*) AS n FROM device_notifications').get().n;
  db.close();
  assert.equal(left, 0, 'the row went with the device');
  assert.equal((await put(`/api/devices/${name}/settings`, { settings: {} })).status, 200);
  assert.deepEqual((await api(`/api/devices/${name}/notifications`)).body, { enabled: false }, 'a recreated device starts with them off');
});

test('turning them off, and a test for a device without them', async () => {
  const name = 'Dads-phone';
  await put(`/api/devices/${name}/settings`, { settings: {} });
  await put(`/api/devices/${name}/notifications`, { subscription });
  assert.deepEqual((await del(`/api/devices/${name}/notifications`)).body, { enabled: false });
  assert.equal((await post(`/api/devices/${name}/notifications/test`, {})).status, 404);
  assert.equal((await put('/api/devices/Nobody/notifications', { events: [] })).status, 404, 'a change needs a device');
  const first = await put('/api/devices/New-phone/notifications', { subscription: { ...subscription, endpoint: `${subscription.endpoint}-new` } });
  assert.equal(first.status, 200, 'turning them on makes the device record');
  assert.ok((await api('/api/devices')).body.some((d) => d.name === 'New-phone' && d.notifications));
});
