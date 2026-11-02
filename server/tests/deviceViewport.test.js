// Device viewport report (remote-control mirror mode): a dashboard posts its
// own size so a mirror can render at the target's true size, and the report
// must never move the household-changes counters (a resize must not make
// every display refetch). Runs against a real server on a fresh temp DB,
// which also proves migration 41 created the viewport_json column.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let child;
let base;
let dataDir;

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-viewport-'));
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
    try { if ((await fetch(`${base}/api/test`)).ok) return; } catch { /* starting */ }
    await delay(250);
  }
  throw new Error('server did not start');
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

async function call(method, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const changes = async () => (await call('GET', '/api/changes')).body;
const moved = (before, after) => Object.keys(after).filter((domain) => after[domain] !== before[domain]).sort();

test('viewport report round-trips, unknown devices report null, bad reports are rejected', async () => {
  const missing = await call('GET', '/api/devices/Wall/viewport');
  assert.equal(missing.status, 200);
  assert.deepEqual(missing.body, { viewport: null });

  const saved = await call('POST', '/api/devices/Wall/viewport', { width: 1920, height: 1080, devicePixelRatio: 1 });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.viewport, { width: 1920, height: 1080, devicePixelRatio: 1 });

  const read = await call('GET', '/api/devices/Wall/viewport');
  assert.deepEqual(read.body, { viewport: { width: 1920, height: 1080, devicePixelRatio: 1 } });

  // A later report replaces the earlier one; devicePixelRatio defaults to 1.
  const updated = await call('POST', '/api/devices/Wall/viewport', { width: 1280, height: 800 });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.body.viewport, { width: 1280, height: 800, devicePixelRatio: 1 });

  for (const bad of [
    { width: 0, height: 800 },
    { width: -1920, height: 1080 },
    { width: 1920.5, height: 1080 },
    { width: 1920 },
    { height: 1080 },
    { width: '1920', height: 1080 },
    { width: 1920, height: 1080, devicePixelRatio: 0 },
    'not-an-object',
  ]) {
    const rejected = await call('POST', '/api/devices/Wall/viewport', bad);
    assert.equal(rejected.status, 400, JSON.stringify(bad));
  }

  // The rejected reports left the last good value untouched.
  const afterBad = await call('GET', '/api/devices/Wall/viewport');
  assert.deepEqual(afterBad.body.viewport, { width: 1280, height: 800, devicePixelRatio: 1 });
});

test('a viewport report moves no counters; a device settings write moves settings', async () => {
  const before = await changes();
  const reported = await call('POST', '/api/devices/Wall/viewport', { width: 1920, height: 1080, devicePixelRatio: 1 });
  assert.equal(reported.status, 200);
  assert.deepEqual(moved(before, await changes()), [], 'viewport reports must not bump');

  const beforeSettings = await changes();
  const written = await call('PATCH', '/api/devices/Wall/settings', { theme: 'dark' });
  assert.equal(written.status, 200, JSON.stringify(written.body));
  assert.deepEqual(moved(beforeSettings, await changes()), ['settings'], 'device writes bump settings');
});
