// The daily bonus when a chore leaves someone's day (issue #298): every way
// of taking someone's last open chore off today pays the bonus they have now
// earned, as a snooze or a reassignment already does. A real server on a
// throwaway database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `daily-bonus-removal-${process.pid}-${Date.now()}.db`);
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
const del = (p) => api(p, { method: 'DELETE' });

// The server runs in UTC here, so "today" is the UTC date.
const shift = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const today = shift(0);

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

// Someone with two everyday chores who has done one. Returns the open one.
let people = 0;
async function halfDone() {
  people += 1;
  const userId = (await post('/api/users', { username: `Kid ${people}`, email: `kid${people}@example.com` })).body.id;
  const make = async (title) => {
    const chore = (await post('/api/chores', { title, clam_value: 0 })).body.id;
    const schedule = (await post('/api/chore-schedules', { chore_id: chore, user_id: userId, crontab: '0 0 * * *' })).body.id;
    return { chore, schedule };
  };
  const done = await make(`Done ${people}`);
  const open = await make(`Open ${people}`);
  const completed = await post('/api/chores/complete', { chore_schedule_id: done.schedule, user_id: userId, date: today });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(await bonusFor(userId), 0, 'one chore still open: no bonus yet');
  return { userId, open };
}

const bonusFor = async (userId) => (await api(`/api/chore-history?date=${today}&user_id=${userId}`)).body
  .filter((row) => row.kind === 'daily_bonus').length;

test('deleting the last open schedule pays the day\'s bonus', async () => {
  const { userId, open } = await halfDone();
  assert.equal((await del(`/api/chore-schedules/${open.schedule}`)).status, 200);
  assert.equal(await bonusFor(userId), 1);
});

test('deleting the last open chore pays it', async () => {
  const { userId, open } = await halfDone();
  assert.equal((await del(`/api/chores/${open.chore}`)).status, 200);
  assert.equal(await bonusFor(userId), 1);
});

test('deleting it among several chores at once pays it', async () => {
  const { userId, open } = await halfDone();
  const other = (await post('/api/chores', { title: 'Unassigned', clam_value: 0 })).body.id;
  const res = await api('/api/chores/bulk', { method: 'DELETE', body: JSON.stringify({ ids: [open.chore, other] }) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await bonusFor(userId), 1);
});

test('hiding it pays it', async () => {
  const { userId, open } = await halfDone();
  assert.equal((await patch(`/api/chore-schedules/${open.schedule}`, { visible: 0 })).status, 200);
  assert.equal(await bonusFor(userId), 1);
});

test('moving it to other days pays it', async () => {
  const { userId, open } = await halfDone();
  const tomorrow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 1) % 7;
  assert.equal((await patch(`/api/chore-schedules/${open.schedule}`, { crontab: `0 0 * * ${tomorrow}` })).status, 200);
  assert.equal(await bonusFor(userId), 1);
});

test('giving it clams, which makes it a bonus chore, pays it', async () => {
  const { userId, open } = await halfDone();
  const res = await patch(`/api/chores/${open.chore}`, { title: 'Now a bonus', description: null, clam_value: 3, icon: null });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await bonusFor(userId), 1);
});

test('deleting a routine that was the last thing open pays it', async () => {
  people += 1;
  const userId = (await post('/api/users', { username: `Kid ${people}`, email: `kid${people}@example.com` })).body.id;
  const chore = (await post('/api/chores', { title: `Done ${people}`, clam_value: 0 })).body.id;
  const schedule = (await post('/api/chore-schedules', { chore_id: chore, user_id: userId, crontab: '0 0 * * *' })).body.id;
  const step = (await post('/api/routine-steps', { label: 'Brush teeth' })).body.id;
  const made = await post('/api/routines', { name: 'Bedtime', user_id: userId, trigger: 'days', days: [], steps: [step] });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  await post('/api/chores/complete', { chore_schedule_id: schedule, user_id: userId, date: today });
  assert.equal(await bonusFor(userId), 0, 'the routine is still open');
  assert.equal((await del(`/api/routines/${made.body.id}`)).status, 200);
  assert.equal(await bonusFor(userId), 1);
});

test('removing a chore while another is still open pays nothing, and paying is once', async () => {
  const { userId, open } = await halfDone();
  const third = (await post('/api/chores', { title: 'Third', clam_value: 0 })).body.id;
  const thirdSchedule = (await post('/api/chore-schedules', { chore_id: third, user_id: userId, crontab: '0 0 * * *' })).body.id;
  assert.equal((await del(`/api/chore-schedules/${open.schedule}`)).status, 200);
  assert.equal(await bonusFor(userId), 0, 'the third is still open');
  assert.equal((await patch(`/api/chore-schedules/${thirdSchedule}`, { visible: 0 })).status, 200);
  assert.equal(await bonusFor(userId), 1);
  assert.equal((await patch(`/api/chore-schedules/${thirdSchedule}`, { visible: 1 })).status, 200);
  assert.equal((await patch(`/api/chore-schedules/${thirdSchedule}`, { visible: 0 })).status, 200);
  assert.equal(await bonusFor(userId), 1, 'not paid twice');
});
