const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `chore-metrics-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 6200 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

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

// Date strings matching the spawned server, which runs TZ=UTC. This test
// process keeps the developer's local zone, so compute in UTC explicitly —
// otherwise the two disagree on "today" every evening once UTC rolls over.
const localDate = (daysAgo = 0) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().slice(0, 10);
};

const createUser = async (name) => {
    const res = await api('/api/users', { method: 'POST', body: JSON.stringify({ username: name, email: `${name}@example.com` }) });
    return res.body.id;
};

// A regular (zero-clam) chore + daily schedule for a user.
const createDailyChore = async (userId, title) => {
    const chore = await api('/api/chores', { method: 'POST', body: JSON.stringify({ title, clam_value: 0 }) });
    const schedule = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, crontab: '0 0 * * *', duration: 'day-of' }),
    });
    return { choreId: chore.body.id, scheduleId: schedule.body.id };
};

const historyFor = async (userId) => (await api(`/api/chore-history/user/${userId}`)).body;

test.before(async () => {
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
            ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    await waitForServerReady();
});

test.after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', () => resolve());
            setTimeout(resolve, 5000);
        });
    }
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

test('writers tag kinds: completion, daily_bonus, transfer_bonus, adjustment', async () => {
    const userId = await createUser('kind-writer-kid');
    const { scheduleId } = await createDailyChore(userId, 'Feed cat');

    // Completing the only regular chore also awards the daily bonus.
    await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: scheduleId, user_id: userId, date: localDate(0) }),
    });

    // Transfer bonus: arm a second chore with a pending payout, then complete.
    const second = await createDailyChore(userId, 'Water garden');
    await api(`/api/chore-schedules/${second.scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ transfer_bonus_clams: 3 }),
    });
    await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: second.scheduleId, user_id: userId, date: localDate(0) }),
    });

    await api(`/api/users/${userId}/clams/add`, { method: 'POST', body: JSON.stringify({ amount: 5 }) });

    const rows = await historyFor(userId);
    const kinds = rows.map((row) => row.kind).sort();
    assert.ok(rows.filter((r) => r.kind === 'completion').length >= 2, `completions in ${kinds}`);
    assert.equal(rows.filter((r) => r.kind === 'daily_bonus').length, 1);
    assert.equal(rows.filter((r) => r.kind === 'transfer_bonus').length, 1);
    assert.equal(rows.filter((r) => r.kind === 'adjustment').length, 1);
});

test('daily bonus revoke survives a reward-setting change (fragile-tuple regression)', async () => {
    const userId = await createUser('bonus-revoke-kid');
    const { scheduleId } = await createDailyChore(userId, 'Sweep porch');

    await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: scheduleId, user_id: userId, date: localDate(0) }),
    });
    assert.equal((await historyFor(userId)).filter((r) => r.kind === 'daily_bonus').length, 1);

    // Admin changes the reward AFTER the bonus was awarded. The old lookup
    // matched on clam_value = current setting and would strand this row.
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ key: 'daily_completion_clam_reward', value: '9' }) });

    await api('/api/chores/uncomplete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: scheduleId, user_id: userId, date: localDate(0) }),
    });

    assert.equal((await historyFor(userId)).filter((r) => r.kind === 'daily_bonus').length, 0, 'bonus revoked despite setting change');
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ key: 'daily_completion_clam_reward', value: '2' }) });
});

test('spending clams is non-destructive: history rows survive, a negative spent row is added', async () => {
    const userId = await createUser('spender-kid');
    await api(`/api/users/${userId}/clams/add`, { method: 'POST', body: JSON.stringify({ amount: 10 }) });

    const before = await historyFor(userId);
    const beforeIds = before.map((r) => `${r.id}:${r.clam_value}`).sort();

    const reduce = await api(`/api/users/${userId}/clams/reduce`, { method: 'POST', body: JSON.stringify({ amount: 4 }) });
    assert.equal(reduce.status, 200);
    assert.equal(reduce.body.clam_total, 6);

    const after = await historyFor(userId);
    // Every pre-existing row is untouched (same id and value).
    const afterIds = after.map((r) => `${r.id}:${r.clam_value}`);
    for (const key of beforeIds) {
        assert.ok(afterIds.includes(key), `row ${key} survived spending`);
    }
    const spent = after.find((r) => r.kind === 'spent');
    assert.ok(spent, 'spent row exists');
    assert.equal(spent.clam_value, -4);
    assert.equal(spent.title, 'Spent');

    // Guards.
    assert.equal((await api(`/api/users/${userId}/clams/reduce`, { method: 'POST', body: JSON.stringify({ amount: 999 }) })).status, 400);
    assert.equal((await api(`/api/users/${userId}/clams/reduce`, { method: 'POST', body: JSON.stringify({ amount: 1, kind: 'bogus' }) })).status, 400);

    // Optional kind: 'adjustment' for admin corrections.
    await api(`/api/users/${userId}/clams/reduce`, { method: 'POST', body: JSON.stringify({ amount: 1, kind: 'adjustment' }) });
    const corrections = (await historyFor(userId)).filter((r) => r.kind === 'adjustment' && r.clam_value < 0);
    assert.equal(corrections.length, 1);

    // /recent surfaces the negative spend with its kind.
    const recent = await api('/api/chore-history/recent?days=2');
    const recentSpend = recent.body.find((r) => r.kind === 'spent' && r.clam_value === -4);
    assert.ok(recentSpend, 'spent row visible in /recent');
});

test('nightly job logs missed chores idempotently; retro-completion clears them', async () => {
    const userId = await createUser('missed-kid');
    const { scheduleId } = await createDailyChore(userId, 'Fold laundry');
    const yesterday = localDate(1);

    const run1 = await api('/api/system/backgroundTasks');
    assert.equal(run1.status, 200);

    let missed = (await historyFor(userId)).filter((r) => r.kind === 'missed');
    assert.equal(missed.length, 1, 'one missed row logged');
    assert.equal(missed[0].date, yesterday);
    assert.equal(missed[0].chore_schedule_id, scheduleId);
    assert.equal(missed[0].title, 'Fold laundry');
    assert.equal(missed[0].clam_value, 0);

    // Second run: idempotent.
    await api('/api/system/backgroundTasks');
    missed = (await historyFor(userId)).filter((r) => r.kind === 'missed');
    assert.equal(missed.length, 1, 'still exactly one missed row');

    // Retroactive completion replaces the missed record.
    const complete = await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: scheduleId, user_id: userId, date: yesterday }),
    });
    assert.equal(complete.status, 200, 'missed row must not 409-block completion');
    const rows = await historyFor(userId);
    assert.equal(rows.filter((r) => r.kind === 'missed').length, 0, 'missed row cleared');
    assert.equal(rows.filter((r) => r.kind === 'completion' && r.date === yesterday).length, 1);
});

test('snoozed-through chores are not logged as missed', async () => {
    const userId = await createUser('snoozed-kid');
    const { scheduleId } = await createDailyChore(userId, 'Rake leaves');
    const farFuture = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await api(`/api/chore-schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ snoozed_until: farFuture }),
    });

    await api('/api/system/backgroundTasks');
    const missed = (await historyFor(userId)).filter((r) => r.kind === 'missed');
    assert.equal(missed.length, 0, 'snoozed chore not counted as missed');
});

test('vacation mode pauses missed-chore logging; disabling resumes it', async () => {
    const userId = await createUser('vacation-kid');
    await createDailyChore(userId, 'Water flowers');

    // Household vacation on (simple toggle, no date bounds).
    await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'vacation_mode', value: JSON.stringify({ enabled: true, startDate: '', endDate: '' }) }),
    });

    const vacationRun = await api('/api/system/backgroundTasks');
    assert.equal(vacationRun.body.missedSkippedForVacation, true, 'job reports the vacation skip');
    assert.equal((await historyFor(userId)).filter((r) => r.kind === 'missed').length, 0, 'no missed rows during vacation');

    // A bounded vacation that ended before yesterday does NOT pause logging.
    await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'vacation_mode', value: JSON.stringify({ enabled: true, startDate: '2020-01-01', endDate: '2020-01-14' }) }),
    });
    await api('/api/system/backgroundTasks');
    assert.equal((await historyFor(userId)).filter((r) => r.kind === 'missed').length, 1, 'expired vacation range no longer pauses logging');

    // Clean up for subsequent tests.
    await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'vacation_mode', value: JSON.stringify({ enabled: false, startDate: '', endDate: '' }) }),
    });
});

test('prune-safety: a missed row must not get an uncompleted one-time chore pruned', async () => {
    const userId = await createUser('prune-kid');
    const chore = await api('/api/chores', { method: 'POST', body: JSON.stringify({ title: 'Clean garage', clam_value: 0 }) });
    // One-time schedule: no crontab → always due.
    const schedule = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, duration: 'day-of' }),
    });
    const scheduleId = schedule.body.id;

    await api('/api/system/backgroundTasks');

    // The uncompleted one-time chore got a missed row AND survived the prune.
    const missed = (await historyFor(userId)).filter((r) => r.kind === 'missed' && r.chore_schedule_id === scheduleId);
    assert.equal(missed.length, 1, 'missed row for the one-time chore');
    assert.equal((await api(`/api/chore-schedules/${scheduleId}`)).status, 200, 'schedule NOT pruned');

    // Once actually completed, the next run prunes it.
    await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: scheduleId, user_id: userId, date: localDate(0) }),
    });
    await api('/api/system/backgroundTasks');
    assert.equal((await api(`/api/chore-schedules/${scheduleId}`)).status, 404, 'completed one-time chore pruned');
});
