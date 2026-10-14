// Chores that expire (issue #279), end to end: a real HomeGlow server on a
// throwaway database. Past its expiry, a chore (or a routine) is completed
// only with a parent's approval, and the completion is marked approved late.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `chore-expiry-${process.pid}-${Date.now()}.db`);
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
const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });

// The server runs in UTC here, so dates are UTC dates.
const shift = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

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

let kid;
const yesterday = shift(-1);
const historyOf = async (date) => (await api(`/api/chore-history?date=${date}`)).body;
const scheduleById = async (id) => (await api('/api/chore-schedules')).body.find((s) => s.id === id);

test('the expiry needs a due time, takes only the offered choices, and goes with the due time', async () => {
  kid = (await post('/api/users', { username: 'Leo', email: 'leo@example.com' })).body.id;
  const chore = (await post('/api/chores', { title: 'Feed the fish', clam_value: 2 })).body.id;
  const base = { chore_id: chore, user_id: kid, crontab: '0 0 * * *' };
  assert.equal((await post('/api/chore-schedules', { ...base, expire_minutes: 30 })).status, 400, 'no due time');
  assert.equal((await post('/api/chore-schedules', { ...base, due_time: '07:00', expire_minutes: 45 })).status, 400, 'not a choice');

  const made = await post('/api/chore-schedules', { ...base, due_time: '07:00', expire_minutes: 30 });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.id;
  assert.equal((await scheduleById(id)).expire_minutes, 30);
  assert.equal((await patch(`/api/chore-schedules/${id}`, { expire_minutes: 60 })).status, 200);
  assert.equal((await scheduleById(id)).expire_minutes, 60);
  assert.equal((await patch(`/api/chore-schedules/${id}`, { due_time: null })).status, 200);
  assert.equal((await scheduleById(id)).expire_minutes, null, 'cleared with the due time');
  assert.equal((await patch(`/api/chore-schedules/${id}`, { expire_minutes: 60 })).status, 400);
});

test('past its expiry, a chore is done only with a parent\'s approval, for full credit, marked approved late', async () => {
  const chore = (await post('/api/chores', { title: 'Make bed', clam_value: 3 })).body.id;
  // Due at midnight, expiring then: yesterday's has long expired.
  const expired = (await post('/api/chore-schedules', {
    chore_id: chore, user_id: kid, crontab: '0 0 * * *', due_time: '00:00', expire_minutes: 0,
  })).body.id;
  const body = { chore_schedule_id: expired, user_id: kid, date: yesterday };
  const refused = await post('/api/chores/complete', body);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, 'CHORE_EXPIRED');
  assert.ok(!(await historyOf(yesterday)).some((h) => h.chore_schedule_id === expired), 'nothing written');

  const approved = await post('/api/chores/complete', { ...body, parent_approved: true });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const row = (await historyOf(yesterday)).find((h) => h.chore_schedule_id === expired);
  assert.equal(row.approved_late, 1);
  assert.equal(row.clam_value, 3, 'full credit');

  // A chore without an expiry is done as ever, and not marked.
  const plain = (await post('/api/chore-schedules', { chore_id: chore, user_id: kid, crontab: '0 0 * * *', due_time: '00:00' })).body.id;
  assert.equal((await post('/api/chores/complete', { chore_schedule_id: plain, user_id: kid, date: yesterday })).status, 200);
  assert.equal((await historyOf(yesterday)).find((h) => h.chore_schedule_id === plain).approved_late, 0);
});

test('a routine expires its buffer after its end time, and one approval completes it', async () => {
  const steps = [];
  for (const label of ['Shoes on', 'Coat on']) steps.push((await post('/api/routine-steps', { label })).body.id);
  const routineBody = { name: 'Out the door', user_id: kid, trigger: 'days', days: [], steps, end_time: '00:30', expire_minutes: 15 };
  assert.equal((await post('/api/routines', routineBody)).status, 400, 'a weekday routine needs its start time too');
  assert.equal((await post('/api/routines', { ...routineBody, start_time: '00:00', end_time: null })).status, 400, 'and an end time');

  const made = await post('/api/routines', { ...routineBody, start_time: '00:00' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const r = made.body;
  assert.equal((await scheduleById(r.schedule_id)).expire_minutes, 45, 'from its start: 30 to the end, then 15 more');

  // Yesterday's expired: a step can't be ticked without a parent.
  const refused = await post(`/api/routines/${r.id}/steps/${steps[0]}`, { date: yesterday, done: true });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, 'CHORE_EXPIRED');
  const approved = await post(`/api/routines/${r.id}/steps/${steps[0]}`, { date: yesterday, done: true, parent_approved: true });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.completed, true);
  assert.deepEqual([...approved.body.done].sort(), [...steps].sort(), 'one approval, every step');
  assert.equal((await historyOf(yesterday)).find((h) => h.chore_schedule_id === r.schedule_id).approved_late, 1);

  // Edited not to expire: its schedule follows.
  assert.equal((await patch(`/api/routines/${r.id}`, { ...r, expire_minutes: null })).status, 200);
  assert.equal((await scheduleById(r.schedule_id)).expire_minutes, null);
});
