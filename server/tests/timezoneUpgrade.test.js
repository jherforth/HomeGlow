// Schema migration 26: installs that ran on the old America/New_York default
// keep it, while new installs follow the host's zone.
// 1) boot a fresh server with no TZ: it follows the host and pins nothing;
// 2) revert the DB to schema 25 (an install from before the change), boot
//    again with no TZ: New York is saved as its chosen zone;
// 3) the same with TZ set: TZ keeps deciding and nothing is saved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `tz-upgrade-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let port;
let baseUrl;

// Ask the OS for a free port: a port picked from a fixed range can be one
// another program holds on 127.0.0.1, and then every request reaches it.
async function usePort() {
    port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
}

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

async function startServer(tz) {
    await usePort();
    const env = {
        ...process.env,
        PORT: String(port),
        DB_PATH: testDbPath,
        HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
        HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
        ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    };
    if (tz) env.TZ = tz;
    else delete env.TZ;
    serverLogs = '';
    serverProcess = spawn('node', ['index.js'], { cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
}

async function timezone() {
    return (await fetch(`${baseUrl}/api/timezone`)).json();
}

// What an install from before migration 26 looks like: schema 25, no zone saved.
function revertToSchema25() {
    const db = new Database(testDbPath);
    db.prepare("DELETE FROM settings WHERE key = 'APP_TIMEZONE'").run();
    db.prepare("UPDATE settings SET value = '25' WHERE key = 'SYSTEM_SCHEMA_ID'").run();
    db.close();
}

function savedZone() {
    const db = new Database(testDbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'APP_TIMEZONE'").get();
    db.close();
    return row ? row.value : null;
}

test.after(async () => {
    await stopServer();
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

test('a new install with no TZ follows the host and saves nothing', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    await startServer(null);
    const tz = await timezone();
    await stopServer();

    assert.equal(tz.source, 'host', serverLogs);
    assert.equal(tz.fallbackSource, 'host');
    assert.equal(savedZone(), null);
});

test('an existing install that never set TZ keeps New York', async () => {
    revertToSchema25();
    await startServer(null);
    const tz = await timezone();
    await stopServer();

    assert.equal(tz.timezone, 'America/New_York', serverLogs);
    assert.equal(tz.source, 'setting');
    assert.equal(tz.fallbackSource, 'host');
    assert.equal(savedZone(), 'America/New_York');
});

test('an existing install with TZ set keeps following TZ', async () => {
    revertToSchema25();
    await startServer('Europe/Berlin');
    const tz = await timezone();
    await stopServer();

    assert.deepEqual(
        { timezone: tz.timezone, source: tz.source },
        { timezone: 'Europe/Berlin', source: 'env' },
        serverLogs,
    );
    assert.equal(savedZone(), null);
});

test('the migration runs once: a later reset to the host zone sticks', async () => {
    // State from the previous test: schema 26, nothing saved, now no TZ.
    await startServer(null);
    const tz = await timezone();
    await stopServer();

    assert.equal(tz.source, 'host', serverLogs);
    assert.equal(savedZone(), null);
});
