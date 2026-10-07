const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `multi-user-${process.pid}-${Date.now()}.db`);
const port = 5300 + Math.floor(Math.random() * 300);
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
        } catch { /* starting */ }
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
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: response.status, json, text };
}

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(port),
            DATABASE_PATH: testDbPath,
            NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (d) => { serverLogs += d.toString(); });
    serverProcess.stderr.on('data', (d) => { serverLogs += d.toString(); });
    await waitForServerReady();
});

test.after(async () => {
    if (serverProcess) serverProcess.kill();
    await delay(500);
    try { fs.unlinkSync(testDbPath); } catch { /* ignore */ }
});

async function createUser(username) {
    const res = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, email: `${username}@test.com` }),
    });
    assert.equal(res.status, 200, `create user ${username}: ${res.text}`);
    return res.json.id;
}

async function createChore(title) {
    const res = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title, clam_value: 5 }),
    });
    assert.equal(res.status, 200, `create chore: ${res.text}`);
    return res.json.id;
}

test('batch create schedules for multiple users', async () => {
    const u1 = await createUser('batchuser1');
    const u2 = await createUser('batchuser2');
    const choreId = await createChore('Batch Test Chore');

    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_ids: [u1, u2],
            crontab: '0 0 * * *',
            duration: 'day-of',
            visible: 1,
        }),
    });

    assert.equal(res.status, 200, `batch create: ${res.text}`);
    assert.equal(res.json.success, true);
    assert.equal(res.json.count, 2);
    assert.equal(res.json.ids.length, 2);

    // Verify both schedules exist
    const list = await api('/api/chore-schedules');
    assert.equal(list.status, 200);
    const created = list.json.filter(s => res.json.ids.includes(s.id));
    assert.equal(created.length, 2);
    const userIds = created.map(s => s.user_id).sort();
    assert.deepEqual(userIds, [u1, u2].sort());
});

test('batch create deduplicates repeated user IDs', async () => {
    const u1 = await createUser('dedupuser1');
    const u2 = await createUser('dedupuser2');
    const choreId = await createChore('Dedup Test Chore');

    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_ids: [u1, u2, u1, u2, u1], // duplicates
            crontab: '0 0 * * *',
            duration: 'day-of',
            visible: 1,
        }),
    });

    assert.equal(res.status, 200, `batch dedup: ${res.text}`);
    assert.equal(res.json.success, true);
    assert.equal(res.json.count, 2, 'should create only 2 schedules despite duplicates');
    assert.equal(res.json.ids.length, 2);
});

test('batch create rejects unknown user IDs with clear error', async () => {
    const u1 = await createUser('knownuser1');
    const choreId = await createChore('Unknown User Test Chore');

    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_ids: [u1, 999999],
            crontab: '0 0 * * *',
            duration: 'day-of',
            visible: 1,
        }),
    });

    assert.equal(res.status, 400, `should reject unknown user: ${res.text}`);
    assert.match(res.json.error, /Unknown user ID: 999999/);
});

test('batch create rejects invalid user IDs', async () => {
    const choreId = await createChore('Invalid User Test Chore');

    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            user_ids: ['not-a-number'],
            crontab: '0 0 * * *',
            duration: 'day-of',
            visible: 1,
        }),
    });

    assert.equal(res.status, 400, `should reject invalid user ID: ${res.text}`);
    assert.match(res.json.error, /Invalid user ID/);
});

test('batch create requires chore_id', async () => {
    const u1 = await createUser('nochoreuser1');

    const res = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            user_ids: [u1],
            crontab: '0 0 * * *',
            duration: 'day-of',
        }),
    });

    assert.equal(res.status, 400);
    assert.match(res.json.error, /chore_id is required/);
});
