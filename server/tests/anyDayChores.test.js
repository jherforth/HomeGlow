// "Any day" chores, end to end: a real HomeGlow server on a throwaway
// database. The server runs in UTC on today's date, so a past period is made
// by moving a card's due date back, as the nightly job would find it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');
const { periodOf } = require('../services/anyDayChores');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `any-day-${process.pid}-${Date.now()}.db`);
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
const saturday = periodOf(today, '1w').end;

async function startServer() {
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
}
const stopServer = () => new Promise((resolve) => {
  if (!serverProcess || serverProcess.exitCode !== null) return resolve();
  serverProcess.once('close', resolve);
  serverProcess.kill();
  setTimeout(resolve, 5000);
});

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  await startServer();
});

test.after(async () => {
  await stopServer();
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
async function anyDay(userId, interval = '1w', title = 'Practice piano') {
  const choreId = await chore(title);
  const res = await post('/api/chore-schedules', { chore_id: choreId, user_id: userId, crontab: '0 0 * * 3', duration: 'any-day', interval });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { choreId, parentId: res.body.id };
}
async function cardsOf(parentId) {
  return (await api('/api/chore-schedules')).body.filter((s) => s.parent_schedule_id === parentId);
}
const historyOf = async (userId) => (await api(`/api/chore-history?user_id=${userId}`)).body;
const nightly = () => api('/api/system/backgroundTasks');
const withDb = (work) => {
  const db = new Database(testDbPath);
  try { return work(db); } finally { db.close(); }
};

test("once a week: it shows at once, due by this week's Saturday", async () => {
  const kid = await person();
  const { parentId } = await anyDay(kid);
  const parent = (await api(`/api/chore-schedules/${parentId}`)).body;
  assert.equal(parent.duration, 'any-day');
  assert.equal(parent.interval, '1w');
  assert.equal(parent.crontab, '0 0 * * *', 'its days mean nothing');

  const cards = await cardsOf(parentId);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].due_date, saturday);
  assert.equal(cards[0].parent_duration, 'any-day');
  const chart = (await api(`/api/chore-schedules?usage=chart&user_id=${kid}`)).body;
  assert.deepEqual(chart.map((s) => s.id), [cards[0].id], 'the dashboard list leaves the parent out');
});

test('longer periods are due on their last day: a month, a quarter, a year', async () => {
  const kid = await person();
  for (const interval of ['1m', '3m', '6m', '1y']) {
    const { parentId } = await anyDay(kid, interval, `Every ${interval}`);
    const [card] = await cardsOf(parentId);
    assert.equal(card.due_date, periodOf(today, interval).end, interval);
  }
  const twoWeeks = await anyDay(kid, '2w', 'Fortnightly');
  assert.equal((await cardsOf(twoWeeks.parentId))[0].due_date, periodOf(today, '2w', today).end);
});

test('"weekly" still works, and a period must be one of the list', async () => {
  const kid = await person();
  const choreId = await chore('Old weekly');
  const res = await post('/api/chore-schedules', { chore_id: choreId, user_id: kid, duration: 'weekly' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const parent = (await api(`/api/chore-schedules/${res.body.id}`)).body;
  assert.equal(parent.duration, 'any-day');
  assert.equal(parent.interval, '1w');
  assert.equal((await post('/api/chore-schedules', { chore_id: choreId, user_id: kid, duration: 'any-day', interval: '5d' })).status, 400);
  assert.equal((await patch(`/api/chore-schedules/${res.body.id}`, { interval: '3d' })).status, 400);
});

// Whether finishing everything else today pays the daily bonus, with the
// any-day card due on `dueDate` and made `madeDaysAgo` days ago.
async function bonusPaidWith(dueDate, madeDaysAgo) {
  const kid = await person();
  const { parentId } = await anyDay(kid);
  const [card] = await cardsOf(parentId);
  withDb((db) => db.prepare("UPDATE chore_schedules SET due_date = ?, created_at = datetime('now', ?) WHERE id = ?")
    .run(dueDate, `-${madeDaysAgo} days`, card.id));
  const dishesId = await chore('Dishes');
  const dishes = (await post('/api/chore-schedules', { chore_id: dishesId, user_id: kid, crontab: '0 0 * * *', duration: 'day-of' })).body.id;
  const done = await post('/api/chores/complete', { chore_schedule_id: dishes, user_id: kid, date: today });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return (await historyOf(kid)).some((r) => r.kind === 'daily_bonus' && r.date === today);
}

test('it holds back the daily bonus on its last day only', async () => {
  assert.equal(await bonusPaidWith(shift(1), 1), true, 'before its last day it is not needed');
  assert.equal(await bonusPaidWith(today, 1), false, 'its last day: the open chore is needed');
  assert.equal(await bonusPaidWith(today, 0), true, 'added on its last day: too late to be fair');
});

test("a card from someone's schedule keeps its person overnight, clams or not", async () => {
  const kid = await person();
  const choreId = (await post('/api/chores', { title: 'Wash the car', clam_value: 2 })).body.id;
  const parentId = (await post('/api/chore-schedules', { chore_id: choreId, user_id: kid, duration: 'any-day', interval: '1y' })).body.id;
  const [card] = await cardsOf(parentId);
  assert.equal(card.user_id, kid);

  // A bonus chore someone took still goes back to everyone.
  const bonusId = (await post('/api/chores', { title: 'Sweep the porch', clam_value: 3 })).body.id;
  const bonusParent = (await post('/api/chore-schedules', { chore_id: bonusId, user_id: null, crontab: '0 0 * * *', duration: 'until-completed' })).body.id;
  const [bonusCard] = await cardsOf(bonusParent);
  assert.equal((await patch(`/api/chore-schedules/${bonusCard.id}`, { user_id: kid })).status, 200);

  await nightly();
  assert.equal((await api(`/api/chore-schedules/${card.id}`)).body.user_id, kid, 'still theirs');
  assert.equal((await api(`/api/chore-schedules/${bonusCard.id}`)).body.user_id, null, 'back to everyone');
});

test('moved off any-day, or deleted, its open card goes', async () => {
  const kid = await person();
  const { parentId } = await anyDay(kid, '1m');
  const [card] = await cardsOf(parentId);
  // Due today, so it's the one chore holding back the bonus.
  withDb((db) => db.prepare("UPDATE chore_schedules SET due_date = ?, created_at = datetime('now', '-1 days') WHERE id = ?").run(today, card.id));
  const dishesId = await chore('Dishes');
  const dishes = (await post('/api/chore-schedules', { chore_id: dishesId, user_id: kid, crontab: '0 0 * * *', duration: 'day-of' })).body.id;
  await post('/api/chores/complete', { chore_schedule_id: dishes, user_id: kid, date: today });
  assert.equal((await historyOf(kid)).some((r) => r.kind === 'daily_bonus'), false);

  // To days that aren't today: the card goes, and the day is done.
  const notToday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 1) % 7;
  const moved = await patch(`/api/chore-schedules/${parentId}`, { crontab: `0 0 * * ${notToday}`, duration: 'day-of', interval: null });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal((await api(`/api/chore-schedules/${card.id}`)).status, 404, 'the old card is gone');
  assert.deepEqual(await cardsOf(parentId), []);
  assert.equal((await historyOf(kid)).some((r) => r.kind === 'daily_bonus' && r.date === today), true, 'nothing holds the bonus back');

  // Deleted: its card goes too, rather than staying on with no schedule.
  const other = await anyDay(kid, '1y', 'Clean the gutters');
  const [otherCard] = await cardsOf(other.parentId);
  assert.equal((await api(`/api/chore-schedules/${other.parentId}`, { method: 'DELETE' })).status, 200);
  assert.equal((await api(`/api/chore-schedules/${otherCard.id}`)).status, 404);
});

test('made one-time, what it was done before does not count: it stays until done', async () => {
  const kid = await person();
  const choreId = await chore('Fix the fence');
  const parentId = (await post('/api/chore-schedules', { chore_id: choreId, user_id: kid, crontab: '0 0 * * *', duration: 'until-completed' })).body.id;
  const [card] = await cardsOf(parentId);
  await post('/api/chores/complete', { chore_schedule_id: card.id, user_id: kid, date: yesterday });
  await nightly(); // the done card goes; its completion moves to the schedule

  assert.equal((await patch(`/api/chore-schedules/${parentId}`, { crontab: null, duration: 'day-of' })).status, 200);
  for (const open of await cardsOf(parentId)) await api(`/api/chore-schedules/${open.id}`, { method: 'DELETE' });
  await nightly();
  assert.equal((await api(`/api/chore-schedules/${parentId}`)).status, 200, 'not cleared undone');
  assert.ok((await api('/api/chores')).body.some((c) => c.id === choreId), 'and the chore is still there');

  await post('/api/chores/complete', { chore_schedule_id: parentId, user_id: kid, date: today });
  await nightly();
  assert.equal((await api(`/api/chore-schedules/${parentId}`)).status, 404, 'done now, it goes as one-time chores do');
});

test('done, it stays away until the next period, and its history stays with the chore', async () => {
  const kid = await person();
  const { choreId, parentId } = await anyDay(kid, '1m');
  const [card] = await cardsOf(parentId);
  assert.equal((await post('/api/chores/complete', { chore_schedule_id: card.id, user_id: kid, date: today })).status, 200);

  await nightly();
  assert.equal((await api(`/api/chore-schedules/${card.id}`)).status, 404, 'the done card is cleared');
  assert.deepEqual(await cardsOf(parentId), [], 'no new card while this month is done');
  const completion = (await historyOf(kid)).find((r) => r.kind === 'completion' && r.date === today);
  assert.equal(completion.chore_schedule_id, parentId, 'moved to the schedule it came from');
  assert.equal(completion.chore_id, choreId, 'so it still names its chore');
});

test('an undone period is one miss, then a fresh card', async () => {
  const kid = await person();
  const { parentId } = await anyDay(kid);
  const [card] = await cardsOf(parentId);

  await nightly();
  assert.equal((await historyOf(kid)).filter((r) => r.kind === 'missed').length, 0, 'no miss before its last day');
  assert.equal((await cardsOf(parentId)).length, 1, 'still the one card');

  // Last period's card, as the job finds it the morning after.
  withDb((db) => db.prepare('UPDATE chore_schedules SET due_date = ? WHERE id = ?').run(yesterday, card.id));
  await nightly();
  const misses = (await historyOf(kid)).filter((r) => r.kind === 'missed');
  assert.equal(misses.length, 1, 'one miss for the period');
  assert.equal(misses[0].date, yesterday);
  assert.equal((await api(`/api/chore-schedules/${card.id}`)).status, 404, "last period's card is gone");
  const fresh = await cardsOf(parentId);
  assert.equal(fresh.length, 1, 'a fresh card for this period');
  assert.equal(fresh[0].due_date, saturday);

  await nightly();
  assert.equal((await historyOf(kid)).filter((r) => r.kind === 'missed').length, 1, 'no second miss');
});

test('made any-day, or given another period, its open card takes the new last day', async () => {
  const kid = await person();
  const choreId = await chore('Tidy desk');
  const parentId = (await post('/api/chore-schedules', { chore_id: choreId, user_id: kid, crontab: '0 0 * * *', duration: 'until-completed' })).body.id;
  const [open] = await cardsOf(parentId);
  assert.equal(open.due_date, null);

  assert.equal((await patch(`/api/chore-schedules/${parentId}`, { duration: 'any-day' })).status, 200);
  let after = await cardsOf(parentId);
  assert.deepEqual(after.map((c) => [c.id, c.due_date]), [[open.id, saturday]], 'the same card, now due Saturday');
  assert.equal((await api(`/api/chore-schedules/${parentId}`)).body.interval, '1w');

  assert.equal((await patch(`/api/chore-schedules/${parentId}`, { interval: '1m' })).status, 200);
  after = await cardsOf(parentId);
  assert.deepEqual(after.map((c) => [c.id, c.due_date]), [[open.id, periodOf(today, '1m').end]]);
});

test('migration 38 turns "weekly" schedules into any-day ones', async () => {
  const kid = await person();
  const choreId = await chore('Planted weekly');
  await stopServer();
  const id = withDb((db) => {
    db.prepare("UPDATE settings SET value = '37' WHERE key = 'SYSTEM_SCHEMA_ID'").run();
    return db.prepare("INSERT INTO chore_schedules (chore_id, user_id, crontab, duration, visible) VALUES (?, ?, '0 0 * * 0', 'weekly', 1)").run(choreId, kid).lastInsertRowid;
  });
  await startServer();
  const row = (await api(`/api/chore-schedules/${id}`)).body;
  assert.equal(row.duration, 'any-day');
  assert.equal(row.interval, '1w');
  assert.ok(Number(withDb((db) => db.prepare("SELECT value FROM settings WHERE key = 'SYSTEM_SCHEMA_ID'").get().value)) >= 38);
});
