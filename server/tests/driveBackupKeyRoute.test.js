// The backup-key route hands out the key that unlocks every stored
// credential, so the server itself asks for the admin PIN when one is set,
// and the public demo never serves it. Real servers on throwaway databases;
// no Google account is connected, so a request that gets past the PIN check
// stops at "No Google account connected" (404).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer(extraEnv = {}) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const port = await freePort();
  const dbPath = path.join(tmpDir, `backup-key-${process.pid}-${Date.now()}-${port}.db`);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: dbPath, TZ: 'UTC',
      ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1', HOMEGLOW_DISABLE_CALENDAR_SYNC: '1', HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
      ...extraEnv,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const base = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if ((await fetch(`${base}/api/test`)).ok) break; } catch { /* starting */ }
    await delay(250);
  }
  const post = async (pathname, body) => {
    const res = await fetch(`${base}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('close', resolve);
    child.kill();
    setTimeout(resolve, 5000);
  }).then(() => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  });
  return { post, stop };
}

test('without a PIN the route goes on; with one, it needs the right PIN', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  const key = (body) => server.post('/api/backup/drive/backup-key', { fileId: 'any', ...body });

  assert.equal((await server.post('/api/backup/drive/backup-key', {})).status, 400, 'a fileId is needed');
  const open = await key({});
  assert.equal(open.status, 404, JSON.stringify(open.body));
  assert.match(open.body.error, /No Google account/);

  assert.equal((await server.post('/api/admin-pin/set', { pin: '2468' })).status, 200);
  assert.equal((await key({})).status, 403, 'no PIN');
  assert.equal((await key({ pin: '1357' })).status, 403, 'a wrong PIN');
  assert.equal((await key({ pin: 2468 })).status, 403, 'a PIN that isn\'t text');
  const right = await key({ pin: '2468' });
  assert.equal(right.status, 404, 'the right PIN gets past the check');
  assert.match(right.body.error, /No Google account/);
});

test('the demo never serves it', async (t) => {
  const server = await startServer({ DEMO_MODE: 'true' });
  t.after(() => server.stop());
  const res = await server.post('/api/backup/drive/backup-key', { fileId: 'any' });
  assert.equal(res.status, 403, JSON.stringify(res.body));
});
