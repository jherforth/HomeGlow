const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `api-endpoints-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 5200 + Math.floor(Math.random() * 300);
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
            if (response.ok) {
                return;
            }
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }

    throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

async function api(pathname, options = {}) {
    const headers = {
        ...(options.headers || {}),
    };

    if (options.body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers,
    });

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

    serverProcess.stdout.on('data', (chunk) => {
        serverLogs += chunk.toString();
    });
    serverProcess.stderr.on('data', (chunk) => {
        serverLogs += chunk.toString();
    });

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
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    } else {
        console.log(`[test-debug] Preserving API test DB artifacts for inspection: ${testDbPath}`);
    }
});

test('GET /api/test returns basic server health payload', async () => {
    const { status, body } = await api('/api/test');

    assert.equal(status, 200);
    assert.equal(body.message, 'Server is working!');
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(typeof body.widgetsDir, 'string');
});

test('GET /api/timezone returns configured timezone', async () => {
    const { status, body } = await api('/api/timezone');

    assert.equal(status, 200);
    assert.equal(body.timezone, 'UTC');
});

test('settings endpoints persist and query values', async () => {
    const saveRes = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
            key: 'TEST_SETTING_JSON',
            value: JSON.stringify({ featureEnabled: true, retries: 2 }),
        }),
    });
    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.success, true);

    const getRes = await api('/api/settings');
    assert.equal(getRes.status, 200);
    assert.deepEqual(getRes.body.TEST_SETTING_JSON, { featureEnabled: true, retries: 2 });

    const searchRes = await api('/api/settings/search', {
        method: 'POST',
        body: JSON.stringify(['TEST_SETTING_*']),
    });
    assert.equal(searchRes.status, 200);
    assert.deepEqual(searchRes.body.TEST_SETTING_JSON, { featureEnabled: true, retries: 2 });
});

test('prize endpoints validate and support CRUD lifecycle', async () => {
    const invalidRes = await api('/api/prizes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Invalid', clam_cost: 0 }),
    });
    assert.equal(invalidRes.status, 400);

    const createRes = await api('/api/prizes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Movie Night', clam_cost: 15 }),
    });
    assert.equal(createRes.status, 200);
    assert.equal(typeof createRes.body.id, 'number');

    const prizeId = createRes.body.id;

    const listRes = await api('/api/prizes');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.some((row) => row.id === prizeId && row.name === 'Movie Night'));

    const updateRes = await api(`/api/prizes/${prizeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Pizza Night', clam_cost: 20 }),
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);

    const deleteRes = await api(`/api/prizes/${prizeId}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.success, true);

    const deleteAgainRes = await api(`/api/prizes/${prizeId}`, { method: 'DELETE' });
    assert.equal(deleteAgainRes.status, 404);
});

test('user endpoints support create, list, and update', async () => {
    const createRes = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
            username: 'Test User',
            email: 'test-user@example.com',
            profile_picture: null,
        }),
    });

    assert.equal(createRes.status, 200);
    assert.equal(typeof createRes.body.id, 'number');

    const userId = createRes.body.id;

    const listRes = await api('/api/users');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));

    const user = listRes.body.find((row) => row.id === userId);
    assert.ok(user);
    assert.equal(user.username, 'Test User');
    assert.equal(typeof user.clam_total, 'number');

    const updateRes = await api(`/api/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
            username: 'Updated User',
            email: 'updated-user@example.com',
            profile_picture: null,
        }),
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
});
