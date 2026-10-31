// "Once a week, any day" chores, end to end: a real HomeGlow server on a
// throwaway database. The server runs in UTC on today's date, so a past week
// is made by moving a card's due date back, as the nightly job would find it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');
const { weekEndOf } = require('../services/weeklyChores');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `weekly-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

const shift = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const today = shift(0);
const yesterday = shift(-1);
const saturday = weekEndOf(today);

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: testDbPath, TZ: 'UTC',
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1', HOMEGLOW_DISABLE_CALENDAR_SYNC: '1', HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk; });
  serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk; });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if ((await fetch(`${baseUrl}/api/test`)).ok) return; } catch { /* starting */ }
    await delay(250);
  }
  throw new Error('server did not start');
});

test.after(async () => {
  await new Promise((resolve) => {
    if (!serverProcess || serverProcess.exitCode !== null) return resolve();
    serverProcess.once('close', resolve);
    serverProcess.kill();
    setTimeout(resolve, 5000);
  });
  if (process.exitCode && serverLogs) console.error(serverLogs.slice(-4000));
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});

let n = 0;
async function person() {
  n += 1;
  return (await post('/api/users', { username: `kid${n}`, email: `kid${n}@example.com` })).body.id;
}
async function chore(title) {
  return (await post('/api/chores', { title, clam_value: 0 })).body.id;
}
async function weekly(userId, title = 'Practice piano') {
  const choreId = await chore(title);
  const res = await post('/api/chore-schedules', { chore_id: choreId, user_id: userId, crontab: '0 0 * * 3', duration: 'weekly' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { choreId, parentId: res.body.id };
}
// The person's weekly card: the visible child of the parent.
async function cardsOf(parentId) {
  return (await api('/api/chore-schedules')).body.filter((s) => s.parent_schedule_id === parentId);
}
const historyOf = async (userId) => (await api(`/api/chore-history?user_id=${userId}`)).body;
const nightly = () => api('/api/system/backgroundTasks');
const withDb = (work) => {
  const db = new Database(testDbPath);
  try { return work(db); } finally { db.close(); }
};

test('made weekly, it shows at once, due by this week\'s Saturday', async () => {
  const kid = await person();
  const { parentId } = await weekly(kid);
  const parent = (await api(`/api/chore-schedules/${parentId}`)).body;
  assert.equal(parent.crontab, '0 0 * * 0', 'the days mean nothing: it only marks the week start');
  assert.equal(parent.interval, null);

  const cards = await cardsOf(parentId);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].due_date, saturday);
  assert.equal(cards[0].crontab, null);
  assert.equal(cards[0].parent_duration, 'weekly');
  // The dashboard's list leaves the parent out, as with the other sticky ones.
  const chart = (await api(`/api/chore-schedules?usage=chart&user_id=${kid}`)).body;
  assert.deepEqual(chart.map((s) => s.id), [cards[0].id]);
});

test('it holds back the daily bonus on its Saturday only', async () => {
  const kid = await person();
  await weekly(kid);
  const dishesId = await chore('Dishes');
  const dishes = (await post('/api/chore-schedules', { chore_id: dishesId, user_id: kid, crontab: '0 0 * * *', duration: 'day-of' })).body.id;
  const done = await post('/api/chores/complete', { chore_schedule_id: dishes, user_id: kid, date: today });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const bonus = (await historyOf(kid)).some((r) => r.kind === 'daily_bonus' && r.date === today);
  assert.equal(bonus, today !== saturday, today === saturday ? 'Saturday: the open weekly chore is needed' : 'before Saturday it is not');
});

test('done, it stays away until Sunday, and its history stays with the chore', async () => {
  const kid = await person();
  const { choreId, parentId } = await weekly(kid);
  const [card] = await cardsOf(parentId);
  assert.equal((await post('/api/chores/complete', { chore_schedule_id: card.id, user_id: kid, date: today })).status, 200);

  await nightly();
  assert.equal((await api(`/api/chore-schedules/${card.id}`)).status, 404, 'the done card is cleared');
  assert.deepEqual(await cardsOf(parentId), [], 'no new card while this week is done');
  const completion = (await historyOf(kid)).find((r) => r.kind === 'completion' && r.date === today);
  assert.equal(completion.chore_schedule_id, parentId, 'moved to the schedule it came from');
  assert.equal(completion.chore_id, choreId, 'so it still names its chore');
});

test('an undone week is one miss, then a fresh card', async () => {
  const kid = await person();
  const { parentId } = await weekly(kid);
  const [card] = await cardsOf(parentId);

  // Before its Saturday it logs no miss.
  await nightly();
  assert.equal((await historyOf(kid)).filter((r) => r.kind === 'missed').length, 0);
  assert.equal((await cardsOf(parentId)).length, 1, 'still the one card');

  // Last week's card, as the job finds it on Sunday.
  withDb((db) => db.prepare('UPDATE chore_schedules SET due_date = ? WHERE id = ?').run(yesterday, card.id));
  await nightly();
  const misses = (await historyOf(kid)).filter((r) => r.kind === 'missed');
  assert.equal(misses.length, 1, 'one miss for the week');
  assert.equal(misses[0].date, yesterday);
  assert.equal((await api(`/api/chore-schedules/${card.id}`)).status, 404, 'last week\'s card is gone');
  const fresh = await cardsOf(parentId);
  assert.equal(fresh.length, 1, 'a fresh card for this week');
  assert.equal(fresh[0].due_date, saturday);

  await nightly();
  assert.equal((await historyOf(kid)).filter((r) => r.kind === 'missed').length, 1, 'no second miss');
});

test('a "stays until done" chore made weekly gives its open card this week\'s Saturday', async () => {
  const kid = await person();
  const choreId = await chore('Tidy desk');
  const parentId = (await post('/api/chore-schedules', { chore_id: choreId, user_id: kid, crontab: '0 0 * * *', duration: 'until-completed' })).body.id;
  const [open] = await cardsOf(parentId);
  assert.equal(open.due_date, null);

  const res = await patch(`/api/chore-schedules/${parentId}`, { duration: 'weekly' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const after = await cardsOf(parentId);
  assert.equal(after.length, 1, 'the same card, not a second one');
  assert.equal(after[0].id, open.id);
  assert.equal(after[0].due_date, saturday);
  assert.equal((await api(`/api/chore-schedules/${parentId}`)).body.crontab, '0 0 * * 0');
});
