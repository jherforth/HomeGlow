// Chore icons (issue #141).
//
// The icon lives on the chore rather than the schedule, so the properties worth
// pinning are that it survives the CRUD round trip, that every schedule of a
// chore inherits it (that is what the widget reads), and that the column
// survives a replayed migration.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `chore-icons-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 8600 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;
let serverLogs = '';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const serverEnv = {
    PORT: String(port),
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

function startServer() {
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

test('an icon survives create, read, and update', async () => {
    const created = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Make your bed', description: 'Every morning', clam_value: 0, icon: '🛏️' }),
    });
    assert.equal(created.status, 200);

    const chores = await api('/api/chores');
    const chore = chores.body.find((c) => c.id === created.body.id);
    assert.equal(chore.icon, '🛏️', 'multi-code-point emoji must round trip intact');

    // Changing the icon.
    await api(`/api/chores/${chore.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: chore.title, description: chore.description, clam_value: 0, icon: '🧹' }),
    });
    const afterEdit = (await api('/api/chores')).body.find((c) => c.id === chore.id);
    assert.equal(afterEdit.icon, '🧹');

    // Clearing it.
    await api(`/api/chores/${chore.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: chore.title, description: chore.description, clam_value: 0, icon: '' }),
    });
    const afterClear = (await api('/api/chores')).body.find((c) => c.id === chore.id);
    assert.equal(afterClear.icon, null, 'an empty icon stores as NULL, not an empty string');
});

test('a chore with no icon is null rather than undefined or empty', async () => {
    const created = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Iconless chore', clam_value: 0 }),
    });
    const chore = (await api('/api/chores')).body.find((c) => c.id === created.body.id);
    assert.equal(chore.icon, null);
});

test('every schedule of a chore carries its icon, which is what the widget reads', async () => {
    const chore = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Feed the cat', clam_value: 0, icon: '🐱' }),
    });
    const alice = await api('/api/users', {
        method: 'POST', body: JSON.stringify({ username: `icon-a-${process.pid}`, email: 'a@example.com' }),
    });
    const bob = await api('/api/users', {
        method: 'POST', body: JSON.stringify({ username: `icon-b-${process.pid}`, email: 'b@example.com' }),
    });

    // The same chore assigned to two people: both schedules should show it.
    for (const userId of [alice.body.id, bob.body.id]) {
        await api('/api/chore-schedules', {
            method: 'POST',
            body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, duration: 'day-of' }),
        });
    }

    const schedules = (await api('/api/chore-schedules')).body
        .filter((s) => s.chore_id === chore.body.id);
    assert.equal(schedules.length, 2);
    for (const schedule of schedules) {
        assert.equal(schedule.icon, '🐱', 'the schedules query must join c.icon through');
    }
});

test('an over-long icon value is truncated rather than stored whole', async () => {
    // The field is meant for one emoji; a pasted paragraph should not become a
    // chore icon (or a storage vector).
    const created = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Long icon', clam_value: 0, icon: 'x'.repeat(500) }),
    });
    const chore = (await api('/api/chores')).body.find((c) => c.id === created.body.id);
    assert.ok(chore.icon.length <= 16, `expected <= 16 chars, got ${chore.icon.length}`);
});

test('whitespace-only icons are treated as no icon', async () => {
    const created = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Blank icon', clam_value: 0, icon: '   ' }),
    });
    const chore = (await api('/api/chores')).body.find((c) => c.id === created.body.id);
    assert.equal(chore.icon, null);
});

test('the icon column is restored when the migration replays', async () => {
    // Simulates the migration running again after a schema-id reset — the
    // PRAGMA guard must make it idempotent rather than erroring on a duplicate
    // column, and existing icons must survive.
    const chore = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Survives replay', clam_value: 0, icon: '🪥' }),
    });
    const choreId = chore.body.id;

    await stopServer();

    // Roll the recorded schema id back so migration 24 runs again on boot.
    const db = new Database(testDbPath);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('SYSTEM_SCHEMA_ID', '23')").run();
    db.close();

    await startServer();

    const after = (await api('/api/chores')).body.find((c) => c.id === choreId);
    assert.ok(after, 'the chore survived the replay');
    assert.equal(after.icon, '🪥', 'the icon survived the replay');

    // And the column is still usable afterwards.
    const fresh = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'After replay', clam_value: 0, icon: '🧺' }),
    });
    const freshChore = (await api('/api/chores')).body.find((c) => c.id === fresh.body.id);
    assert.equal(freshChore.icon, '🧺');
});
