// Mirror-exit reload command (remote refresh): a timestamp inside the
// target's device settings, delivered by the settings bump, cleared by
// the target before it reloads. Runs against a real server on a fresh
// temp DB, like deviceViewport.test.js.
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-reload-'));
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

test('reload-request round-trips, preserves other settings, and never creates a device', async () => {
  // Unknown devices 404 on all three verbs, and the POST does not create one.
  for (const [method, path] of [
    ['POST', '/api/devices/Ghost/reload-request'],
    ['GET', '/api/devices/Ghost/reload-request'],
    ['DELETE', '/api/devices/Ghost/reload-request'],
  ]) {
    const missing = await call(method, path);
    assert.equal(missing.status, 404, `${method} ${path} should 404`);
  }
  const listed = await call('GET', '/api/devices');
  assert.ok(Array.isArray(listed.body));
  assert.equal(listed.body.some((d) => d.name === 'Ghost'), false, 'POST must not create the device');

  // Seed a device with real settings, then command it.
  const seeded = await call('PATCH', '/api/devices/Wall/settings', { widgetSettings: { calendar: { enabled: true } } });
  assert.equal(seeded.status, 200, JSON.stringify(seeded.body));

  const before = Date.now();
  const commanded = await call('POST', '/api/devices/Wall/reload-request');
  assert.equal(commanded.status, 200, JSON.stringify(commanded.body));
  assert.equal(commanded.body.ok, true);
  assert.equal(typeof commanded.body.mirrorReloadRequestedAt, 'number');
  assert.ok(commanded.body.mirrorReloadRequestedAt >= before);
  assert.ok(commanded.body.mirrorReloadRequestedAt <= Date.now());

  const read = await call('GET', '/api/devices/Wall/reload-request');
  assert.deepEqual(read.body, { mirrorReloadRequestedAt: commanded.body.mirrorReloadRequestedAt });

  // The command is one more top-level settings key, not a replacement.
  const settings = await call('GET', '/api/devices/Wall/settings');
  assert.equal(settings.body.widgetSettings.calendar.enabled, true);
  assert.equal(settings.body.mirrorReloadRequestedAt, commanded.body.mirrorReloadRequestedAt);

  // A second command replaces the first (a newer timestamp, never two pending).
  const commanded2 = await call('POST', '/api/devices/Wall/reload-request');
  assert.equal(commanded2.status, 200);
  assert.ok(commanded2.body.mirrorReloadRequestedAt >= commanded.body.mirrorReloadRequestedAt);

  // Clearing removes only the command; the rest of settings survives.
  const cleared = await call('DELETE', '/api/devices/Wall/reload-request');
  assert.equal(cleared.status, 200);
  const afterClear = await call('GET', '/api/devices/Wall/reload-request');
  assert.deepEqual(afterClear.body, { mirrorReloadRequestedAt: null });
  const settingsAfter = await call('GET', '/api/devices/Wall/settings');
  assert.equal(settingsAfter.body.widgetSettings.calendar.enabled, true);
  assert.equal('mirrorReloadRequestedAt' in settingsAfter.body, false);

  // Clearing twice is still fine (idempotent consume).
  const cleared2 = await call('DELETE', '/api/devices/Wall/reload-request');
  assert.equal(cleared2.status, 200);
});

test('a reload command bumps settings so the target learns of it', async () => {
  await call('PATCH', '/api/devices/Wall/settings', { widgetSettings: { calendar: { enabled: true } } });
  const before = await changes();
  const commanded = await call('POST', '/api/devices/Wall/reload-request');
  assert.equal(commanded.status, 200);
  assert.deepEqual(moved(before, await changes()), ['settings'], 'reload commands must bump settings');
});
