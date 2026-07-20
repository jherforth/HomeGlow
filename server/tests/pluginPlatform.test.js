const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `plugin-platform-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 5900 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

const PLUGIN_ID = 'clam-buckets-test';

function widgetHtml(manifest) {
    const manifestBlock = manifest
        ? `<script type="application/json" id="homeglow-manifest">${JSON.stringify(manifest)}</script>`
        : '';
    return `<html><head><title>t</title>${manifestBlock}</head><body>manifest plugin</body></html>`;
}

const validManifest = {
    manifestVersion: 1,
    id: PLUGIN_ID,
    name: 'Clam Buckets (test)',
    apiVersion: 'v1',
    storage: true,
    settings: [
        { key: 'siphonAmount', label: 'Siphon', type: 'number', default: 2, scope: 'household' },
    ],
};

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
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && typeof options.body === 'string' && !headers['Content-Type']) {
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
    return { status: response.status, body, headers: response.headers };
}

async function uploadWidget(filename, html) {
    const form = new FormData();
    form.append('file', new Blob([html], { type: 'text/html' }), filename);
    return api('/api/widgets/upload', { method: 'POST', body: form });
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
        console.log(`[test-debug] Preserving plugin platform test DB artifacts: ${testDbPath}`);
    }
});

// --- Manifest handling ---

test('uploading a widget with a valid embedded manifest registers its pluginId', async () => {
    const upload = await uploadWidget('manifest-widget.html', widgetHtml(validManifest));
    assert.equal(upload.status, 200);
    assert.equal(upload.body.pluginId, PLUGIN_ID);

    const list = await api('/api/widgets');
    const entry = list.body.find((widget) => widget.filename === 'manifest-widget.html');
    assert.ok(entry);
    assert.equal(entry.pluginId, PLUGIN_ID);
    // Manifest name wins over the filename-derived fallback.
    assert.equal(entry.name, 'Clam Buckets (test)');
});

test('served manifest plugin HTML gets its identity injected at the start of head', async () => {
    const served = await api('/widgets/manifest-widget.html?theme=dark');
    assert.equal(served.status, 200);
    assert.ok(served.body.includes(`window.__HOMEGLOW_PLUGIN__={id:"${PLUGIN_ID}",apiVersion:"v1"}`));
    // The identity script must run before any plugin script in <head> — an SDK
    // <script src> placed early in head would otherwise see no identity.
    assert.ok(
        served.body.indexOf('__HOMEGLOW_PLUGIN__') < served.body.indexOf('homeglow-manifest'),
        'identity injection must precede in-head plugin content'
    );
});

test('widget serving rejects traversal-shaped filenames', async () => {
    const encoded = await api('/widgets/..%2f..%2fpackage.json');
    assert.equal(encoded.status, 404);
    const dotted = await api('/widgets/..%5c..%5cpackage.json');
    assert.equal(dotted.status, 404);
});

test('legacy widgets (no manifest) are served without identity injection', async () => {
    await uploadWidget('plain-widget.html', widgetHtml(null));
    const served = await api('/widgets/plain-widget.html');
    assert.equal(served.status, 200);
    assert.equal(served.body.includes('__HOMEGLOW_PLUGIN__'), false);
});

test('invalid manifests reject the upload with a clear error', async () => {
    const bad = { ...validManifest, id: 'Bad Slug!', manifestVersion: 2 };
    const upload = await uploadWidget('bad-manifest.html', widgetHtml(bad));
    assert.equal(upload.status, 400);
    assert.match(upload.body.error, /manifestVersion must be 1/);
    assert.match(upload.body.error, /lowercase slug/);

    const list = await api('/api/widgets');
    assert.equal(list.body.some((widget) => widget.filename === 'bad-manifest.html'), false);
});

test('a second widget cannot claim an existing pluginId', async () => {
    const upload = await uploadWidget('impostor.html', widgetHtml(validManifest));
    assert.equal(upload.status, 409);
    assert.match(upload.body.error, new RegExp(PLUGIN_ID));
});

// --- Storage API ---

test('storage CRUD round-trip', async () => {
    const put = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/buckets:user:3`, {
        method: 'PUT',
        body: JSON.stringify({ spend: 10, save: 5, give: 0 }),
    });
    assert.equal(put.status, 200);

    const get = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/buckets:user:3`);
    assert.equal(get.status, 200);
    assert.deepEqual(get.body, { spend: 10, save: 5, give: 0 });

    await api(`/api/plugin/v1/storage/${PLUGIN_ID}/other-key`, {
        method: 'PUT',
        body: JSON.stringify('just a string'),
    });

    const list = await api(`/api/plugin/v1/storage/${PLUGIN_ID}`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body['buckets:user:3'], { spend: 10, save: 5, give: 0 });
    assert.equal(list.body['other-key'], 'just a string');

    const del = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/other-key`, { method: 'DELETE' });
    assert.equal(del.status, 200);

    const getMissing = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/other-key`);
    assert.equal(getMissing.status, 404);

    const delMissing = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/other-key`, { method: 'DELETE' });
    assert.equal(delMissing.status, 404);
});

test('storage is namespace-guarded', async () => {
    // Unknown plugin id.
    const unknown = await api('/api/plugin/v1/storage/no-such-plugin');
    assert.equal(unknown.status, 403);

    // Manifest plugin that did NOT declare storage.
    const noStorage = { manifestVersion: 1, id: 'no-storage-plugin', storage: false };
    await uploadWidget('no-storage.html', widgetHtml(noStorage));
    const blocked = await api('/api/plugin/v1/storage/no-storage-plugin/x', {
        method: 'PUT',
        body: JSON.stringify(1),
    });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /does not declare storage/);
});

test('storage rejects invalid keys and oversized values', async () => {
    const badKey = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/bad%20key%2Fslash`, {
        method: 'PUT',
        body: JSON.stringify(1),
    });
    assert.equal(badKey.status, 400);

    const big = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/too-big`, {
        method: 'PUT',
        body: JSON.stringify('x'.repeat(65 * 1024)),
    });
    assert.equal(big.status, 413);
});

// --- Atomic increment (the siphon primitive) ---

test('increment creates the document and accumulates atomically', async () => {
    const first = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/give-pool/increment`, {
        method: 'POST',
        body: JSON.stringify({ path: 'total', delta: 2 }),
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.result, 2);

    // Simulated repeated withdrawals, fired concurrently.
    const bursts = await Promise.all(Array.from({ length: 5 }, () =>
        api(`/api/plugin/v1/storage/${PLUGIN_ID}/give-pool/increment`, {
            method: 'POST',
            body: JSON.stringify({ path: 'total', delta: 2 }),
        })
    ));
    bursts.forEach((res) => assert.equal(res.status, 200));

    const doc = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/give-pool`);
    assert.equal(doc.body.total, 12);

    // Nested paths are created on demand.
    const nested = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/give-pool/increment`, {
        method: 'POST',
        body: JSON.stringify({ path: 'perKid.3', delta: 1 }),
    });
    assert.equal(nested.status, 200);
    assert.equal(nested.body.value.perKid['3'], 1);
});

test('increment rejects bad input and non-numeric targets', async () => {
    const noPath = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/give-pool/increment`, {
        method: 'POST',
        body: JSON.stringify({ delta: 1 }),
    });
    assert.equal(noPath.status, 400);

    const badDelta = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/give-pool/increment`, {
        method: 'POST',
        body: JSON.stringify({ path: 'total', delta: 'lots' }),
    });
    assert.equal(badDelta.status, 400);

    await api(`/api/plugin/v1/storage/${PLUGIN_ID}/labels`, {
        method: 'PUT',
        body: JSON.stringify({ title: 'not a number' }),
    });
    const nonNumeric = await api(`/api/plugin/v1/storage/${PLUGIN_ID}/labels/increment`, {
        method: 'POST',
        body: JSON.stringify({ path: 'title', delta: 1 }),
    });
    assert.equal(nonNumeric.status, 409);
});

// --- Declared settings (Phase 2) ---

const SETTINGS_PLUGIN_ID = 'settings-test-plugin';
const settingsManifest = {
    manifestVersion: 1,
    id: SETTINGS_PLUGIN_ID,
    apiVersion: 'v1',
    settings: [
        { key: 'siphonAmount', label: 'Siphon', type: 'number', default: 2, min: 0, max: 10 },
        { key: 'greeting', label: 'Greeting', type: 'string', default: 'hi' },
        { key: 'mode', label: 'Mode', type: 'select', options: ['spend', 'save', 'give'], default: 'save' },
        { key: 'compact', label: 'Compact view', type: 'boolean', default: false, scope: 'device' },
    ],
};

test('declared settings resolve to manifest defaults before any write', async () => {
    const upload = await uploadWidget('settings-plugin.html', widgetHtml(settingsManifest));
    assert.equal(upload.status, 200);

    const { status, body } = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`);
    assert.equal(status, 200);
    assert.deepEqual(body, { siphonAmount: 2, greeting: 'hi', mode: 'save', compact: false });
});

test('household settings persist and are shared across devices', async () => {
    const put = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ siphonAmount: 3, mode: 'give' }),
    });
    assert.equal(put.status, 200);

    // Visible with or without a device context — household values are global.
    const plain = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`);
    assert.equal(plain.body.siphonAmount, 3);
    assert.equal(plain.body.mode, 'give');

    const withDevice = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}?device=kiosk-a`);
    assert.equal(withDevice.body.siphonAmount, 3);
});

test('device-scoped settings require a device and stay per-device', async () => {
    const noDevice = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ compact: true }),
    });
    assert.equal(noDevice.status, 400);
    assert.match(noDevice.body.error, /device/);

    const put = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}?device=kiosk-a`, {
        method: 'PUT',
        body: JSON.stringify({ compact: true }),
    });
    assert.equal(put.status, 200);

    const deviceA = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}?device=kiosk-a`);
    assert.equal(deviceA.body.compact, true);

    // Another device (and no-device) still sees the manifest default.
    const deviceB = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}?device=kiosk-b`);
    assert.equal(deviceB.body.compact, false);
    const plain = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`);
    assert.equal(plain.body.compact, false);
});

test('setting writes are validated against the manifest schema', async () => {
    const unknown = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ nope: 1 }),
    });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.error, /not declared/);

    const wrongType = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ siphonAmount: 'two' }),
    });
    assert.equal(wrongType.status, 400);

    const belowMin = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ siphonAmount: -1 }),
    });
    assert.equal(belowMin.status, 400);
    assert.match(belowMin.body.error, />= 0/);

    const badOption = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ mode: 'hoard' }),
    });
    assert.equal(badOption.status, 400);
    assert.match(badOption.body.error, /one of/);

    // Nothing partial was applied.
    const { body } = await api(`/api/plugin/v1/settings/${SETTINGS_PLUGIN_ID}`);
    assert.equal(body.siphonAmount, 3);
});

test('settings endpoints reject unknown plugins and bad manifests reject select without options', async () => {
    const unknown = await api('/api/plugin/v1/settings/no-such-plugin');
    assert.equal(unknown.status, 403);

    const badSelect = {
        manifestVersion: 1,
        id: 'bad-select-plugin',
        settings: [{ key: 'mode', label: 'Mode', type: 'select' }],
    };
    const upload = await uploadWidget('bad-select.html', widgetHtml(badSelect));
    assert.equal(upload.status, 400);
    assert.match(upload.body.error, /options must be a non-empty array/);
});

// --- Event stream (Phase 3) ---

// Opens the SSE stream and collects parsed `data:` messages.
async function openEventStream() {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/plugin/v1/events/stream`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    // reply.hijack() bypasses @fastify/cors — the route must set this itself
    // or cross-origin EventSources (dev mode) are blocked.
    assert.equal(response.headers.get('access-control-allow-origin'), '*');

    const messages = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    (async () => {
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop();
                for (const part of parts) {
                    const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
                    if (dataLine) {
                        messages.push(JSON.parse(dataLine.slice('data: '.length)));
                    }
                }
            }
        } catch {
            // Aborted — expected on close.
        }
    })();

    return {
        messages,
        close: () => controller.abort(),
        async waitFor(predicate, timeoutMs = 5000) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                const match = messages.find(predicate);
                if (match) return match;
                await delay(50);
            }
            throw new Error(`Timed out waiting for event. Received: ${JSON.stringify(messages)}`);
        },
    };
}

test('clam and chore mutations are delivered over the event stream', async () => {
    const stream = await openEventStream();
    try {
        // A user to act on.
        const user = await api('/api/users', {
            method: 'POST',
            body: JSON.stringify({ username: `event-kid-${process.pid}`, email: 'kid@example.com' }),
        });
        const userId = user.body.id;

        // Deposit.
        await api(`/api/users/${userId}/clams/add`, {
            method: 'POST',
            body: JSON.stringify({ amount: 10 }),
        });
        const deposited = await stream.waitFor((m) => m.event === 'clam.deposited');
        assert.equal(deposited.payload.userId, userId);
        assert.equal(deposited.payload.amount, 10);
        assert.equal(deposited.payload.newTotal, 10);
        assert.equal(typeof deposited.emittedAt, 'string');

        // Withdrawal (the siphon trigger).
        await api(`/api/users/${userId}/clams/reduce`, {
            method: 'POST',
            body: JSON.stringify({ amount: 4 }),
        });
        const withdrawn = await stream.waitFor((m) => m.event === 'clam.withdrawn');
        assert.equal(withdrawn.payload.userId, userId);
        assert.equal(withdrawn.payload.amount, 4);
        assert.equal(withdrawn.payload.newTotal, 6);

        // Chore completion.
        const chore = await api('/api/chores', {
            method: 'POST',
            body: JSON.stringify({ title: 'Feed the fish', clam_value: 3 }),
        });
        const schedule = await api('/api/chore-schedules', {
            method: 'POST',
            body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, duration: 'day-of' }),
        });
        await api('/api/chores/complete', {
            method: 'POST',
            body: JSON.stringify({ chore_schedule_id: schedule.body.id, user_id: userId, date: '2026-07-20' }),
        });
        const completed = await stream.waitFor((m) => m.event === 'chore.completed');
        assert.equal(completed.payload.userId, userId);
        assert.equal(completed.payload.choreId, chore.body.id);
        assert.equal(completed.payload.scheduleId, schedule.body.id);
        assert.equal(completed.payload.clamValue, 3);

        // Uncompleting emits the mirror event so plugins can compensate.
        await api('/api/chores/uncomplete', {
            method: 'POST',
            body: JSON.stringify({ chore_schedule_id: schedule.body.id, user_id: userId, date: '2026-07-20' }),
        });
        const uncompleted = await stream.waitFor((m) => m.event === 'chore.uncompleted');
        assert.equal(uncompleted.payload.userId, userId);
        assert.equal(uncompleted.payload.choreId, chore.body.id);
        assert.equal(uncompleted.payload.scheduleId, schedule.body.id);
        assert.equal(uncompleted.payload.clamValue, 3);
    } finally {
        stream.close();
    }
});

test('manifests may only declare catalog events', async () => {
    const badEvents = {
        manifestVersion: 1,
        id: 'bad-events-plugin',
        events: ['clam.withdrawn', 'weather.changed'],
    };
    const upload = await uploadWidget('bad-events.html', widgetHtml(badEvents));
    assert.equal(upload.status, 400);
    assert.match(upload.body.error, /weather\.changed.*not a known event/);

    const goodEvents = {
        manifestVersion: 1,
        id: 'good-events-plugin',
        events: ['clam.withdrawn', 'clam.deposited', 'chore.completed'],
    };
    const ok = await uploadWidget('good-events.html', widgetHtml(goodEvents));
    assert.equal(ok.status, 200);
});

// --- Declarative reactions (Phase 4) ---

const SIPHON_PLUGIN_ID = 'siphon-test-plugin';
const siphonManifest = {
    manifestVersion: 1,
    id: SIPHON_PLUGIN_ID,
    storage: true,
    settings: [
        { key: 'siphonAmount', label: 'Siphon', type: 'number', default: 2, min: 0 },
    ],
    reactions: [
        // The clam-buckets reference: siphon a configurable amount into the
        // give pool on every withdrawal.
        { on: 'clam.withdrawn', action: 'increment', key: 'bank', path: 'give.total', delta: { setting: 'siphonAmount' } },
        // Payload-driven delta: tally every deposited clam.
        { on: 'clam.deposited', action: 'increment', key: 'bank', path: 'deposits', delta: { payload: 'amount' } },
    ],
};

test('declared reactions run server-side with no iframe involved (the siphon)', async () => {
    const upload = await uploadWidget('siphon-plugin.html', widgetHtml(siphonManifest));
    assert.equal(upload.status, 200);

    const user = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: `siphon-kid-${process.pid}`, email: 'siphon@example.com' }),
    });
    const userId = user.body.id;

    // Deposit 20 → payload-driven reaction tallies it.
    await api(`/api/users/${userId}/clams/add`, {
        method: 'POST',
        body: JSON.stringify({ amount: 20 }),
    });

    // Withdraw 5 → siphon reaction adds the default siphonAmount (2).
    const withdraw = await api(`/api/users/${userId}/clams/reduce`, {
        method: 'POST',
        body: JSON.stringify({ amount: 5 }),
    });
    assert.equal(withdraw.status, 200);

    const bank = await api(`/api/plugin/v1/storage/${SIPHON_PLUGIN_ID}/bank`);
    assert.equal(bank.status, 200);
    assert.equal(bank.body.deposits, 20);
    assert.equal(bank.body.give.total, 2);
});

test('reaction deltas follow the live household setting value', async () => {
    // Family raises the siphon to 5 in the Admin Panel.
    const put = await api(`/api/plugin/v1/settings/${SIPHON_PLUGIN_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ siphonAmount: 5 }),
    });
    assert.equal(put.status, 200);

    const user = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: `siphon-kid2-${process.pid}`, email: 'siphon2@example.com' }),
    });
    const userId = user.body.id;
    await api(`/api/users/${userId}/clams/add`, {
        method: 'POST',
        body: JSON.stringify({ amount: 10 }),
    });
    await api(`/api/users/${userId}/clams/reduce`, {
        method: 'POST',
        body: JSON.stringify({ amount: 3 }),
    });

    const bank = await api(`/api/plugin/v1/storage/${SIPHON_PLUGIN_ID}/bank`);
    // give.total: 2 (previous test) + 5 (new siphon) = 7.
    assert.equal(bank.body.give.total, 7);
    // deposits: 20 + 10.
    assert.equal(bank.body.deposits, 30);
});

test('reaction declarations are validated at install time', async () => {
    // Reactions without storage.
    const noStorage = {
        manifestVersion: 1,
        id: 'reaction-no-storage',
        reactions: [{ on: 'clam.withdrawn', action: 'increment', key: 'k', path: 'p', delta: 1 }],
    };
    const upload1 = await uploadWidget('reaction-no-storage.html', widgetHtml(noStorage));
    assert.equal(upload1.status, 400);
    assert.match(upload1.body.error, /require "storage": true/);

    // Unsupported action + unknown event + bad delta reference.
    const badReaction = {
        manifestVersion: 1,
        id: 'reaction-bad',
        storage: true,
        settings: [{ key: 'perDevice', label: 'x', type: 'number', default: 1, scope: 'device' }],
        reactions: [
            { on: 'weather.changed', action: 'decrement', key: 'k', path: 'p', delta: { setting: 'perDevice' } },
        ],
    };
    const upload2 = await uploadWidget('reaction-bad.html', widgetHtml(badReaction));
    assert.equal(upload2.status, 400);
    assert.match(upload2.body.error, /must be a known event/);
    assert.match(upload2.body.error, /action must be 'increment'/);
    assert.match(upload2.body.error, /household number setting/);

    // Non-numeric factor.
    const badFactor = {
        manifestVersion: 1,
        id: 'reaction-bad-factor',
        storage: true,
        reactions: [{ on: 'clam.withdrawn', action: 'increment', key: 'k', path: 'p', delta: 1, factor: 'minus one' }],
    };
    const upload3 = await uploadWidget('reaction-bad-factor.html', widgetHtml(badFactor));
    assert.equal(upload3.status, 400);
    assert.match(upload3.body.error, /factor must be a finite number/);
});

test('a factor:-1 mirror reaction compensates uncomplete, so re-completing does not double-count', async () => {
    const tallyManifest = {
        manifestVersion: 1,
        id: 'tally-test-plugin',
        storage: true,
        reactions: [
            { on: 'chore.completed', action: 'increment', key: 'bank', path: 'tally', delta: { payload: 'clamValue' } },
            { on: 'chore.uncompleted', action: 'increment', key: 'bank', path: 'tally', delta: { payload: 'clamValue' }, factor: -1 },
        ],
    };
    const upload = await uploadWidget('tally-plugin.html', widgetHtml(tallyManifest));
    assert.equal(upload.status, 200);

    const user = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: `tally-kid-${process.pid}`, email: 'tally@example.com' }),
    });
    const userId = user.body.id;
    const chore = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Water plants', clam_value: 4 }),
    });
    const schedule = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, duration: 'day-of' }),
    });
    const completeBody = { chore_schedule_id: schedule.body.id, user_id: userId, date: '2026-07-19' };

    await api('/api/chores/complete', { method: 'POST', body: JSON.stringify(completeBody) });
    let bank = await api('/api/plugin/v1/storage/tally-test-plugin/bank');
    assert.equal(bank.body.tally, 4);

    // Uncomplete compensates via the mirror reaction (factor -1)...
    await api('/api/chores/uncomplete', { method: 'POST', body: JSON.stringify(completeBody) });
    bank = await api('/api/plugin/v1/storage/tally-test-plugin/bank');
    assert.equal(bank.body.tally, 0);

    // ...so re-completing yields exactly one net completion.
    await api('/api/chores/complete', { method: 'POST', body: JSON.stringify(completeBody) });
    bank = await api('/api/plugin/v1/storage/tally-test-plugin/bank');
    assert.equal(bank.body.tally, 4);
});

test('DELETE with purgeData wipes the plugin\'s storage and settings', async () => {
    const purgeManifest = {
        manifestVersion: 1,
        id: 'purge-test-plugin',
        storage: true,
        settings: [{ key: 'threshold', label: 'Threshold', type: 'number', default: 1 }],
    };
    await uploadWidget('purge-plugin.html', widgetHtml(purgeManifest));
    await api('/api/plugin/v1/storage/purge-test-plugin/state', {
        method: 'PUT',
        body: JSON.stringify({ total: 42 }),
    });
    await api('/api/plugin/v1/settings/purge-test-plugin', {
        method: 'PUT',
        body: JSON.stringify({ threshold: 9 }),
    });

    const del = await api('/api/widgets/purge-plugin.html?purgeData=true', { method: 'DELETE' });
    assert.equal(del.status, 200);

    // Reinstalling the same id starts from a clean slate.
    await uploadWidget('purge-plugin.html', widgetHtml(purgeManifest));
    const storage = await api('/api/plugin/v1/storage/purge-test-plugin');
    assert.deepEqual(storage.body, {});
    const settings = await api('/api/plugin/v1/settings/purge-test-plugin');
    assert.equal(settings.body.threshold, 1);
});

// --- SDK ---

test('the plugin SDK is served as JavaScript', async () => {
    const sdk = await api('/plugin-sdk/v1.js');
    assert.equal(sdk.status, 200);
    assert.match(sdk.headers.get('content-type'), /javascript/);
    assert.ok(sdk.body.includes('window.HomeGlow'));
    assert.ok(sdk.body.includes('/api/plugin/v1'));
});
