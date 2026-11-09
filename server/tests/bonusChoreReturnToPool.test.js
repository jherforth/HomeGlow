// A recurring bonus chore claimed from the pool returns to it at the
// nightly cleanup — done or not. The first version of this fix returned a
// schedule only when its holder had completed it yesterday, which had two
// holes Jay caught on review: it also pulled in a recurring chore a parent
// had assigned (the server could not tell a claim from an assignment —
// both were PATCH user_id), and a missed night stranded the claim for
// good. So claiming is now its own route
// (POST /api/chore-schedules/:id/claim) that records the claim date on
// the schedule (pool_claimed_on, migration schema42), and the nightly job
// returns only schedules carrying that marker, every night, clearing it
// as it goes. A real HomeGlow server on a throwaway database; the nightly
// job runs via /api/system/backgroundTasks and past dates are simulated by
// completing with a past date, which the complete endpoint accepts.
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
const twoDaysAgo = shift(-2);

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
async function makeKid(username) {
  people += 1;
  return (await post('/api/users', { username: username || `Kid ${people}`, email: `kid${people}@example.com` })).body.id;
}
// userId omitted: create a user and assign the schedule to them (a parent
// assignment, made at creation). userId null: leave the schedule
// unassigned (in the bonus pool).
async function makeRecurringChore({ title, clamValue, userId = undefined }) {
  const user = userId === undefined ? await makeKid() : userId;
  const chore = (await post('/api/chores', { title, clam_value: clamValue })).body.id;
  const made = await post('/api/chore-schedules', { chore_id: chore, user_id: user ?? null, crontab: '0 0 * * *' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  return { userId: user, chore, scheduleId: made.body.id };
}
// Claim it from the pool, as the widget's bonus section does.
async function claimSchedule(scheduleId, kid) {
  const claimed = await post(`/api/chore-schedules/${scheduleId}/claim`, { user_id: kid });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  return claimed.body;
}

test('a claimed + completed recurring bonus chore returns to the pool overnight', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Empty the dishwasher', clamValue: 2, userId: null });
  const kid = await makeKid('Claimer');

  await claimSchedule(scheduleId, kid);
  assert.equal((await scheduleById(scheduleId)).user_id, kid);

  // Complete it for yesterday, then run the nightly job.
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: kid, date: yesterday });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));

  // Back in the pool: unassigned, marker cleared, and claimable again.
  assert.equal((await scheduleById(scheduleId)).user_id, null);
  assert.equal((await scheduleById(scheduleId)).pool_claimed_on, null);
  assert.equal(run.body.returnedBonusSchedulesCount, 1, JSON.stringify(run.body));
  await claimSchedule(scheduleId, kid);
  assert.equal((await scheduleById(scheduleId)).user_id, kid);
  // Leave it returned, so a later test's nightly run has nothing of this
  // test's to move.
  await nightly();
  assert.equal((await scheduleById(scheduleId)).user_id, null);
});

test('a claimed but uncompleted recurring bonus chore returns to the pool overnight', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Take out recycling', clamValue: 2, userId: null });
  const kid = await makeKid('Holder');
  await claimSchedule(scheduleId, kid);

  // Done or not, a claimed chore cycles back each night — that is how
  // one-time bonus cards already work, and the docs say bonus chores
  // "reset to unassigned each night".
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(scheduleId)).user_id, null);
  assert.equal((await scheduleById(scheduleId)).pool_claimed_on, null);
});

test('a claimed + completed-today recurring bonus chore returns overnight', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Wipe the table', clamValue: 2, userId: null });
  const kid = await makeKid('Early');
  await claimSchedule(scheduleId, kid);
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: kid, date: today });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));

  // The return happens at midnight, after today is over: nobody can claim
  // and complete the same chore again today.
  await nightly();
  assert.equal((await scheduleById(scheduleId)).user_id, null);
});

test('a claim from two days ago returns even when a night was missed', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Feed the dog', clamValue: 2, userId: null });
  const kid = await makeKid('Missed');
  await claimSchedule(scheduleId, kid);
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: kid, date: twoDaysAgo });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));

  // No nightly run happened last night (the server was off): the marker
  // is still there, so the next run returns it — the old
  // "completed yesterday" check would have left it with the kid for good.
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(scheduleId)).user_id, null);
  assert.equal(run.body.returnedBonusSchedulesCount, 1, JSON.stringify(run.body));
});

test('a parent-assigned recurring chore that pays clams stays with its owner', async () => {
  // Jay's case A: "Mow the lawn, 5 clams, every day, for Sam" — assigned
  // by a parent, not claimed from the pool. The old query matched any
  // recurring assigned schedule with clams, so it took it off Sam.
  const { userId, scheduleId } = await makeRecurringChore({ title: 'Mow the lawn', clamValue: 5 });
  assert.equal((await scheduleById(scheduleId)).pool_claimed_on, null);
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: userId, date: yesterday });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(scheduleId)).user_id, userId);
  assert.equal(run.body.returnedBonusSchedulesCount, 0, JSON.stringify(run.body));
});

test('a claim through the new route sets the marker and an admin assign does not', async () => {
  const first = await makeRecurringChore({ title: 'Vacuum the stairs', clamValue: 2, userId: null });
  const kid = await makeKid('Marked');
  await claimSchedule(first.scheduleId, kid);
  assert.equal((await scheduleById(first.scheduleId)).pool_claimed_on, today);

  // The same schedule handed out by an admin (PATCH, as AdminPanel does)
  // carries no marker: it is an assignment, not a claim.
  const second = await makeRecurringChore({ title: 'Dust the shelves', clamValue: 2, userId: null });
  assert.equal((await patch(`/api/chore-schedules/${second.scheduleId}`, { user_id: kid, visible: 1 })).status, 200);
  assert.equal((await scheduleById(second.scheduleId)).pool_claimed_on, null);

  // The nightly job returns the claimed one and leaves the admin-assigned
  // one alone.
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(first.scheduleId)).user_id, null);
  assert.equal((await scheduleById(second.scheduleId)).user_id, kid);
});

test('a one-time claim reset clears the marker so a later parent assignment sticks', async () => {
  // Jay's repro: Ava claims a one-time "Clean the garage". The nightly
  // job resets it; if the marker survived, a parent PATCHing it to Leo
  // as a daily chore would lose it the next night.
  const chore = (await post('/api/chores', { title: 'Clean the garage', clam_value: 3 })).body.id;
  const made = await post('/api/chore-schedules', { chore_id: chore, user_id: null });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const scheduleId = made.body.id;
  const ava = await makeKid('Ava');
  await claimSchedule(scheduleId, ava);
  assert.equal((await scheduleById(scheduleId)).pool_claimed_on, today);

  // The nightly one-time reset puts the card back in the pool — and
  // clears the marker with it.
  const reset = await nightly();
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await scheduleById(scheduleId)).user_id, null);
  assert.equal((await scheduleById(scheduleId)).pool_claimed_on, null);
  assert.equal(reset.body.resetSchedulesCount, 1, JSON.stringify(reset.body));

  // A parent makes it Leo's daily chore. The next night Leo keeps it:
  // without the marker it is an assignment, not a claim.
  const leo = await makeKid('Leo');
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: leo, crontab: '0 0 * * *' })).status, 200);
  const completed = await post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: leo, date: yesterday });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(scheduleId)).user_id, leo);
  assert.equal(run.body.returnedBonusSchedulesCount, 0, JSON.stringify(run.body));
});

test('the claim route enforces one open bonus chore per kid', async () => {
  const first = await makeRecurringChore({ title: 'Sweep the porch', clamValue: 2, userId: null });
  const second = await makeRecurringChore({ title: 'Water the plants', clamValue: 2, userId: null });
  const kid = await makeKid('Greedy');
  await claimSchedule(first.scheduleId, kid);

  // An outstanding bonus chore blocks another claim — the server check, so
  // a second display cannot race past the widget's own check.
  const blocked = await post(`/api/chore-schedules/${second.scheduleId}/claim`, { user_id: kid });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal((await scheduleById(second.scheduleId)).user_id, null);

  // Once the first one is done today, the second can be claimed.
  const completed = await post('/api/chores/complete', { chore_schedule_id: first.scheduleId, user_id: kid, date: today });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  await claimSchedule(second.scheduleId, kid);
  assert.equal((await scheduleById(second.scheduleId)).user_id, kid);

  // Tidy up: both return at the next nightly run.
  await nightly();
  assert.equal((await scheduleById(second.scheduleId)).user_id, null);
});

test('transferring a claimed chore to another kid keeps the marker', async () => {
  const { scheduleId } = await makeRecurringChore({ title: 'Clean the mirrors', clamValue: 2, userId: null });
  const firstKid = await makeKid('First');
  const secondKid = await makeKid('Second');
  await claimSchedule(scheduleId, firstKid);

  // The Transfer dialog reassigns with PATCH: the marker stays, so the
  // chore still cycles back at the nightly cleanup under its new holder.
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: secondKid, visible: 1 })).status, 200);
  assert.equal((await scheduleById(scheduleId)).pool_claimed_on, today);
  const run = await nightly();
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal((await scheduleById(scheduleId)).user_id, null);
  assert.equal((await scheduleById(scheduleId)).pool_claimed_on, null);
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
  const kid = await makeKid('Mover');
  await claimSchedule(scheduleId, kid);

  // The Transfer dialog's pool target: user_id 0 stores NULL — and the
  // marker goes with it, since the claim is over.
  assert.equal((await patch(`/api/chore-schedules/${scheduleId}`, { user_id: 0, visible: 1 })).status, 200);
  const afterTransfer = await scheduleById(scheduleId);
  assert.equal(afterTransfer.user_id, null);
  assert.equal(afterTransfer.pool_claimed_on, null);

  // ...and it can be claimed again afterwards.
  await claimSchedule(scheduleId, kid);
  assert.equal((await scheduleById(scheduleId)).user_id, kid);
  await nightly();
  assert.equal((await scheduleById(scheduleId)).user_id, null);
});
