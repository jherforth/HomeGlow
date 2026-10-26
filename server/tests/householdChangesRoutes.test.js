// GET /api/changes and what moves its counters, on a real server (issue #325).
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
let port;
let dataDir;

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-changes-'));
  port = await freePort();
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
  return { status: res.status, headers: res.headers, body: parsed };
}
const changes = async () => (await call('GET', '/api/changes')).body;
const moved = (before, after) => Object.keys(after).filter((domain) => after[domain] !== before[domain]).sort();

test('GET /api/changes gives one counter per kind, and 304 while nothing changes', async () => {
  const first = await call('GET', '/api/changes');
  assert.equal(first.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ['calendar', 'chores', 'prizes', 'settings', 'users']);
  const tag = first.headers.get('etag');
  assert.ok(tag);
  assert.equal(first.headers.get('cache-control'), 'no-cache');

  const again = await fetch(`${base}/api/changes`, { headers: { 'If-None-Match': tag } });
  assert.equal(again.status, 304);
});

test('a write moves the kinds it touches; reads and failures move nothing', async () => {
  let before = await changes();
  const user = await call('POST', '/api/users', { username: 'Ava', email: 'ava@example.com' });
  assert.equal(user.status, 200);
  let after = await changes();
  assert.deepEqual(moved(before, after), ['users']);

  before = after;
  const chore = await call('POST', '/api/chores', { title: 'Dishes', clam_value: 2 });
  const schedule = await call('POST', '/api/chore-schedules', { chore_id: chore.body.id, user_id: user.body.id, crontab: '0 0 * * *' });
  assert.equal(schedule.status, 200, JSON.stringify(schedule.body));
  const done = await call('POST', '/api/chores/complete', {
    chore_schedule_id: schedule.body.id, user_id: user.body.id, date: new Date().toISOString().slice(0, 10),
  });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  after = await changes();
  assert.deepEqual(moved(before, after), ['chores', 'users'], 'a completion moves clam totals too');

  before = after;
  await call('GET', '/api/chores');
  await call('GET', '/api/users');
  await call('POST', '/api/chores/complete', { chore_schedule_id: 999999, user_id: user.body.id, date: '2026-01-01' });
  await call('POST', '/api/settings/search', { query: 'x' });
  after = await changes();
  assert.deepEqual(moved(before, after), []);

  before = after;
  await call('POST', '/api/settings', { key: 'CALENDAR_DEDUP_ENABLED', value: 'false' });
  after = await changes();
  assert.deepEqual(moved(before, after), ['settings']);
});

test('the nightly job tells the displays too', async () => {
  const before = await changes();
  const res = await call('GET', '/api/system/backgroundTasks');
  assert.equal(res.status, 200);
  assert.deepEqual(moved(before, await changes()), ['chores', 'users']);
});

test('the event stream carries each burst of changes', async () => {
  const received = new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/plugin/v1/events/stream`, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        for (const line of buffer.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const message = JSON.parse(line.slice(6));
          // An earlier test's burst may still be on its way out.
          if (message.event === 'household.changed' && message.payload.domains.includes('prizes')) {
            req.destroy();
            resolve(message.payload);
          }
        }
      });
    });
    req.on('error', (error) => { if (error.code !== 'ECONNRESET') reject(error); });
    setTimeout(() => { req.destroy(); reject(new Error('no household.changed event')); }, 5000);
  });
  await delay(200);
  await call('POST', '/api/prizes', { name: 'Movie night', clam_cost: 20 });
  const payload = await received;
  assert.deepEqual(payload.domains, ['users', 'prizes']);
  assert.deepEqual(payload.revisions, await changes());
});
