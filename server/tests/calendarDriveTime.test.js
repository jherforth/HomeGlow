// Drive-time endpoint for the Agenda widget's travel chip.
//
// GET /api/calendar/drive-time?location=<address> answers { minutes } — the
// free-flow drive from the household location already stored for auto dark
// mode — or { minutes: null } when there is no home, the location does not
// resolve, or OSRM has no route. The widget shows nothing in the null case,
// so a null is a normal answer, not an error.
//
// The Open-Meteo geocoder base is pointed at a local fake via
// OPENMETEO_GEO_BASE (see openmeteo.js) and the OSRM router via OSRM_BASE
// (see driveTime.js), so the suite runs offline and in CI — no live API
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
const testDbPath = path.join(tmpDir, `calendar-drive-time-${process.pid}-${Date.now()}.db`);
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
let fakeOsrm;
let fakeOsrmUrl;
let geocodeHits = 0;
let osrmHits = 0;
let lastOsrmPath = '';

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

const setHome = (lat, lon) => setSetting('appearance', JSON.stringify({
    autoDark: { lat, lon, locationQuery: 'Magnolia, Seattle, WA', resolvedName: 'Magnolia' },
}));

test.before(async () => {
    await usePort();
    fs.mkdirSync(tmpDir, { recursive: true });

    // Stand-in Open-Meteo geocoder. Answers the same shape as the live
    // /v1/search endpoint: one best result, or none for an unknown place.
    fakeGeocoder = http.createServer((req, res) => {
        geocodeHits += 1;
        res.setHeader('Content-Type', 'application/json');
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/v1/search') {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: true, reason: 'not found' }));
        }
        if (url.searchParams.get('name') === '3333 Chili Avenue, Rochester, NY') {
            return res.end(JSON.stringify({
                results: [{ latitude: 43.1005, longitude: -77.7029, name: 'Chili' }],
            }));
        }
        if (url.searchParams.get('name') === 'NoRoute Town') {
            return res.end(JSON.stringify({
                results: [{ latitude: 10, longitude: 10, name: 'NoRoute Town' }],
            }));
        }
        return res.end(JSON.stringify({ results: [] }));
    });
    await new Promise((resolve) => fakeGeocoder.listen(0, '127.0.0.1', resolve));
    fakeGeocoderUrl = `http://127.0.0.1:${fakeGeocoder.address().port}/v1/search`;

    // Stand-in OSRM demo server. Answers the same shape as the live
    // /route/v1/driving endpoint: an 8-minute route, or NoRoute for the
    // sentinel destination.
    fakeOsrm = http.createServer((req, res) => {
        osrmHits += 1;
        lastOsrmPath = req.url;
        res.setHeader('Content-Type', 'application/json');
        const url = new URL(req.url, 'http://127.0.0.1');
        if (!url.pathname.startsWith('/route/v1/driving/')) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
        }
        if (url.pathname.endsWith(';10,10')) {
            return res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
        }
        return res.end(JSON.stringify({
            code: 'Ok',
            routes: [{ duration: 480, distance: 5200 }],
        }));
    });
    await new Promise((resolve) => fakeOsrm.listen(0, '127.0.0.1', resolve));
    fakeOsrmUrl = `http://127.0.0.1:${fakeOsrm.address().port}/route/v1/driving`;

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
            OSRM_BASE: fakeOsrmUrl,
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
    if (fakeOsrm) {
        await new Promise((resolve) => fakeOsrm.close(resolve));
    }
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

// Runs first, while the test DB is a new install: no home is stored, so
// there is nothing to drive from — and the geocoder is never asked.
test('no home stored means no drive time', async () => {
    const result = await api('/api/calendar/drive-time?location=' + encodeURIComponent('1 Main St, Seattle, WA'));
    assert.equal(result.status, 200);
    assert.equal(result.body.minutes, null);
    assert.equal(geocodeHits, 0);
    assert.equal(osrmHits, 0);
});

test('resolves a drive time from the stored home', async () => {
    await setHome(47.6488, -122.3964);

    const result = await api('/api/calendar/drive-time?location=' + encodeURIComponent('3333 Chili Avenue, Rochester, NY'));
    assert.equal(result.status, 200);
    assert.equal(result.body.minutes, 8);
    // The route runs from the stored home to the geocoded destination.
    assert.match(lastOsrmPath, /-122\.3964,47\.6488;-77\.7029,43\.1005/);
    assert.equal(geocodeHits, 1);
    assert.equal(osrmHits, 1);
});

test('repeats the cached answer without new upstream calls', async () => {
    const result = await api('/api/calendar/drive-time?location=' + encodeURIComponent('3333 Chili Avenue, Rochester, NY'));
    assert.equal(result.status, 200);
    assert.equal(result.body.minutes, 8);
    assert.equal(geocodeHits, 1);
    assert.equal(osrmHits, 1);
});

test('an unresolvable location has no drive time', async () => {
    const result = await api('/api/calendar/drive-time?location=' + encodeURIComponent('Nowhere'));
    assert.equal(result.status, 200);
    assert.equal(result.body.minutes, null);
    assert.equal(geocodeHits, 2);
    assert.equal(osrmHits, 1);
});

test('a location is required', async () => {
    const result = await api('/api/calendar/drive-time');
    assert.equal(result.status, 400);
    assert.match(result.body.error, /location/i);
});

test('no route means no drive time', async () => {
    const result = await api('/api/calendar/drive-time?location=' + encodeURIComponent('NoRoute Town'));
    assert.equal(result.status, 200);
    assert.equal(result.body.minutes, null);
    assert.equal(osrmHits, 2);
});
