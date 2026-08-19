// Home Assistant connection + secret containment (issue #57).
//
// The load-bearing assertion in this file is the redaction one. GET /api/settings
// is unauthenticated and returns the whole settings table, so a Home Assistant
// token stored there would be readable by every browser on the LAN and every
// plugin iframe — and that token controls the whole house. Encrypting it is not
// enough on its own; it must never be serialized out at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `home-assistant-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 7900 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

const SECRET_TOKEN = 'eyJhbGciOi.super-secret-long-lived-token.signature';

let serverProcess;
let serverLogs = '';
let fakeHomeAssistant;
let fakeHomeAssistantUrl;

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

const setSetting = (key, value) => api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
});

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Stand-in Home Assistant. Authenticates on the bearer token so we can
    // prove the server sends it and that a wrong one surfaces as a 401.
    fakeHomeAssistant = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.headers.authorization !== `Bearer ${SECRET_TOKEN}`) {
            res.statusCode = 401;
            return res.end(JSON.stringify({ message: 'Unauthorized' }));
        }
        if (req.url === '/api/') {
            return res.end(JSON.stringify({ message: 'API running.' }));
        }
        if (req.url === '/api/config') {
            return res.end(JSON.stringify({
                version: '2026.7.1',
                location_name: 'Test Home',
                latitude: 43.0848,
                longitude: -77.7522,
            }));
        }
        if (req.url === '/api/states') {
            return res.end(JSON.stringify([
                { entity_id: 'weather.home', state: 'sunny', attributes: { friendly_name: 'Home' } },
                { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } },
            ]));
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ message: 'not found' }));
    });
    await new Promise((resolve) => fakeHomeAssistant.listen(0, '127.0.0.1', resolve));
    fakeHomeAssistantUrl = `http://127.0.0.1:${fakeHomeAssistant.address().port}`;

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
});

test.after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', () => resolve());
            setTimeout(resolve, 5000);
        });
    }
    if (fakeHomeAssistant) {
        await new Promise((resolve) => fakeHomeAssistant.close(resolve));
    }
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

test('status reports an unconfigured connection without inventing one', async () => {
    const { status, body } = await api('/api/connections/homeassistant/status');
    assert.equal(status, 200);
    assert.equal(body.has_url, false);
    assert.equal(body.has_token, false);
    assert.equal(body.encryption.configured, true);
});

test('saving stores the token encrypted and never echoes it back', async () => {
    const save = await api('/api/connections/homeassistant', {
        method: 'PUT',
        body: JSON.stringify({
            url: fakeHomeAssistantUrl,
            token: SECRET_TOKEN,
            weather_entity: 'weather.home',
        }),
    });
    assert.equal(save.status, 200);
    assert.equal(save.body.success, true);

    const status = await api('/api/connections/homeassistant/status');
    assert.equal(status.body.has_token, true);
    assert.equal(status.body.url, fakeHomeAssistantUrl);
    assert.equal(status.body.weather_entity, 'weather.home');

    // The token must not appear anywhere in the status response.
    assert.ok(
        !JSON.stringify(status.body).includes(SECRET_TOKEN),
        'status response leaked the access token',
    );
});

test('GET /api/settings redacts every stored secret', async () => {
    await setSetting('WEATHER_API_KEY', 'owm-secret-key-abc123');
    await setSetting('GOOGLE_CLIENT_SECRET_ENC', 'pretend-ciphertext');

    const settings = await api('/api/settings');
    assert.equal(settings.status, 200);

    const serialized = JSON.stringify(settings.body);
    assert.ok(!('HOME_ASSISTANT_TOKEN_ENC' in settings.body), 'HA token key present');
    assert.ok(!('WEATHER_API_KEY' in settings.body), 'OpenWeatherMap key present');
    assert.ok(!('GOOGLE_CLIENT_SECRET_ENC' in settings.body), 'Google client secret present');
    assert.ok(!serialized.includes(SECRET_TOKEN), 'raw HA token leaked');
    assert.ok(!serialized.includes('owm-secret-key-abc123'), 'raw OpenWeatherMap key leaked');

    // Non-secret settings still come through.
    await setSetting('PROXY_WHITELIST', 'example.com');
    const after = await api('/api/settings');
    assert.equal(after.body.PROXY_WHITELIST, 'example.com');
});

test('the settings search route redacts secrets too, even when asked for them', async () => {
    // A wildcard search is the obvious way around a redaction that only covered
    // the plain GET.
    const search = await api('/api/settings/search', {
        method: 'POST',
        body: JSON.stringify(['WEATHER_*', 'HOME_ASSISTANT_*', 'GOOGLE_*']),
    });
    assert.equal(search.status, 200);
    assert.ok(!('WEATHER_API_KEY' in search.body), 'search leaked the OpenWeatherMap key');
    assert.ok(!('HOME_ASSISTANT_TOKEN_ENC' in search.body), 'search leaked the HA token');
    assert.ok(!JSON.stringify(search.body).includes(SECRET_TOKEN));
});

test('a blank write to a redacted setting leaves the stored value alone', async () => {
    // The Admin Panel edits these blind, so an untouched field submits "" on
    // every save. That must not wipe the key.
    const blank = await setSetting('WEATHER_API_KEY', '');
    assert.equal(blank.status, 200);

    const status = await api('/api/connections/weather/status');
    assert.equal(status.body.has_api_key, true, 'a blank save wiped the stored key');
});

test('the connection test reaches Home Assistant with the stored token', async () => {
    const result = await api('/api/connections/homeassistant/test', { method: 'POST' });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.version, '2026.7.1');
    assert.match(result.body.message, /Test Home/);
});

test('a bad token surfaces as a failed test rather than an exception', async () => {
    await api('/api/connections/homeassistant', {
        method: 'PUT',
        body: JSON.stringify({ token: 'wrong-token' }),
    });

    const result = await api('/api/connections/homeassistant/test', { method: 'POST' });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, false);
    assert.match(result.body.message, /rejected the access token/);

    // Restore the good token for the remaining tests.
    await api('/api/connections/homeassistant', {
        method: 'PUT',
        body: JSON.stringify({ token: SECRET_TOKEN }),
    });
});

test('an unreachable Home Assistant is a clear failure, not a hang', async () => {
    const savedUrl = (await api('/api/connections/homeassistant/status')).body.url;

    // Port 1 is reserved and refuses immediately.
    await api('/api/connections/homeassistant', {
        method: 'PUT',
        body: JSON.stringify({ url: 'http://127.0.0.1:1' }),
    });

    const result = await api('/api/connections/homeassistant/test', { method: 'POST' });
    assert.equal(result.body.ok, false);
    assert.match(result.body.message, /Could not reach Home Assistant/);

    await api('/api/connections/homeassistant', {
        method: 'PUT',
        body: JSON.stringify({ url: savedUrl }),
    });
});

test('the entity picker lists only weather entities', async () => {
    const result = await api('/api/connections/homeassistant/weather-entities');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.entities.map((e) => e.entity_id), ['weather.home']);
});

test('a bad URL is rejected at save time rather than at fetch time', async () => {
    const result = await api('/api/connections/homeassistant', {
        method: 'PUT',
        body: JSON.stringify({ url: 'ftp://nope' }),
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /http or https/);
});

test('geocode falls back to Home Assistant\'s own location when it is the provider', async () => {
    await setSetting('WEATHER_PROVIDER', 'homeassistant');

    // No query: the household already told Home Assistant where it lives, so
    // auto dark mode should not need an OpenWeatherMap key to find out.
    const result = await api('/api/weather/geocode');
    assert.equal(result.status, 200);
    assert.equal(Math.round(result.body.lat * 100) / 100, 43.08);
    assert.equal(result.body.resolvedName, 'Test Home');

    await setSetting('WEATHER_PROVIDER', 'openweathermap');
});

test('GET /api/sun computes sunrise and sunset with no provider involved', async () => {
    const result = await api('/api/sun?lat=40.7128&lon=-74.0060');
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.sunrise, 'number');
    assert.equal(typeof result.body.sunset, 'number');
    assert.ok(result.body.sunset > result.body.sunrise);

    const bad = await api('/api/sun?lat=notanumber');
    assert.equal(bad.status, 400);
});

test('status reports the stored provider separately from the effective one', async () => {
    // The Admin Panel's Weather Source selector binds to configured_provider.
    // In demo mode the *effective* provider is "demo", which is not one of the
    // selector's options — binding to it leaves the control blank, which is
    // exactly what happened before this field existed.
    await setSetting('WEATHER_PROVIDER', 'homeassistant');
    const status = await api('/api/connections/weather/status');

    assert.equal(status.body.configured_provider, 'homeassistant');
    assert.ok(
        ['openweathermap', 'homeassistant'].includes(status.body.configured_provider),
        'configured_provider must always be a selectable option',
    );

    await setSetting('WEATHER_PROVIDER', 'openweathermap');
    const back = await api('/api/connections/weather/status');
    assert.equal(back.body.configured_provider, 'openweathermap');
});

test('weather provider status explains what is missing', async () => {
    await setSetting('WEATHER_PROVIDER', 'homeassistant');
    const configured = await api('/api/connections/weather/status');
    assert.equal(configured.body.provider, 'homeassistant');
    assert.equal(configured.body.configured, true);

    // Clearing the connection should make the reason explicit rather than
    // failing silently at render time.
    await api('/api/connections/homeassistant', { method: 'DELETE' });
    const cleared = await api('/api/connections/weather/status');
    assert.equal(cleared.body.configured, false);
    assert.match(cleared.body.reason, /Home Assistant/);

    await setSetting('WEATHER_PROVIDER', 'openweathermap');
});
