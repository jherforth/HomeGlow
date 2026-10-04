const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `chore-schedule-fixes-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 6300 + Math.floor(Math.random() * 300);
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
    serverProcess.stdout.on('data', (d) => { serverLogs += d.toString(); });
    serverProcess.stderr.on('data', (d) => { serverLogs += d.toString(); });
    await waitForServerReady();
});

test.after(async () => {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        await delay(500);
        if (!serverProcess.killed) serverProcess.kill('SIGKILL');
    }
    if (!keepTestArtifacts) {
        try { fs.unlinkSync(testDbPath); } catch {}
    }
});

let choreId;
let userId;

test.before(async () => {
    // Create a test chore and user
    const choreRes = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test Chore', clam_value: 1 }),
    });
    assert.equal(choreRes.status, 200);
    choreId = choreRes.body.id;

    const userRes = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'TestKid', email: 'testkid@example.com' }),
    });
    assert.equal(userRes.status, 200);
    userId = userRes.body.id;
});

test('POST /api/chore-schedules rejects once-completed without crontab', async () => {
    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_id: userId,
            duration: 'once-completed',
            interval: '30d',
            crontab: null,
        }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /crontab/);
});

test('PATCH /api/chore-schedules/:id rejects once-completed without crontab', async () => {
    // Create a valid once-completed schedule first
    const createRes = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_id: userId,
            duration: 'once-completed',
            interval: '30d',
            crontab: '0 9 * * *',
        }),
    });
    assert.equal(createRes.status, 200);
    const scheduleId = createRes.body.id;

    // Try to wipe the crontab via PATCH
    const patchRes = await api(`/api/chore-schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ crontab: null }),
    });
    assert.equal(patchRes.status, 400);
    assert.match(patchRes.body.error, /crontab/);
});

test('Batch POST validates chore_id', async () => {
    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            user_ids: [userId],
            duration: 'day-of',
        }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /chore_id/);
});

test('Batch POST validates crontab', async () => {
    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_ids: [userId],
            duration: 'day-of',
            crontab: 'not-a-crontab',
        }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /crontab/i);
});

test('Batch POST validates once-completed requires crontab', async () => {
    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_ids: [userId],
            duration: 'once-completed',
            interval: '30d',
        }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /crontab/);
});

test('Single-path once-completed creates initial child schedule', async () => {
    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_id: userId,
            duration: 'once-completed',
            interval: '30d',
            crontab: '0 9 * * *',
        }),
    });
    assert.equal(res.status, 200);
    const parentId = res.body.id;

    // Check that a child was created
    const listRes = await api(`/api/chore-schedules?chore_id=${choreId}`);
    assert.equal(listRes.status, 200);
    const child = listRes.body.find(s => s.parent_schedule_id === parentId);
    assert.ok(child, 'Child schedule should exist');
    assert.equal(child.duration, 'day-of');
});

test('GET /api/chore-schedules does not hide future-dated chores', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const createRes = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_id: userId,
            duration: 'day-of',
            due_date: tomorrowStr,
        }),
    });
    assert.equal(createRes.status, 200);

    const listRes = await api(`/api/chore-schedules?usage=chart&chore_id=${choreId}`);
    assert.equal(listRes.status, 200);
    const found = listRes.body.find(s => s.id === createRes.body.id);
    assert.ok(found, 'Future-dated chore should be visible');
});
