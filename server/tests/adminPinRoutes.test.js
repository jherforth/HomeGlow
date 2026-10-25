// The admin PIN routes and what they guard, on a real server
// (mrramam/HomeGlow#62, #73). One server for the file: the limit on wrong
// guesses is the server's own state, so the test that trips it runs last.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PIN = '4321';

let child;
let base;
let port;
let dataDir;
let dbPath;

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-admin-pin-'));
  dbPath = path.join(dataDir, 'tasks.db');
  port = await freePort();
  child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: dbPath, TZ: 'UTC', DEMO_MODE: 'false',
      ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
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

const json = async (res) => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
async function call(method, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: await json(res) };
}
async function importBackup(pin) {
  const form = new FormData();
  if (pin !== undefined) form.append('pin', pin);
  form.append('file', new Blob([Buffer.from('not a backup')], { type: 'application/gzip' }), 'backup.tar.gz');
  const res = await fetch(`${base}/api/backup/local/import`, { method: 'POST', body: form });
  return { status: res.status, body: await json(res) };
}
// node:http, so the request carries exactly the headers a browser would.
function browserPost(pathname, headers, body = '{}') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const storedHash = () => {
  const db = new Database(dbPath, { readonly: true });
  try { return db.prepare('SELECT pin_hash FROM admin_pin WHERE id = 1').get()?.pin_hash; } finally { db.close(); }
};

test('set stores a salted hash, and exists never shows it', async () => {
  assert.deepEqual((await call('GET', '/api/admin-pin/exists')).body, { exists: false });
  assert.equal((await call('POST', '/api/admin-pin/set', { pin: '12' })).status, 400);
  assert.equal((await call('POST', '/api/admin-pin/set', { pin: 'abcd' })).status, 400);
  assert.equal((await call('POST', '/api/admin-pin/set', { pin: PIN })).status, 200);

  const exists = await call('GET', '/api/admin-pin/exists');
  assert.deepEqual(exists.body, { exists: true });
  assert.match(storedHash(), /^scrypt\$/);
  assert.ok(!JSON.stringify(exists.body).includes(storedHash().split('$')[2]));
});

test('verify accepts the PIN and refuses anything else', async () => {
  assert.deepEqual((await call('POST', '/api/admin-pin/verify', { pin: PIN })).body, { valid: true });
  assert.deepEqual((await call('POST', '/api/admin-pin/verify', { pin: '1111' })).body, { valid: false });
  assert.equal((await call('POST', '/api/admin-pin/verify', {})).status, 400);
  // Reset the count: the right PIN clears the wrong guess above.
  assert.deepEqual((await call('POST', '/api/admin-pin/verify', { pin: PIN })).body, { valid: true });
});

test('a PIN saved by an older version works and is rehashed', async () => {
  const db = new Database(dbPath);
  db.prepare('UPDATE admin_pin SET pin_hash = ? WHERE id = 1').run(crypto.createHash('sha256').update('8642').digest('hex'));
  db.close();
  assert.deepEqual((await call('POST', '/api/admin-pin/verify', { pin: '8642' })).body, { valid: true });
  assert.match(storedHash(), /^scrypt\$/);
  assert.equal((await call('POST', '/api/admin-pin/set', { pin: PIN })).status, 200);
});

test('staging a restore or a rollback asks for the PIN', async () => {
  const noPin = await importBackup();
  assert.equal(noPin.status, 403);
  assert.equal(noPin.body.needsPin, true);
  // With the PIN the file is read, and this one isn't a backup.
  const withPin = await importBackup(PIN);
  assert.equal(withPin.status, 400, JSON.stringify(withPin.body));

  assert.equal((await call('POST', '/api/backup/drive/restore/rollback', {})).status, 403);
  assert.notEqual((await call('POST', '/api/backup/drive/restore/rollback', { pin: PIN })).status, 403);

  assert.equal((await call('POST', '/api/backup/drive/restore/stage', { fileId: 'x' })).status, 403);
  // Past the PIN, there is no Google account.
  assert.equal((await call('POST', '/api/backup/drive/restore/stage', { fileId: 'x', pin: PIN })).status, 404);

  // Cancel and restart apply nothing the PIN hasn't allowed.
  assert.equal((await call('POST', '/api/backup/drive/restore/cancel', {})).status, 200);
  assert.equal((await call('POST', '/api/backup/drive/restart', {})).status, 400, 'no restore is staged');
});

test('a write from another website is refused; the dashboard and scripts are not', async () => {
  const body = JSON.stringify({ key: 'CALENDAR_DEDUP_ENABLED', value: 'true' });
  const crossSite = await browserPost('/api/settings', { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }, body);
  assert.equal(crossSite.status, 403);
  const sameOrigin = await browserPost('/api/settings', { Origin: `http://homeglow.local:${port}`, 'Sec-Fetch-Site': 'same-origin' }, body);
  assert.equal(sameOrigin.status, 200);
  const script = await browserPost('/api/settings', {}, body);
  assert.equal(script.status, 200);
});

test('five wrong guesses make even the right PIN wait, on every route that checks it', async () => {
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual((await call('POST', '/api/admin-pin/verify', { pin: '0000' })).body, { valid: false });
  }
  const locked = await call('POST', '/api/admin-pin/verify', { pin: PIN });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  assert.ok(locked.body.retryAfterSeconds > 0);

  const exportLocked = await call('POST', '/api/backup/local/export', { pin: PIN });
  assert.equal(exportLocked.status, 429);

  // Clearing the PIN needs no PIN, which is the Admin Panel's job.
  assert.equal((await call('DELETE', '/api/admin-pin')).status, 200);
  assert.deepEqual((await call('GET', '/api/admin-pin/exists')).body, { exists: false });
});
