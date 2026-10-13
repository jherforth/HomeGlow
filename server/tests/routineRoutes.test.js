// Routines, end to end: a real HomeGlow server on a throwaway database. A
// routine owns one ordinary chore; ticking its steps completes that chore, and
// the chore's own tick and untick carry the steps with them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `routines-${process.pid}-${Date.now()}.db`);
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

let kid;
let stepIds;
let morning;

const day = async (date = today) => (await api(`/api/routines/today?date=${date}`)).body.routines;
// The routine's milestone payments ("Morning: 1 in a row").
const milestones = async () => (await api(`/api/chore-history?date=${today}`)).body
  .filter((row) => row.kind === 'streak' && / in a row$/.test(row.title));
const tick = (r, stepId, done, date = today) => post(`/api/routines/${r.id}/steps/${stepId}`, { date, done });

test('a step library, and a routine that owns an ordinary chore', async () => {
  kid = (await post('/api/users', { username: 'Mia', email: 'mia@example.com' })).body.id;
  stepIds = [];
  for (const [label, icon] of [['Brush teeth', '🪥'], ['Make bed', '🛏️'], ['Get dressed', '👕']]) {
    const step = await post('/api/routine-steps', { label, icon });
    assert.equal(step.status, 200, JSON.stringify(step.body));
    stepIds.push(step.body.id);
  }
  assert.equal((await post('/api/routine-steps', { label: '' })).status, 400);

  const created = await post('/api/routines', {
    name: 'Morning', icon: '⏰', user_id: kid, trigger: 'days', days: [], steps: stepIds,
    start_time: '07:00', end_time: '23:59', milestone_every: 1, milestone_clams: 2,
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  morning = created.body;
  assert.deepEqual(morning.steps, stepIds);
  assert.ok(morning.chore_id && morning.schedule_id);

  // The chore and schedule are ordinary ones, marked as the routine's.
  const chore = (await api('/api/chores')).body.find((c) => c.id === morning.chore_id);
  assert.equal(chore.title, 'Morning');
  assert.equal(chore.clam_value, 0);
  assert.equal(chore.routine_id, morning.id);
  const schedule = (await api('/api/chore-schedules')).body.find((s) => s.id === morning.schedule_id);
  assert.equal(schedule.crontab, '0 0 * * *');
  assert.equal(schedule.due_time, '07:00');
  assert.equal(schedule.routine_id, morning.id);
  assert.equal(schedule.transferable, 0);

  const card = (await day())[morning.schedule_id];
  assert.equal(card.steps.length, 3);
  assert.deepEqual(card.done, []);
  assert.equal(card.completed, false);
});

test('ticking every step completes the chore, pays the milestone, and unticking one undoes it', async () => {
  let res = await tick(morning, stepIds[0], true);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.done, [stepIds[0]]);
  await tick(morning, stepIds[1], true);
  res = await tick(morning, stepIds[2], true);
  assert.equal(res.body.completed, true);
  assert.equal(res.body.streak, 1);
  assert.equal(res.body.onTime, true);
  const history = (await api(`/api/chore-history?date=${today}`)).body;
  assert.ok(history.some((row) => row.chore_schedule_id === morning.schedule_id && row.kind === 'completion'));
  // Finishing her only chore also earns the daily bonus; the milestone is a row of its own.
  assert.deepEqual((await milestones()).map((row) => [row.title, row.clam_value]), [['Morning: 1 in a row', 2]]);

  // Unticking one step uncompletes the chore and keeps the other ticks.
  res = await tick(morning, stepIds[1], false);
  assert.equal(res.body.completed, false);
  assert.deepEqual(res.body.done.sort(), [stepIds[0], stepIds[2]].sort());
  // Re-ticking completes it again; the milestone for this run is not paid twice.
  res = await tick(morning, stepIds[1], true);
  assert.equal(res.body.completed, true);
  assert.equal((await milestones()).length, 1);
});

test('the chore\'s own untick clears the steps, and its own tick ticks them all', async () => {
  const off = await post('/api/chores/uncomplete', { chore_schedule_id: morning.schedule_id, user_id: kid, date: today });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  let card = (await day())[morning.schedule_id];
  assert.deepEqual(card.done, []);
  assert.equal(card.completed, false);

  const on = await post('/api/chores/complete', { chore_schedule_id: morning.schedule_id, user_id: kid, date: today });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  card = (await day())[morning.schedule_id];
  assert.equal(card.done.length, 3);
  assert.equal(card.completed, true);
});

test('a step in use is kept; a routine is edited in place', async () => {
  const refused = await del(`/api/routine-steps/${stepIds[0]}`);
  assert.equal(refused.status, 409);
  assert.deepEqual(refused.body.usedBy, ['Morning']);

  const edited = await patch(`/api/routines/${morning.id}`, {
    name: 'Morning routine', icon: '⏰', user_id: kid, trigger: 'days', days: [1, 2, 3, 4, 5],
    steps: [stepIds[2], stepIds[0]], start_time: '07:15', end_time: null, milestone_every: 0, milestone_clams: 0,
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.schedule_id, morning.schedule_id, 'the same schedule, so history carries on');
  assert.deepEqual(edited.body.steps, [stepIds[2], stepIds[0]]);
  const schedule = (await api('/api/chore-schedules')).body.find((s) => s.id === morning.schedule_id);
  assert.equal(schedule.crontab, '0 0 * * 1,2,3,4,5');
  assert.equal(schedule.due_time, '07:15');
  assert.equal((await api('/api/chores')).body.find((c) => c.id === morning.chore_id).title, 'Morning routine');

  const bad = await post('/api/routines', { name: '', user_id: 999, trigger: 'calendar', steps: [] });
  assert.equal(bad.status, 400);
});

test('a calendar routine gets a schedule pinned to each matching event day, and follows the calendar', async (t) => {
  const db = new Database(testDbPath);
  db.pragma('busy_timeout = 5000');
  // Closed whatever happens: Windows won't delete a database still open.
  t.after(() => db.close());
  const source = db.prepare("INSERT INTO calendar_sources (name, type, url) VALUES ('Family', 'ics', 'http://example.invalid/cal.ics')").run().lastInsertRowid;
  const addEvent = (uid, title, date, time) => db.prepare(
    'INSERT INTO calendar_events_cache (source_id, event_uid, title, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
  ).run(source, uid, title, `${date}T${time}:00.000Z`, `${date}T23:00:00.000Z`);
  addEvent('a', 'Soccer practice', shift(1), '17:00');
  addEvent('b', 'Soccer game', shift(3), '10:00');
  addEvent('c', 'Piano', shift(2), '16:00');

  const created = await post('/api/routines', {
    name: 'Get ready for soccer', icon: '⚽', user_id: kid, trigger: 'calendar',
    match_text: 'Soccer', whole_word: true, lead_minutes: 30, steps: [stepIds[1]],
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const soccer = created.body;
  const pinned = () => db.prepare('SELECT date, schedule_id, due_time FROM routine_dates WHERE routine_id = ? ORDER BY date').all(soccer.id);
  assert.deepEqual(pinned().map((p) => [p.date, p.due_time]), [[shift(1), '16:30'], [shift(3), '09:30']]);
  const schedules = (await api(`/api/chore-schedules?chore_id=${soccer.chore_id}`)).body;
  const [y, m, d] = shift(1).split('-').map(Number);
  assert.ok(schedules.some((s) => s.crontab === `0 0 ${d} ${m} *`), JSON.stringify(schedules.map((s) => s.crontab)));
  // It shows on its event day only.
  assert.ok(Object.values(await day(shift(1))).some((c) => c.routineId === soccer.id));
  assert.ok(!Object.values(await day(shift(2))).some((c) => c.routineId === soccer.id));
  void y;

  // The game moves to another day and practice is cancelled: an edit syncs.
  db.prepare("DELETE FROM calendar_events_cache WHERE event_uid IN ('a', 'b')").run();
  addEvent('b2', 'Soccer game', shift(4), '12:00');
  const resynced = await patch(`/api/routines/${soccer.id}`, { ...soccer, steps: [stepIds[1]] });
  assert.equal(resynced.status, 200, JSON.stringify(resynced.body));
  assert.deepEqual(pinned().map((p) => [p.date, p.due_time]), [[shift(4), '11:30']]);
  assert.equal((await api(`/api/chore-schedules?chore_id=${soccer.chore_id}`)).body.length, 1, 'the moved days\' schedules are gone');

  // Deleting the routine deletes its chore and schedules; history stays.
  const removed = await del(`/api/routines/${soccer.id}`);
  assert.equal(removed.status, 200);
  assert.ok(!(await api('/api/chores')).body.some((c) => c.id === soccer.chore_id));
  assert.equal((await api(`/api/chore-schedules?chore_id=${soccer.chore_id}`)).body.length, 0);
  assert.ok(!(await api('/api/routines')).body.routines.some((r) => r.id === soccer.id));
});

test('a run is kept across vacation days and an edit to the days; another person starts afresh', async (t) => {
  const db = new Database(testDbPath);
  db.pragma('busy_timeout = 5000');
  t.after(() => db.close());
  const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
  const doneOn = (r, date) => db.prepare(
    "INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value, title, kind) VALUES (?, ?, ?, 0, ?, 'completion')",
  ).run(kid, r.schedule_id, date, r.name);
  const streakOf = async (r) => (await day())[r.schedule_id].streak;
  const step = (await post('/api/routine-steps', { label: 'Feed the cat', icon: '🐈' })).body.id;

  // Vacation: a day off not done neither breaks nor extends the run.
  const dog = (await post('/api/routines', { name: 'Walk the dog', user_id: kid, trigger: 'days', days: [], steps: [step] })).body;
  doneOn(dog, shift(-1));
  doneOn(dog, shift(-3));
  assert.equal(await streakOf(dog), 1);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vacation_mode', ?)")
    .run(JSON.stringify({ enabled: true, startDate: shift(-2), endDate: shift(-2) }));
  assert.equal(await streakOf(dog), 2);
  db.prepare("DELETE FROM settings WHERE key = 'vacation_mode'").run();

  // On today and four days back (not the 3rd or 6th), done on those four;
  // made daily, the run stays four.
  const runDays = [shift(-1), shift(-2), shift(-4), shift(-5)];
  const cat = (await post('/api/routines', {
    name: 'Cat', user_id: kid, trigger: 'days', days: [...new Set([today, ...runDays].map(weekday))], steps: [step],
  })).body;
  runDays.forEach((date) => doneOn(cat, date));
  assert.equal(await streakOf(cat), 4);
  const daily = await patch(`/api/routines/${cat.id}`, { ...cat, days: [] });
  assert.equal(daily.status, 200, JSON.stringify(daily.body));
  assert.equal(daily.body.streak_base, 4);
  assert.equal(await streakOf(cat), 4, 'not rewritten by a day that was not on before');
  // A rename keeps the run as it is.
  await patch(`/api/routines/${cat.id}`, { ...daily.body, name: 'Feed Cat' });
  assert.equal(await streakOf(cat), 4);

  // Handed to someone else, it is their run from today.
  const mia = (await post('/api/users', { username: 'Mia', email: 'mia@example.com' })).body.id;
  await patch(`/api/routines/${cat.id}`, { ...daily.body, user_id: mia });
  assert.equal(await streakOf(cat), 0);

  await del(`/api/routines/${dog.id}`);
  await del(`/api/routines/${cat.id}`);
  await del(`/api/routine-steps/${step}`);
});

test('deleting a routine keeps its completions in the ledger', async () => {
  const removed = await del(`/api/routines/${morning.id}`);
  assert.equal(removed.status, 200);
  const history = (await api(`/api/chore-history?date=${today}`)).body;
  assert.ok(history.some((row) => row.title === 'Morning' || row.title === 'Morning routine'), 'the completion is still there');
  assert.equal((await del(`/api/routine-steps/${stepIds[0]}`)).status, 200, 'no longer in use');
});

test('one routine for several people, one each; and several deleted at once', async () => {
  const leo = (await post('/api/users', { username: 'Leo', email: 'leo@example.com' })).body.id;
  const step = (await post('/api/routine-steps', { label: 'Pack bag', icon: '🎒' })).body.id;
  const body = { name: 'School', user_ids: [kid, leo], trigger: 'days', days: [1, 2, 3, 4, 5], steps: [step] };

  // Every person must exist, or none is made.
  const refused = await post('/api/routines', { ...body, user_ids: [kid, 99999] });
  assert.equal(refused.status, 400);
  assert.ok(!(await api('/api/routines')).body.routines.some((r) => r.name === 'School'));

  const made = await post('/api/routines', body);
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal(made.body.routines.length, 2);
  assert.deepEqual(made.body.routines.map((r) => r.user_id).sort(), [kid, leo].sort());
  const [a, b] = made.body.routines;
  assert.notEqual(a.chore_id, b.chore_id, 'each has its own chore, so its own ticks and streak');
  assert.notEqual(a.schedule_id, b.schedule_id);

  assert.equal((await api('/api/routines/bulk', { method: 'DELETE', body: JSON.stringify({ ids: [] }) })).status, 400);
  const gone = await api('/api/routines/bulk', { method: 'DELETE', body: JSON.stringify({ ids: [a.id, b.id, 99999] }) });
  assert.equal(gone.status, 200, JSON.stringify(gone.body));
  assert.equal(gone.body.deleted, 2);
  const left = (await api('/api/routines')).body.routines;
  assert.ok(!left.some((r) => r.name === 'School'));
  const chores = (await api('/api/chores')).body;
  assert.ok(!chores.some((c) => c.id === a.chore_id || c.id === b.chore_id), 'their chores went with them');
});
