// Names and titles are saved without leading or trailing spaces.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `trimmed-names-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let port;
let baseUrl;

// Ask the OS for a free port: a port picked from a fixed range can be one
// another program holds on 127.0.0.1, and then every request reaches it.
async function usePort() {
    port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverEnv.PORT = String(port);
}

let serverProcess;
let serverLogs = '';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const serverEnv = {
    DB_PATH: testDbPath,
    TZ: 'UTC',
    HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
    HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
    ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
};

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

async function startServer() {
    await usePort();
    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: { ...process.env, ...serverEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    return waitForServerReady();
}

async function stopServer() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', () => resolve());
            setTimeout(resolve, 5000);
        });
    }
    serverProcess = null;
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
    await startServer();
});

test.after(async () => {
    await stopServer();
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

test('chore titles and descriptions are saved without outer spaces', async () => {
    const created = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: '  Compost out ', description: ' Before school  ', clam_value: 0 }),
    });
    assert.equal(created.status, 200);
    let chore = (await api('/api/chores')).body.find((c) => c.id === created.body.id);
    assert.equal(chore.title, 'Compost out');
    assert.equal(chore.description, 'Before school');

    await api(`/api/chores/${chore.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Tennis prep ', description: '', clam_value: 0, icon: '' }),
    });
    chore = (await api('/api/chores')).body.find((c) => c.id === created.body.id);
    assert.equal(chore.title, 'Tennis prep');
    assert.equal(chore.description, '');
});

test('a person\'s name is saved without outer spaces', async () => {
    const created = await api('/api/users', { method: 'POST', body: JSON.stringify({ username: ' Henry ' }) });
    assert.equal(created.status, 200);
    let user = (await api('/api/users')).body.find((u) => u.id === created.body.id);
    assert.equal(user.username, 'Henry');
    await api(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ username: 'Mia  ' }) });
    user = (await api('/api/users')).body.find((u) => u.id === created.body.id);
    assert.equal(user.username, 'Mia');
});

test('a prize name is saved without outer spaces, and spaces alone are no name', async () => {
    const created = await api('/api/prizes', { method: 'POST', body: JSON.stringify({ name: ' Movie night ', clam_cost: 10 }) });
    assert.equal(created.status, 200);
    const prize = (await api('/api/prizes')).body.find((p) => p.id === created.body.id);
    assert.equal(prize.name, 'Movie night');
    const blank = await api('/api/prizes', { method: 'POST', body: JSON.stringify({ name: '   ', clam_cost: 10 }) });
    assert.equal(blank.status, 400);
});
