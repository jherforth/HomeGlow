const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// Boots a real server with DEMO_MODE=true and verifies the demo behaviors:
// PIN disabled, sample data seeded, abuse-prone routes blocked, normal
// interactive routes still working. Uses the in-memory DB demo mode forces,
// so no test DB artifacts are created.

const serverDir = path.resolve(__dirname, '..');
const port = 5600 + Math.floor(Math.random() * 300);
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
            const response = await fetch(`${baseUrl}/api/demo`);
            if (response.ok) {
                return;
            }
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }

    throw new Error(`Demo server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
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
    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(port),
            DEMO_MODE: 'true',
            TZ: 'UTC',
            HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
            // Demo mode syncs its curated calendar feeds; keep tests offline.
            HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
            ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
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
});

test('demo status endpoint reports demo mode', async () => {
    const res = await api('/api/demo');
    assert.equal(res.status, 200);
    assert.equal(res.body.demo, true);
    assert.ok(res.body.resetHours > 0);
});

test('admin PIN is disabled: exists is false and mutations are blocked', async () => {
    const exists = await api('/api/admin-pin/exists');
    assert.equal(exists.status, 200);
    assert.equal(exists.body.exists, false);
    assert.equal(exists.body.demo, true);

    const set = await api('/api/admin-pin/set', {
        method: 'POST',
        body: JSON.stringify({ pin: '1234' }),
    });
    assert.equal(set.status, 403);

    const verify = await api('/api/admin-pin/verify', {
        method: 'POST',
        body: JSON.stringify({ pin: '1234' }),
    });
    assert.equal(verify.status, 403);

    const del = await api('/api/admin-pin', { method: 'DELETE' });
    assert.equal(del.status, 403);
});

test('sample data is seeded (users, chores, prizes, calendar events)', async () => {
    const users = await api('/api/users');
    assert.equal(users.status, 200);
    const usernames = users.body.map((u) => u.username);
    assert.ok(usernames.includes('Emma'));
    assert.ok(usernames.includes('Liam'));

    const chores = await api('/api/chores');
    assert.equal(chores.status, 200);
    assert.ok(chores.body.length >= 3);

    const prizes = await api('/api/prizes');
    assert.equal(prizes.status, 200);
    assert.ok(prizes.body.length >= 2);

    const events = await api('/api/calendar-events');
    assert.equal(events.status, 200);
    assert.ok(events.body.length >= 4);

    // Family Calendar placeholder + the 4 curated live ICS feeds.
    const sources = await api('/api/calendar-sources');
    assert.equal(sources.status, 200);
    assert.ok(sources.body.length >= 5);
    const sourceNames = sources.body.map((s) => s.name);
    assert.ok(sourceNames.includes('US Federal Holidays'));
    assert.ok(sourceNames.includes('Arizona Diamondbacks'));
});

test('demo weather snapshot is served in both unit systems', async () => {
    const imperial = await api('/api/demo/weather');
    assert.equal(imperial.status, 200);
    assert.equal(imperial.body.weatherData.name, 'Chili');
    assert.equal(typeof imperial.body.weatherData.main.temp, 'number');
    assert.ok(Array.isArray(imperial.body.forecastData) && imperial.body.forecastData.length === 3);
    assert.ok(Array.isArray(imperial.body.chartData) && imperial.body.chartData.length === 8);
    assert.ok(imperial.body.airQualityData.list[0].main.aqi >= 1);

    const metric = await api('/api/demo/weather?units=metric');
    assert.equal(metric.status, 200);
    assert.ok(metric.body.weatherData.main.temp < imperial.body.weatherData.main.temp,
        'metric temperature should be the Celsius conversion of the imperial snapshot');
});

test('abuse-prone routes are blocked with 403', async () => {
    // Note: widget upload/install/delete and the plugin platform APIs are
    // deliberately NOT blocked — plugins are a showcase feature and their
    // state lives in the in-memory demo DB, wiped on the reset cycle.
    const blocked = [
        ['GET', '/api/proxy?url=https://example.com'],
        ['POST', '/api/sounds/upload'],
        ['DELETE', '/api/sounds/some-sound.mp3'],
        ['POST', '/api/users/1/upload-picture'],
        ['POST', '/api/connections/google/config'],
        ['GET', '/api/connections/google/authorize'],
        ['GET', '/api/connections/google/callback'],
        ['DELETE', '/api/connections/google/account'],
        ['POST', '/api/connections/apple/calendars'],
        ['POST', '/api/calendar-sources'],
        ['PATCH', '/api/calendar-sources/1'],
        ['DELETE', '/api/calendar-sources/1'],
        ['POST', '/api/calendar-sources/1/test'],
        ['POST', '/api/photo-sources/1/uploaded'],
        ['POST', '/api/calendar-sync/1'],
        ['POST', '/api/calendar-sync/all'],
        ['PATCH', '/api/calendar-sync/1/interval'],
    ];

    for (const [method, pathname] of blocked) {
        const res = await api(pathname, { method, body: method === 'GET' ? undefined : JSON.stringify({}) });
        assert.equal(res.status, 403, `${method} ${pathname} expected 403, got ${res.status}`);
        assert.match(res.body.error, /demo mode/i);
    }
});

test('plugins can be installed and exercised end-to-end in demo mode', async () => {
    const manifest = {
        manifestVersion: 1,
        id: 'demo-trial-plugin',
        storage: true,
        settings: [{ key: 'threshold', label: 'Threshold', type: 'number', default: 3 }],
    };
    const html = `<html><head><title>demo</title><script type="application/json" id="homeglow-manifest">${JSON.stringify(manifest)}</script></head><body>demo plugin</body></html>`;

    const form = new FormData();
    form.append('file', new Blob([html], { type: 'text/html' }), 'demo-trial-plugin.html');
    const upload = await fetch(`${baseUrl}/api/widgets/upload`, { method: 'POST', body: form });
    assert.equal(upload.status, 200);

    const served = await api('/widgets/demo-trial-plugin.html');
    assert.equal(served.status, 200);

    // Storage and settings mutations work too (state is in the in-memory DB).
    const put = await api('/api/plugin/v1/storage/demo-trial-plugin/state', {
        method: 'PUT',
        body: JSON.stringify({ tries: 1 }),
    });
    assert.equal(put.status, 200);
    const settings = await api('/api/plugin/v1/settings/demo-trial-plugin', {
        method: 'PUT',
        body: JSON.stringify({ threshold: 5 }),
    });
    assert.equal(settings.status, 200);

    const del = await api('/api/widgets/demo-trial-plugin.html?purgeData=true', { method: 'DELETE' });
    assert.equal(del.status, 200);
});

test('normal interactive routes still work (chore completion round-trip)', async () => {
    const schedules = await api('/api/chore-schedules');
    assert.equal(schedules.status, 200);
    assert.ok(schedules.body.length >= 3);

    const users = await api('/api/users');
    const emma = users.body.find((u) => u.username === 'Emma');
    const schedule = schedules.body.find((s) => s.user_id === emma.id);
    assert.ok(schedule, 'Emma should have a seeded schedule');

    const today = new Date().toISOString().slice(0, 10);
    const complete = await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: schedule.id, user_id: emma.id, date: today }),
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.body.success, true);

    const uncomplete = await api('/api/chores/uncomplete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: schedule.id, user_id: emma.id, date: today }),
    });
    assert.equal(uncomplete.status, 200);
});
