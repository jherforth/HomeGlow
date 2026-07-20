const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const widgetsDir = path.join(serverDir, 'widgets');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `plugin-store-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 5600 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

// A widget dropped on disk before first boot, to exercise the one-time
// migration import. Unique name so parallel/failed runs never collide.
const legacyFilename = `legacy-import-${process.pid}.html`;
const legacyPath = path.join(widgetsDir, legacyFilename);
const legacyHtml = '<html><head><title>Legacy</title></head><body>legacy widget</body></html>';

const uploadedFilename = 'plugin-store-test-widget.html';
const uploadedHtml = '<html><head><title>Uploaded</title></head><body>uploaded widget</body></html>';

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

function startServer() {
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

async function api(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status: response.status, body, headers: response.headers };
}

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(widgetsDir, { recursive: true });
    fs.writeFileSync(legacyPath, legacyHtml, 'utf-8');

    await startServer();
});

test.after(async () => {
    await stopServer();

    if (fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath);
    }

    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    } else {
        console.log(`[test-debug] Preserving plugin store test DB artifacts: ${testDbPath}`);
    }
});

test('migration imports pre-existing on-disk widgets into the plugin store', async () => {
    const { status, body } = await api('/api/widgets');

    assert.equal(status, 200);
    const imported = body.find((widget) => widget.filename === legacyFilename);
    assert.ok(imported, `expected ${legacyFilename} in ${JSON.stringify(body)}`);
    assert.equal(imported.name, legacyFilename.replace('.html', ''));
});

test('POST /api/widgets/upload stores a widget in the DB and serves it', async () => {
    const form = new FormData();
    form.append('file', new Blob([uploadedHtml], { type: 'text/html' }), uploadedFilename);

    const upload = await api('/api/widgets/upload', { method: 'POST', body: form });
    assert.equal(upload.status, 200);
    assert.equal(upload.body.success, true);
    assert.equal(upload.body.widget, uploadedFilename);

    // Never written to disk — the DB is the store.
    assert.equal(fs.existsSync(path.join(widgetsDir, uploadedFilename)), false);

    const list = await api('/api/widgets');
    assert.ok(list.body.some((widget) => widget.filename === uploadedFilename));

    const served = await api(`/widgets/${uploadedFilename}?theme=dark`);
    assert.equal(served.status, 200);
    assert.match(served.headers.get('content-type'), /text\/html/);
    assert.ok(served.body.includes('uploaded widget'));
    // The overflow fix is injected into every served widget.
    assert.ok(served.body.includes('overflow-x:hidden'));
});

test('upload rejects non-HTML files', async () => {
    const form = new FormData();
    form.append('file', new Blob(['not html'], { type: 'text/plain' }), 'evil.txt');

    const { status, body } = await api('/api/widgets/upload', { method: 'POST', body: form });
    assert.equal(status, 400);
    assert.match(body.error, /Only HTML/);
});

test('plugins survive a restart with the widgets directory wiped (upgrade simulation)', async () => {
    await stopServer();

    // Simulate an image upgrade: the container's /app/widgets is replaced by a
    // fresh (empty) copy, but tasks.db is bind-mounted and persists.
    fs.unlinkSync(legacyPath);

    await startServer();

    const list = await api('/api/widgets');
    assert.equal(list.status, 200);
    assert.ok(list.body.some((widget) => widget.filename === legacyFilename), 'legacy import survived');
    assert.ok(list.body.some((widget) => widget.filename === uploadedFilename), 'uploaded widget survived');

    const servedLegacy = await api(`/widgets/${legacyFilename}`);
    assert.equal(servedLegacy.status, 200);
    assert.ok(servedLegacy.body.includes('legacy widget'));

    const servedUpload = await api(`/widgets/${uploadedFilename}`);
    assert.equal(servedUpload.status, 200);
    assert.ok(servedUpload.body.includes('uploaded widget'));
});

test('DELETE /api/widgets/:filename removes the plugin', async () => {
    const del = await api(`/api/widgets/${uploadedFilename}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    assert.equal(del.body.success, true);

    const list = await api('/api/widgets');
    assert.equal(list.body.some((widget) => widget.filename === uploadedFilename), false);

    const served = await api(`/widgets/${uploadedFilename}`);
    assert.equal(served.status, 404);

    const delMissing = await api(`/api/widgets/${uploadedFilename}`, { method: 'DELETE' });
    assert.equal(delMissing.status, 404);
});

test('GET /api/widgets/debug reports the DB-backed store', async () => {
    const { status, body } = await api('/api/widgets/debug');

    assert.equal(status, 200);
    assert.ok(Array.isArray(body.plugins));
    const legacy = body.plugins.find((plugin) => plugin.filename === legacyFilename);
    assert.ok(legacy);
    assert.equal(legacy.content_length, legacyHtml.length);
});
