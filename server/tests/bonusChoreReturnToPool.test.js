// A recurring bonus chore claimed from the pool and completed should cycle
// back to the pool at the nightly cleanup — not stay assigned to whoever
// claimed it. The nightly reset used to touch only one-time cards
// (crontab IS NULL), so a daily bonus chore kept its claimer forever. A
// real HomeGlow server on a throwaway database; the nightly job runs via
// /api/system/backgroundTasks and "yesterday" is simulated by completing
// with a past date, which the complete endpoint accepts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `bonus-chore-return-to-pool-${process.pid}-${Date.now()}.db`);
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
const nightly = () => api('/api/system/backgroundTasks');

// The server runs in UTC here, so "today" is the UTC date.
const shift = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const today = shift(0);
const yesterday = shift(-1);

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

const scheduleById = async (id) => (await api('/api/chore-schedules')).body.find((s) => s.id === id);

let people = 0;
// userId omitted: create a user and assign the schedule to them.
// userId null: leave the schedule unassigned (in the bonus pool).
async function makeRecurringChore({ title, clamValue, userId = undefined }) {
  people += 1;
  const user = userId === undefined
    ? (await post('/api/users', { username: `Kid ${people}`, email: `kid${people}@example.com` })).body.id
    : userId;
  const chore = (await post('/api/chores', { title, clam_value: clamValue })).body.id;
  const made = await post('/api/chore-schedules', { chore_id: chore, user_id: user ?? null, crontab: '0 0 * * *' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  return { userId: user, chore, scheduleId: made.body.id };
}

test('a claimed + completed recurring bonus chore returns to the pool overnight', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Empty the dishwasher', clamValue: 2, userId: null });
  const kid = (await post('/api/users', { username: 'Claimer', email: 'claimer@example.com' })).body.id;

  // Claim it from the pool, as the widget's bonus section does.
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1 })).status, 200);
  assert.equal((await scheduleById(scheduleId)).user_id, kid);

  // Complete it for yesterday, then run the nightly job.
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: kid, date: yesterday });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));

  // Back in the pool: unassigned, and claimable again.
  assert.equal((await scheduleById(scheduleId)).user_id, null);
  assert.equal(run.body.returnedBonusSchedulesCount, 1, JSON.stringify(run.body));
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1 })).status, 200);
  assert.equal((await scheduleById(scheduleId)).user_id, kid);
});

test('a claimed but uncompleted recurring bonus chore stays assigned', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Take out recycling', clamValue: 2, userId: null });
  const kid = (await post('/api/users', { username: 'Holder', email: 'holder@example.com' })).body.id;
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1 })).status, 200);

  // No completion: the nightly job must not take it off them — they still owe it.
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(scheduleId)).user_id, kid);
});

test('a completion today does not return it to the pool early', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Wipe the table', clamValue: 2, userId: null });
  const kid = (await post('/api/users', { username: 'Early', email: 'early@example.com' })).body.id;
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1 })).status, 200);
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: kid, date: today });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));

  // Only the day that just ended cycles back: returning it now would let
  // someone else claim and complete the same chore again today.
  await nightly();
  assert.equal((await scheduleById(scheduleId)).user_id, kid);
});

test('a non-bonus recurring chore is unaffected', async () => {
  const { userId, scheduleId } = await makeRecurringChore({ title: 'Make bed', clamValue: 0 });
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: userId, date: yesterday });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(scheduleId)).user_id, userId);
});

test('manually transferring a recurring bonus chore back to the pool still works', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Sort laundry', clamValue: 2, userId: null });
  const kid = (await post('/api/users', { username: 'Mover', email: 'mover@example.com' })).body.id;
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1 })).status, 200);

  // The Transfer dialog's pool target: user_id 0 stores NULL.
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: 0, visible: 1 })).status, 200);
  assert.equal((await scheduleById(scheduleId)).user_id, null);

  // ...and it can be claimed again afterwards.
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1 })).status, 200);
  assert.equal((await scheduleById(scheduleId)).user_id, kid);
});
