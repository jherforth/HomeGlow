// Sticky schedules (until-completed, once-completed) appear the moment they
// are set up on a day they fire, not from midnight (issue #256). The dashboard
// shows a sticky schedule only through its one-time child, which the nightly
// job used to be alone in creating: a chore set up at 9 AM was missing all
// day, and one that fires only on Mondays, set up on a Monday, for a week.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `sticky-schedules-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The server runs in UTC here, so this is its today and its weekday.
const today = new Date().toISOString().slice(0, 10);
const todayWeekday = new Date().getUTCDay();
const otherWeekday = (todayWeekday + 3) % 7;

async function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });

const newUser = async (username) => (await post('/api/users', { username })).body.id;
const newChore = async (title) => (await post('/api/chores', { title, description: '', clam_value: 0 })).body.id;
// What the dashboard asks for (ChoreWidget): sticky parents are left out.
const dashboard = async () => (await api('/api/chore-schedules?usage=chart')).body;
const childrenOf = async (parentId) => (await dashboard()).filter((s) => s.parent_schedule_id === parentId);

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: testDbPath,
      TZ: 'UTC',
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
      HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
      HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
      ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk; });
  serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk; });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      if ((await fetch(`${baseUrl}/api/test`)).ok) return;
    } catch { /* starting */ }
    await delay(250);
  }
  throw new Error(`Server did not start:\n${serverLogs}`);
});

// Wait for the server to exit: Windows won't delete a database it still has open.
const stopServer = () => new Promise((resolve) => {
  if (!serverProcess || serverProcess.exitCode !== null) return resolve();
  serverProcess.once('close', resolve);
  serverProcess.kill();
  setTimeout(resolve, 5000);
});

test.after(async () => {
  await stopServer();
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});

test('an until-completed schedule that fires today is on the dashboard at once', async () => {
  const userId = await newUser('Mom');
  const choreId = await newChore('Fold laundry');
  const created = await post('/api/chore-schedules', { chore_id: choreId, user_id: userId, crontab: '0 0 * * *', duration: 'until-completed' });
  assert.equal(created.status, 200, JSON.stringify(created.body));

  const children = await childrenOf(created.body.id);
  assert.equal(children.length, 1);
  assert.equal(children[0].crontab, null, 'a one-time child');
  assert.equal(children[0].user_id, userId);
  assert.equal(children[0].chore_id, choreId);
  assert.ok(!(await dashboard()).some((s) => s.id === created.body.id), 'the parent itself stays off the dashboard');

  // The nightly job, run again today, does not make a second one.
  assert.equal((await api('/api/system/backgroundTasks')).status, 200);
  assert.equal((await childrenOf(created.body.id)).length, 1);
});

test('a once-completed schedule that fires today is on the dashboard at once, with its due date', async () => {
  const userId = await newUser('Liam');
  const choreId = await newChore('Water plants');
  const created = await post('/api/chore-schedules', {
    chore_id: choreId, user_id: userId, crontab: `0 0 * * ${todayWeekday}`, duration: 'once-completed', interval: '3d', due_time: '17:00',
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const [child] = await childrenOf(created.body.id);
  assert.ok(child);
  assert.equal(child.due_time, '17:00', 'the child carries the parent\'s settings');
});

test('a sticky schedule that does not fire today waits for its day', async () => {
  const userId = await newUser('Ava');
  const choreId = await newChore('Mow the lawn');
  const created = await post('/api/chore-schedules', { chore_id: choreId, user_id: userId, crontab: `0 0 * * ${otherWeekday}`, duration: 'until-completed' });
  assert.equal((await childrenOf(created.body.id)).length, 0);

  // Moved to today: it appears at once, and only once.
  assert.equal((await patch(`/api/chore-schedules/${created.body.id}`, { crontab: `0 0 * * ${todayWeekday}` })).status, 200);
  assert.equal((await childrenOf(created.body.id)).length, 1);
  assert.equal((await patch(`/api/chore-schedules/${created.body.id}`, { crontab: '0 0 * * *', due_time: '08:00' })).status, 200);
  assert.equal((await childrenOf(created.body.id)).length, 1);
});

test('a hidden sticky schedule appears only when shown', async () => {
  const userId = await newUser('Sam');
  const choreId = await newChore('Empty dishwasher');
  const created = await post('/api/chore-schedules', { chore_id: choreId, user_id: userId, crontab: '0 0 * * *', duration: 'until-completed', visible: 0 });
  assert.equal((await childrenOf(created.body.id)).length, 0);
  await patch(`/api/chore-schedules/${created.body.id}`, { visible: 1 });
  assert.equal((await childrenOf(created.body.id)).length, 1);
});

test('a chore done today does not come back when its schedule is edited', async () => {
  const userId = await newUser('Kim');
  const choreId = await newChore('Make bed');
  const created = await post('/api/chore-schedules', { chore_id: choreId, user_id: userId, crontab: '0 0 * * *', duration: 'until-completed' });
  const [child] = await childrenOf(created.body.id);
  const done = await post('/api/chores/complete', { chore_schedule_id: child.id, user_id: userId, date: today });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  await patch(`/api/chore-schedules/${created.body.id}`, { crontab: '0 0 * * *', due_time: '07:30' });
  assert.equal((await childrenOf(created.body.id)).length, 1, 'still just the completed one');
});

test('a schedule made for several people gives each their own chore today', async () => {
  const a = await newUser('Ann');
  const b = await newUser('Ben');
  const choreId = await newChore('Feed the cat');
  const created = await post('/api/chore-schedules', { chore_id: choreId, user_ids: [a, b], crontab: '0 0 * * *', duration: 'until-completed' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const children = (await dashboard()).filter((s) => created.body.ids.includes(s.parent_schedule_id));
  assert.deepEqual(children.map((c) => c.user_id).sort(), [a, b].sort());
});

test('an ordinary day-of schedule is untouched', async () => {
  const userId = await newUser('Zoe');
  const choreId = await newChore('Brush teeth');
  const created = await post('/api/chore-schedules', { chore_id: choreId, user_id: userId, crontab: '0 0 * * *', duration: 'day-of' });
  assert.equal((await childrenOf(created.body.id)).length, 0);
  assert.ok((await dashboard()).some((s) => s.id === created.body.id), 'it shows itself, as before');
});
