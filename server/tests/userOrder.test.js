// User display order (issue #134): users carry a sort_order that every
// consumer inherits from GET /api/users, and the admin panel persists a new
// order through PATCH /api/users/reorder.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `user-order-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 7500 + Math.floor(Math.random() * 300);
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

const usernamesInOrder = async () => (await api('/api/users')).body
    .filter((u) => u.id !== 0)
    .map((u) => u.username);

let alice;
let bob;
let carol;

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

    const create = async (username) => (await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, email: `${username}@example.com` }),
    })).body.id;
    alice = await create('alice');
    bob = await create('bob');
    carol = await create('carol');
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

test('new users are appended to the display order', async () => {
    assert.deepEqual(await usernamesInOrder(), ['alice', 'bob', 'carol']);

    const dave = (await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'dave', email: 'dave@example.com' }),
    })).body.id;
    assert.deepEqual(await usernamesInOrder(), ['alice', 'bob', 'carol', 'dave'], 'appended, not inserted');

    await api(`/api/users/${dave}`, { method: 'DELETE' });
});

test('reorder persists and GET /api/users reflects it', async () => {
    const res = await api('/api/users/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ orderedUserIds: [carol, alice, bob] }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await usernamesInOrder(), ['carol', 'alice', 'bob']);

    // The bonus pseudo-user stays pinned ahead of everyone.
    const all = (await api('/api/users')).body;
    assert.equal(all[0].id, 0, 'bonus user remains first');

    // A user added after a reorder still lands at the end.
    const erin = (await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'erin', email: 'erin@example.com' }),
    })).body.id;
    assert.deepEqual(await usernamesInOrder(), ['carol', 'alice', 'bob', 'erin']);
    await api(`/api/users/${erin}`, { method: 'DELETE' });
});

test('reorder rejects partial, duplicated, or unknown id lists', async () => {
    const before = await usernamesInOrder();

    const cases = [
        { name: 'not an array', body: { orderedUserIds: 'nope' } },
        { name: 'non-integer ids', body: { orderedUserIds: [carol, 'alice'] } },
        { name: 'missing a user', body: { orderedUserIds: [carol, alice] } },
        { name: 'duplicate ids', body: { orderedUserIds: [carol, carol, alice] } },
        { name: 'unknown id', body: { orderedUserIds: [carol, alice, 99999] } },
    ];
    for (const testCase of cases) {
        const res = await api('/api/users/reorder', { method: 'PATCH', body: JSON.stringify(testCase.body) });
        assert.equal(res.status, 400, `${testCase.name} rejected`);
    }

    // The bonus user is not reorderable, so including it is also a mismatch.
    assert.equal((await api('/api/users/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ orderedUserIds: [0, carol, alice, bob] }),
    })).status, 400);

    assert.deepEqual(await usernamesInOrder(), before, 'order untouched by rejected requests');
});

test('deleting a user leaves the rest in order', async () => {
    await api(`/api/users/${alice}`, { method: 'DELETE' });
    assert.deepEqual(await usernamesInOrder(), ['carol', 'bob']);

    // Reordering still works with the smaller set.
    assert.equal((await api('/api/users/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ orderedUserIds: [bob, carol] }),
    })).status, 200);
    assert.deepEqual(await usernamesInOrder(), ['bob', 'carol']);
});
