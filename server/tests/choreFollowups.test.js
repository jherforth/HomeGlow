// Follow-up chores (issue #241): "when Run the dishwasher is done, give
// Unload the dishwasher to Liam". Rules live on the chore; completing it today
// gives each named person an ordinary one-time schedule, which doesn't count
// toward the daily bonus on the day it appeared.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `chore-followups-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let port;
let baseUrl;

// Ask the OS for a free port: a port picked from a fixed range can be one
// another program holds on 127.0.0.1, and then every request reaches it.
async function usePort() {
    port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
}

// The server runs in UTC, so this is its "today".
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

let serverProcess;
let serverLogs = '';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/api/test`);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }
    throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

async function api(pathname, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status: response.status, body };
}

const post = (pathname, body) => api(pathname, { method: 'POST', body: JSON.stringify(body) });
const put = (pathname, body) => api(pathname, { method: 'PUT', body: JSON.stringify(body) });

const newUser = async (username) => (await post('/api/users', { username })).body.id;
const newChore = async (title, clamValue = 0) => (await post('/api/chores', { title, description: '', clam_value: clamValue })).body.id;
// A daily schedule, so it is due today and every day.
const newSchedule = async (choreId, userId) => (await post('/api/chore-schedules', {
    chore_id: choreId, user_id: userId, crontab: '0 0 * * *', duration: 'day-of',
})).body.id;
const complete = (scheduleId, userId, date = today) => post('/api/chores/complete', { chore_schedule_id: scheduleId, user_id: userId, date });
const uncomplete = (scheduleId, userId, date = today) => post('/api/chores/uncomplete', { chore_schedule_id: scheduleId, user_id: userId, date });
const setFollowups = (choreId, followups) => put(`/api/chores/${choreId}/followups`, { followups });
const schedulesOf = async (choreId) => (await api(`/api/chore-schedules?chore_id=${choreId}`)).body;
const bonusToday = async (userId) => (await api(`/api/chore-history?user_id=${userId}&date_from=${today}`)).body
    .some((row) => row.kind === 'daily_bonus' && row.user_id === userId && row.date === today);

// Reach into the database for what the API can't do on purpose: make a
// follow-up look as if it had been handed out on an earlier day.
function setTriggeredOn(scheduleId, date) {
    const db = new Database(testDbPath);
    try {
        db.prepare('UPDATE chore_schedules SET triggered_on = ? WHERE id = ?').run(date, scheduleId);
    } finally {
        db.close();
    }
}

test.before(async () => {
    await usePort();
    fs.mkdirSync(tmpDir, { recursive: true });
    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(port),
            DB_PATH: testDbPath,
            TZ: 'UTC',
            HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
            HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
            HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
            ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    await waitForServerReady();
});

test.after(async () => {
    if (serverProcess) {
        serverProcess.kill();
        await delay(300);
    }
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(testDbPath + suffix); } catch { /* already gone */ }
        }
    }
});

// --- rules ---

test('follow-ups save, list, and show on the chores list', async () => {
    const liam = await newUser('Rules Liam');
    const ava = await newUser('Rules Ava');
    const dishwasher = await newChore('Run the dishwasher');
    const unload = await newChore('Unload the dishwasher');

    const saved = await setFollowups(dishwasher, [{ followup_chore_id: unload, user_ids: [liam, ava, liam], delay_minutes: 120 }]);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.map((f) => [f.followup_chore_id, f.title, f.user_ids, f.delay_minutes]),
        [[unload, 'Unload the dishwasher', [liam, ava], 120]]);

    assert.deepEqual((await api(`/api/chores/${dishwasher}/followups`)).body, saved.body);
    const listed = (await api('/api/chores')).body.find((c) => c.id === dishwasher);
    assert.deepEqual(listed.followups.map((f) => f.title), ['Unload the dishwasher']);

    // An empty list removes them.
    assert.deepEqual((await setFollowups(dishwasher, [])).body, []);
});

test('a bad follow-up is refused, saying which one and why', async () => {
    const liam = await newUser('Valid Liam');
    const a = await newChore('Valid A');
    const b = await newChore('Valid B');
    const c = await newChore('Valid C');
    const d = await newChore('Valid D');
    const e = await newChore('Valid E');
    const rule = (id, extra = {}) => ({ followup_chore_id: id, user_ids: [liam], ...extra });

    const cases = [
        [[rule(a)], /can't follow itself/],
        [[rule(b), rule(b)], /already a follow-up/],
        [[rule(b), rule(c), rule(d), rule(e)], /at most 3/],
        [[rule(999999)], /choose a chore/],
        [[{ followup_chore_id: b, user_ids: [] }], /at least one person/],
        [[{ followup_chore_id: b, user_ids: [999999] }], /unknown person/],
        [[rule(b, { delay_minutes: -5 })], /between 0 minutes and 7 days/],
        [[rule(b, { delay_minutes: 7 * 24 * 60 + 1 })], /between 0 minutes and 7 days/],
    ];
    for (const [followups, pattern] of cases) {
        const res = await setFollowups(a, followups);
        assert.equal(res.status, 400, JSON.stringify(followups));
        assert.match(res.body.error, pattern);
    }

    // Loops are refused; chains are fine.
    assert.equal((await setFollowups(a, [rule(b)])).status, 200);
    assert.equal((await setFollowups(b, [rule(c)])).status, 200);
    const loop = await setFollowups(c, [rule(a)]);
    assert.equal(loop.status, 400);
    assert.match(loop.body.error, /lead back/);
    assert.equal((await api('/api/chores/999999/followups')).status, 404);
});

// --- completion ---

test('completing the chore gives each person the follow-up, once', async () => {
    const mum = await newUser('Mum');
    const liam = await newUser('Hand Liam');
    const ava = await newUser('Hand Ava');
    const dishwasher = await newChore('Hand dishwasher');
    const unload = await newChore('Hand unload');
    await setFollowups(dishwasher, [{ followup_chore_id: unload, user_ids: [liam, ava], delay_minutes: 120 }]);
    const run = await newSchedule(dishwasher, mum);

    const before = Date.now();
    const done = await complete(run, mum);
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.followups_created.map((f) => f.user_id).sort(), [liam, ava].sort());

    const given = await schedulesOf(unload);
    assert.equal(given.length, 2);
    for (const s of given) {
        assert.equal(s.crontab, null);
        assert.equal(s.visible, 1);
        // No due date, so it never shows as overdue.
        assert.equal(s.due_date, null);
        assert.equal(s.triggered_on, today);
        assert.equal(s.triggered_by_schedule_id, run);
        assert.equal(s.followup_of, 'Hand dishwasher');
        // The delay is a snooze: hidden until two hours from now.
        const wakes = new Date(s.snoozed_until).getTime();
        assert.ok(wakes >= before + 119 * 60000 && wakes <= Date.now() + 121 * 60000, s.snoozed_until);
    }

    // Done again (undo, redo) while those are still open: nothing stacks.
    await uncomplete(run, mum);
    await complete(run, mum);
    assert.equal((await schedulesOf(unload)).length, 2);
});

test('only a completion dated today hands work on', async () => {
    const mum = await newUser('Past Mum');
    const liam = await newUser('Past Liam');
    const laundry = await newChore('Past laundry');
    const putAway = await newChore('Past put away');
    await setFollowups(laundry, [{ followup_chore_id: putAway, user_ids: [liam] }]);
    const sched = await newSchedule(laundry, mum);

    const res = await complete(sched, mum, daysAgo(3));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.followups_created, []);
    assert.deepEqual(await schedulesOf(putAway), []);
});

test('undo takes back the follow-ups nobody has done, and keeps the ones done', async () => {
    const mum = await newUser('Undo Mum');
    const liam = await newUser('Undo Liam');
    const ava = await newUser('Undo Ava');
    const fold = await newChore('Undo fold');
    const putAway = await newChore('Undo put away');
    await setFollowups(fold, [{ followup_chore_id: putAway, user_ids: [liam, ava] }]);
    const sched = await newSchedule(fold, mum);

    await complete(sched, mum);
    const given = await schedulesOf(putAway);
    const liams = given.find((s) => s.user_id === liam);
    assert.equal((await complete(liams.id, liam)).status, 200);

    const undone = await uncomplete(sched, mum);
    assert.equal(undone.status, 200);
    assert.equal(undone.body.followups_removed, 1);
    assert.deepEqual((await schedulesOf(putAway)).map((s) => s.user_id), [liam]);
});

test('a chain hands on step by step', async () => {
    const mum = await newUser('Chain Mum');
    const liam = await newUser('Chain Liam');
    const ava = await newUser('Chain Ava');
    const wash = await newChore('Chain wash');
    const dry = await newChore('Chain dry');
    const fold = await newChore('Chain fold');
    await setFollowups(wash, [{ followup_chore_id: dry, user_ids: [liam] }]);
    await setFollowups(dry, [{ followup_chore_id: fold, user_ids: [ava] }]);

    await complete(await newSchedule(wash, mum), mum);
    const [drySched] = await schedulesOf(dry);
    assert.equal(drySched.user_id, liam);
    assert.deepEqual(await schedulesOf(fold), []);

    await complete(drySched.id, liam);
    assert.deepEqual((await schedulesOf(fold)).map((s) => s.user_id), [ava]);
});

// --- fairness ---

test('a follow-up does not count toward the daily bonus on the day it appeared, then does', async () => {
    const mum = await newUser('Bonus Mum');
    const liam = await newUser('Bonus Liam');
    const bed = await newChore('Bonus make bed');
    const dishwasher = await newChore('Bonus dishwasher');
    const unload = await newChore('Bonus unload');
    await setFollowups(dishwasher, [{ followup_chore_id: unload, user_ids: [liam] }]);
    const bedSched = await newSchedule(bed, liam);

    await complete(await newSchedule(dishwasher, mum), mum);
    const [unloadSched] = await schedulesOf(unload);

    // Today: Liam finishes his own chore and gets the bonus, though the
    // follow-up that just arrived is still open.
    await complete(bedSched, liam);
    assert.equal(await bonusToday(liam), true);

    // The day after it arrived, the open follow-up counts like any chore.
    await uncomplete(bedSched, liam);
    setTriggeredOn(unloadSched.id, daysAgo(1));
    await complete(bedSched, liam);
    assert.equal(await bonusToday(liam), false);

    // Doing it then earns the bonus.
    await complete(unloadSched.id, liam);
    assert.equal(await bonusToday(liam), true);
});

test('missed-chore logging skips the day a follow-up appeared, and counts it after', async () => {
    const mum = await newUser('Missed Mum');
    const liam = await newUser('Missed Liam');
    const trigger = await newChore('Missed trigger');
    const given = await newChore('Missed given');
    await setFollowups(trigger, [{ followup_chore_id: given, user_ids: [liam] }]);
    await complete(await newSchedule(trigger, mum), mum);
    const [followup] = await schedulesOf(given);
    const missedYesterday = async () => (await api(`/api/chore-history?user_id=${liam}&date_from=${daysAgo(1)}`)).body
        .some((row) => row.kind === 'missed' && row.chore_schedule_id === followup.id && row.date === daysAgo(1));

    // Handed out yesterday: yesterday was its first day, so not missed.
    setTriggeredOn(followup.id, daysAgo(1));
    await api('/api/system/backgroundTasks');
    assert.equal(await missedYesterday(), false);

    // Handed out the day before: yesterday it counted, and was missed.
    setTriggeredOn(followup.id, daysAgo(2));
    await api('/api/system/backgroundTasks');
    assert.equal(await missedYesterday(), true);
});

// --- deleting ---

test('deleting either chore removes the rule and does not fail', async () => {
    const mum = await newUser('Delete Mum');
    const liam = await newUser('Delete Liam');
    const trigger = await newChore('Delete trigger');
    const target = await newChore('Delete target');
    const other = await newChore('Delete other');
    await setFollowups(trigger, [{ followup_chore_id: target, user_ids: [liam] }]);

    // The follow-up chore is used by a rule: deleting it works (it would fail
    // on the foreign key without the cascade) and takes the rule with it.
    assert.equal((await api(`/api/chores/${target}`, { method: 'DELETE' })).status, 200);
    assert.deepEqual((await api(`/api/chores/${trigger}/followups`)).body, []);

    // Deleting the trigger leaves follow-ups already handed out in place.
    await setFollowups(trigger, [{ followup_chore_id: other, user_ids: [liam] }]);
    await complete(await newSchedule(trigger, mum), mum);
    assert.equal((await schedulesOf(other)).length, 1);
    assert.equal((await api(`/api/chores/${trigger}`, { method: 'DELETE' })).status, 200);
    const left = await schedulesOf(other);
    assert.equal(left.length, 1);
    assert.equal(left[0].followup_rule_id, null);
});
