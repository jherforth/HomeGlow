// A server east of UTC: every crontab the app writes fires at local midnight,
// which there is still the previous day in UTC. Reading the cron's next run
// with toISOString() put each daily chore on the wrong day, so finishing the
// day's chores never paid the daily bonus. Asia/Tokyo has no daylight saving,
// so the test means the same thing all year.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `east-of-utc-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let port;
let baseUrl;

// Ask the OS for a free port: a port picked from a fixed range can be one
// another program holds on 127.0.0.1, and then every request reaches it.
async function usePort() {
    port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
}
const ZONE = 'Asia/Tokyo';

let serverProcess;
let serverLogs = '';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : {},
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

// Today as the server sees it, in its zone.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());

test.before(async () => {
    await usePort();
    fs.mkdirSync(tmpDir, { recursive: true });
    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(port),
            DB_PATH: testDbPath,
            TZ: ZONE,
            HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
            HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
            ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });

    const start = Date.now();
    while (Date.now() - start < 30000) {
        try {
            if ((await fetch(`${baseUrl}/api/test`)).ok) return;
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }
    throw new Error(`Server did not become ready. Logs:\n${serverLogs}`);
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

test('finishing a daily chore pays the daily bonus east of UTC', async () => {
    assert.equal((await api('/api/timezone')).body.timezone, ZONE);

    const user = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: `tokyo-${process.pid}`, email: `tokyo-${process.pid}@example.com` }),
    });
    const chore = await api('/api/chores', { method: 'POST', body: JSON.stringify({ title: 'Water plants', clam_value: 0 }) });
    const schedule = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: chore.body.id, user_id: user.body.id, crontab: '0 0 * * *', duration: 'day-of', visible: 1 }),
    });

    await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: schedule.body.id, user_id: user.body.id, date: today }),
    });

    const clams = (await api(`/api/users/${user.body.id}/clams`)).body.clam_total;
    // The default daily_completion_clam_reward.
    assert.equal(clams, 2, `daily chore was not counted as due on ${today}. Logs:\n${serverLogs.slice(-2000)}`);
});
