// Geocode route on the Open-Meteo provider (PR #389 review).
//
// With no OpenWeatherMap key stored, a household on Open-Meteo must still be
// able to set a location — in the weather widget's settings dialog and in
// Admin → Look → Appearance, both of which save through GET
// /api/weather/geocode. The route resolves the query with Open-Meteo's own
// keyless geocoder instead of demanding the key.
//
// The Open-Meteo base URL is pointed at a local fake via OPENMETEO_GEO_BASE
// (see openmeteo.js) so the suite runs offline and in CI — no live API
// involved. The server is spawned like homeAssistant.test.js does it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `weather-geocode-openmeteo-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let port;
let baseUrl;

async function usePort() {
    port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
}

let serverProcess;
let serverLogs = '';
let fakeGeocoder;
let fakeGeocoderUrl;

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
    await usePort();
    fs.mkdirSync(tmpDir, { recursive: true });

    // Stand-in Open-Meteo geocoder. Answers the same shape as the live
    // /v1/search endpoint: one best result, or none for an unknown place.
    fakeGeocoder = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/v1/search') {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: true, reason: 'not found' }));
        }
        if (url.searchParams.get('name') === 'Seattle') {
            return res.end(JSON.stringify({
                results: [{ latitude: 47.6062, longitude: -122.3321, name: 'Seattle' }],
            }));
        }
        return res.end(JSON.stringify({ results: [] }));
    });
    await new Promise((resolve) => fakeGeocoder.listen(0, '127.0.0.1', resolve));
    fakeGeocoderUrl = `http://127.0.0.1:${fakeGeocoder.address().port}/v1/search`;

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
            OPENMETEO_GEO_BASE: fakeGeocoderUrl,
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
    if (fakeGeocoder) {
        await new Promise((resolve) => fakeGeocoder.close(resolve));
    }
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

test('geocode resolves a place through Open-Meteo with no API key stored', async () => {
    await setSetting('WEATHER_PROVIDER', 'openmeteo');

    // No WEATHER_API_KEY is ever stored in this test DB: the point is that
    // the keyless provider must not need one.
    const result = await api('/api/weather/geocode?q=Seattle');
    assert.equal(result.status, 200);
    assert.equal(Math.round(result.body.lat * 100) / 100, 47.61);
    assert.equal(Math.round(result.body.lon * 100) / 100, -122.33);
    assert.equal(result.body.resolvedName, 'Seattle');
});

test('geocode reports an unresolvable place as 404 on Open-Meteo', async () => {
    await setSetting('WEATHER_PROVIDER', 'openmeteo');

    const result = await api('/api/weather/geocode?q=Nowhere');
    assert.equal(result.status, 404);
    assert.match(result.body.error, /not found/i);
});

test('geocode still needs an OpenWeatherMap key when that is the provider', async () => {
    await setSetting('WEATHER_PROVIDER', 'openweathermap');

    const result = await api('/api/weather/geocode?q=Seattle');
    assert.equal(result.status, 400);
    assert.match(result.body.error, /API key/);

    await setSetting('WEATHER_PROVIDER', 'openmeteo');
});
