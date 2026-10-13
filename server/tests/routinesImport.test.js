// Upgrading from the Routines plugin: on the first start with migration 30,
// the plugin's routines, steps, ticks, calendar days and rewards move into the
// core on the SAME chores and schedules, a lost routine chore comes back, the
// plugin's spot on a display becomes the Chores widget, and the plugin goes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `routines-import-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return { status: response.status, body: await response.json() };
}

async function startServer() {
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
    try { if ((await fetch(`${baseUrl}/api/test`)).ok) return; } catch { /* starting */ }
    await delay(250);
  }
  throw new Error(`server did not start:\n${serverLogs.slice(-3000)}`);
}

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

const today = new Date().toISOString().slice(0, 10);
const shift = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

test('the plugin\'s routines, steps, ticks and place on the dashboard move into the core', async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  // A current database, then wound back to before the import, as the plugin left it.
  await startServer();
  await stopServer();

  const db = new Database(testDbPath);
  const ids = {};
  db.transaction(() => {
    ids.mia = db.prepare("INSERT INTO users (username, sort_order) VALUES ('Mia', 1)").run().lastInsertRowid;
    ids.leo = db.prepare("INSERT INTO users (username, sort_order) VALUES ('Leo', 2)").run().lastInsertRowid;
    const chore = (title) => db.prepare("INSERT INTO chores (title, description, clam_value, icon) VALUES (?, 'Routine', 0, '⏰')").run(title).lastInsertRowid;
    const schedule = (choreId, userId, crontab, due) => db.prepare(
      "INSERT INTO chore_schedules (chore_id, user_id, crontab, visible, duration, due_time) VALUES (?, ?, ?, 1, 'day-of', ?)",
    ).run(choreId, userId, crontab, due).lastInsertRowid;
    ids.morningChore = chore('Morning');
    ids.morningSchedule = schedule(ids.morningChore, ids.mia, '0 0 * * 1,3,5', '07:00');
    ids.soccerChore = chore('Soccer');
    const [, m, d] = shift(2).split('-').map(Number);
    ids.soccerSchedule = schedule(ids.soccerChore, ids.leo, `0 0 ${d} ${m} *`, '16:30');
    ids.lostChore = chore('Bedtime');
    ids.lostSchedule = schedule(ids.lostChore, ids.leo, '0 0 * * *', '19:30');
    db.prepare("INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value, title, kind) VALUES (?, ?, ?, 0, 'Morning', 'completion')")
      .run(ids.mia, ids.morningSchedule, shift(-2));

    const put = (key, value) => db.prepare("INSERT INTO plugin_storage (plugin_id, key, value_json) VALUES ('routines', ?, ?)").run(key, JSON.stringify(value));
    put('library', [{ id: 's1', label: 'Brush teeth', icon: '🪥' }, { id: 's2', label: 'Make bed', icon: '🛏️' }]);
    put('routines', [
      { id: 'r1', name: 'Morning', icon: '⏰', userId: ids.mia, choreId: ids.morningChore, scheduleId: ids.morningSchedule,
        days: [1, 3, 5], startTime: '07:00', endTime: '07:45', steps: ['s2', 's1'], threshold: 5, milestoneClams: 3 },
      { id: 'r2', name: 'Soccer', icon: '⚽', userId: ids.leo, choreId: ids.soccerChore, trigger: 'calendar',
        match: 'Soccer', wholeWord: true, sources: [], lead: 30, startTime: '', endTime: '', steps: ['s1'], threshold: 0, milestoneClams: 0 },
      { id: 'r3', name: 'Gone', userId: ids.mia, choreId: 99999, scheduleId: 99999, days: [], steps: [] },
    ]);
    put('awards', { r1: 5 });
    put(`progress:r1`, { [today]: { done: ['s1'], at: null }, '2020-01-01': { done: ['s1', 's2'], at: null } });
    put(`dates:r2`, { [shift(2)]: { id: ids.soccerSchedule, time: '16:30' } });

    db.prepare("INSERT INTO plugins (plugin_id, filename, name, content, source) VALUES ('routines', 'Routines.html', 'Routines', '<html></html>', 'github')").run();
    // One display showing the plugin (for Mia) and no Chores widget; one with both.
    db.prepare("INSERT OR IGNORE INTO devices (name, device_settings_json) VALUES ('kitchen', ?)").run(JSON.stringify({
      widgetSettings: { chores: { enabled: false } },
      pluginSettings: { 'Routines.html': { enabled: true, transparent: true } },
      pluginPlatformSettings: { routines: { person: 'mia' } },
    }));
    db.prepare("INSERT OR IGNORE INTO tabs (device_name, number, label, icon, config_json) VALUES ('kitchen', 1, 'Home', 'home', ?)")
      .run(JSON.stringify({ 'plugin:Routines.html': { layout_x: 4, layout_y: 0, layout_w: 4, layout_h: 6 } }));
    db.prepare("INSERT OR IGNORE INTO devices (name, device_settings_json) VALUES ('hall', ?)").run(JSON.stringify({
      widgetSettings: { chores: { enabled: true } },
      pluginSettings: { 'Routines.html': { enabled: true } },
    }));
    db.prepare("INSERT OR IGNORE INTO tabs (device_name, number, label, icon, config_json) VALUES ('hall', 1, 'Home', 'home', ?)")
      .run(JSON.stringify({ chores: { layout_x: 0, layout_y: 0, layout_w: 6, layout_h: 6 }, 'plugin:Routines.html': { layout_x: 6, layout_y: 0, layout_w: 4, layout_h: 6 } }));

    db.prepare("DELETE FROM settings WHERE key = 'ROUTINES_IMPORTED'").run();
    db.prepare("UPDATE settings SET value = '29' WHERE key = 'SYSTEM_SCHEMA_ID'").run();
  })();
  db.close();

  await startServer();

  const { body } = await api('/api/routines');
  assert.deepEqual(body.steps.map((s) => s.label), ['Brush teeth', 'Make bed']);
  const byName = Object.fromEntries(body.routines.map((r) => [r.name, r]));
  assert.deepEqual(Object.keys(byName).sort(), ['Bedtime', 'Morning', 'Soccer'], 'Gone is skipped, Bedtime restored');
  assert.equal(body.imported.routines, 2);
  assert.equal(body.imported.restored, 1);
  assert.deepEqual(body.imported.skipped, ['Gone']);

  const morning = byName.Morning;
  assert.equal(morning.chore_id, ids.morningChore, 'the same chore');
  assert.equal(morning.schedule_id, ids.morningSchedule, 'the same schedule, so its history carries on');
  assert.deepEqual(morning.days, [1, 3, 5]);
  assert.deepEqual(morning.steps.map((id) => body.steps.find((s) => s.id === id).label), ['Make bed', 'Brush teeth']);
  assert.deepEqual([morning.milestone_every, morning.milestone_clams, morning.last_award_streak, morning.end_time], [5, 3, 5, '07:45']);

  const soccer = byName.Soccer;
  assert.equal(soccer.trigger, 'calendar');
  assert.equal(soccer.match_text, 'Soccer');
  assert.equal(soccer.lead_minutes, 30);
  const soccerDay = (await api(`/api/routines/today?date=${shift(2)}`)).body.routines[ids.soccerSchedule];
  assert.ok(soccerDay, 'its pinned day carried over');

  const bedtime = byName.Bedtime;
  assert.equal(bedtime.schedule_id, ids.lostSchedule);
  assert.deepEqual(bedtime.steps, []);

  // Recent ticks came over; old ones didn't.
  const check = new Database(testDbPath, { readonly: true });
  const ticks = check.prepare('SELECT date FROM routine_progress WHERE routine_id = ?').all(morning.id).map((r) => r.date);
  assert.deepEqual(ticks, [today]);

  // The chores are now plain ones, owned by their routines.
  const chores = (await api('/api/chores')).body;
  assert.equal(chores.find((c) => c.id === ids.morningChore).description, null);
  assert.equal(chores.find((c) => c.id === ids.morningChore).routine_id, morning.id);

  // The plugin is gone; its displays show the Chores widget where it was.
  assert.ok(!(await api('/api/widgets')).body.some((w) => w.filename === 'Routines.html'));
  const kitchen = JSON.parse(check.prepare("SELECT device_settings_json FROM devices WHERE name = 'kitchen'").get().device_settings_json);
  const kitchenTab = JSON.parse(check.prepare("SELECT config_json FROM tabs WHERE device_name = 'kitchen'").get().config_json);
  assert.deepEqual(kitchenTab, { chores: { layout_x: 4, layout_y: 0, layout_w: 4, layout_h: 6 } });
  assert.deepEqual(kitchen.widgetSettings.chores, { enabled: true, transparent: true });
  assert.deepEqual(kitchen.choreWidgetSettings.hiddenUserIds, [ids.leo], 'the plugin showed Mia only');
  assert.equal(kitchen.pluginSettings['Routines.html'], undefined);
  assert.equal(kitchen.pluginPlatformSettings.routines, undefined);
  const hallTab = JSON.parse(check.prepare("SELECT config_json FROM tabs WHERE device_name = 'hall'").get().config_json);
  assert.deepEqual(Object.keys(hallTab), ['chores'], 'already had the Chores widget: the plugin\'s spot just goes');
  const hall = JSON.parse(check.prepare("SELECT device_settings_json FROM devices WHERE name = 'hall'").get().device_settings_json);
  assert.equal(hall.choreWidgetSettings, undefined, 'its people filter untouched');
  // The plugin's storage stays for now, should anyone go back.
  assert.ok(check.prepare("SELECT COUNT(*) AS n FROM plugin_storage WHERE plugin_id = 'routines'").get().n > 0);
  check.close();

  // Once only: a second start imports nothing again.
  await stopServer();
  const reset = new Database(testDbPath);
  reset.prepare("UPDATE settings SET value = '29' WHERE key = 'SYSTEM_SCHEMA_ID'").run();
  reset.close();
  await startServer();
  assert.equal((await api('/api/routines')).body.routines.length, 3);
});
