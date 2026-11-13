const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { freePort } = require('./freePort');

// Boots a real server with DEMO_MODE=true and verifies the demo behaviors:
// PIN disabled, sample data seeded, abuse-prone routes blocked, normal
// interactive routes still working. Uses the in-memory DB demo mode forces,
// so no test DB artifacts are created.

const serverDir = path.resolve(__dirname, '..');
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

// Stand-in for Open-Meteo's forecast API, so the demo's live weather is
// tested offline. Records each request; answers a forecast for the next two
// days in UTC, with temperatures in whichever unit was asked for.
let fakeForecast;
const forecastRequests = [];
function forecastFor(params) {
    const metric = params.get('temperature_unit') === 'celsius';
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const isoHour = (h) => new Date(today.getTime() + h * 3600 * 1000).toISOString().slice(0, 16);
    const hours = Array.from({ length: 48 }, (_, h) => isoHour(h));
    const days = Array.from({ length: 7 }, (_, d) => isoHour(d * 24).slice(0, 10));
    return {
        utc_offset_seconds: 0,
        current: {
            temperature_2m: metric ? 10 : 50, relative_humidity_2m: 60, apparent_temperature: metric ? 8 : 46,
            weather_code: 3, wind_speed_10m: metric ? 2 : 4.5, is_day: 1,
        },
        hourly: {
            time: hours,
            temperature_2m: hours.map(() => (metric ? 10 : 50)),
            precipitation: hours.map(() => 0),
            precipitation_probability: hours.map(() => 10),
        },
        daily: {
            time: days,
            weather_code: days.map(() => 3),
            temperature_2m_max: days.map(() => (metric ? 12 : 54)),
            temperature_2m_min: days.map(() => (metric ? 4 : 39)),
            precipitation_sum: days.map(() => 0),
            precipitation_probability_max: days.map(() => 10),
            uv_index_max: days.map(() => 2),
            sunrise: days.map((d) => `${d}T11:40`),
            sunset: days.map((d) => `${d}T21:40`),
        },
    };
}

test.before(async () => {
    await usePort();
    fakeForecast = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        forecastRequests.push(url.searchParams);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(forecastFor(url.searchParams)));
    });
    await new Promise((resolve) => fakeForecast.listen(0, '127.0.0.1', resolve));

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
            // ...and its live weather.
            OPENMETEO_FORECAST_BASE: `http://127.0.0.1:${fakeForecast.address().port}/v1/forecast`,
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
    if (fakeForecast) await new Promise((resolve) => fakeForecast.close(resolve));
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

test('demo weather is live from Open-Meteo, always for New York', async () => {
    // Through the normal weather route, so this exercises the same path a
    // real install uses.
    const imperial = await api('/api/weather?location=Paris');
    assert.equal(imperial.status, 200);
    assert.equal(imperial.body.provider, 'openmeteo');
    assert.equal(imperial.body.resolvedName, 'New York');
    assert.equal(imperial.body.current.temp, 50);
    assert.equal(imperial.body.hourly.length, 8);
    assert.equal(forecastRequests.length, 1);
    assert.equal(forecastRequests[0].get('latitude'), '40.71427');
    assert.equal(forecastRequests[0].get('longitude'), '-74.00597');

    // Another place, other coordinates, another language, a forced refresh:
    // all answered from the one cached New York reading.
    for (const query of ['?location=Tokyo', '?lat=51.5&lon=-0.12', '?lang=es', '?refresh=1']) {
        const again = await api(`/api/weather${query}`);
        assert.equal(again.status, 200);
        assert.equal(again.body.resolvedName, 'New York', query);
    }
    assert.equal(forecastRequests.length, 1, 'no further upstream calls');

    // Metric is its own reading, fetched in metric units.
    const metric = await api('/api/weather?units=metric');
    assert.equal(metric.status, 200);
    assert.equal(metric.body.current.temp, 10);
    assert.equal(forecastRequests.length, 2);
    assert.equal(forecastRequests[1].get('wind_speed_unit'), 'ms');

    // Weather scenes read the same cached reading.
    const condition = await api('/api/weather/condition');
    assert.equal(condition.status, 200);
    assert.equal(condition.body.condition, 'cloudy');
    assert.equal(forecastRequests.length, 2);
});

test('demo location lookups all resolve to New York, without a geocoder', async () => {
    for (const q of ['Paris', '90210', '']) {
        const res = await api(`/api/weather/geocode?q=${encodeURIComponent(q)}`);
        assert.equal(res.status, 200, q);
        assert.deepEqual(res.body, { lat: 40.71427, lon: -74.00597, resolvedName: 'New York' });
    }
});

test('abuse-prone routes are blocked with 403', async () => {
    // Note: widget upload/install/delete and the plugin platform APIs are
    // deliberately NOT blocked — plugins are a showcase feature and their
    // state lives in the in-memory demo DB, wiped on the reset cycle.
    const blocked = [
        ['GET', '/api/proxy?targetUrl=https://example.com'],
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

test('routines can be set up, ticked, and removed, as chores can', async () => {
    const users = await api('/api/users');
    const emma = users.body.find((u) => u.username === 'Emma');

    const step = await api('/api/routine-steps', {
        method: 'POST',
        body: JSON.stringify({ label: 'Brush teeth', icon: '🪥' }),
    });
    assert.equal(step.status, 200);

    const created = await api('/api/routines', {
        method: 'POST',
        body: JSON.stringify({ name: 'Bedtime', user_id: emma.id, trigger: 'days', days: [], steps: [step.body.id] }),
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));

    const today = new Date().toISOString().slice(0, 10);
    const ticked = await api(`/api/routines/${created.body.id}/steps/${step.body.id}`, {
        method: 'POST',
        body: JSON.stringify({ date: today, done: true }),
    });
    assert.equal(ticked.status, 200);
    assert.equal(ticked.body.completed, true);

    const edited = await api(`/api/routines/${created.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...created.body, name: 'Lights out' }),
    });
    assert.equal(edited.status, 200);

    assert.equal((await api(`/api/routines/${created.body.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await api(`/api/routine-steps/${step.body.id}`, { method: 'DELETE' })).status, 200);
});
