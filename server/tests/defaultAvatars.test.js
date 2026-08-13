// Default avatar bank (issue #132): bundled SVGs seeded into uploads/users/
// defaults/, listed via /api/avatars/defaults, selected via /api/users/:id/avatar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `avatars-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 7200 + Math.floor(Math.random() * 300);
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

let userId;

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
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    await waitForServerReady();

    userId = (await api('/api/users', { method: 'POST', body: JSON.stringify({ username: 'avatar-kid', email: 'a@example.com' }) })).body.id;
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

test('default avatars are seeded and listed people-first', async () => {
    const res = await api('/api/avatars/defaults');
    assert.equal(res.status, 200);
    const filenames = res.body.map((a) => a.filename);

    // Full people set: 4 roles x 5 skin tones.
    for (const role of ['mom', 'dad', 'girl', 'boy']) {
        for (let tone = 1; tone <= 5; tone++) {
            assert.ok(filenames.includes(`defaults/${role}-${tone}.svg`), `${role}-${tone} present`);
        }
    }
    // The fun bank.
    for (const fun of ['cat', 'dog', 'fish', 'alpaca', 'chicken', 'dino', 'robot', 'unicorn', 'frog']) {
        assert.ok(filenames.includes(`defaults/${fun}.svg`), `${fun} present`);
    }
    assert.equal(res.body.length, 29);

    // Curated order: all people before the first fun avatar.
    const firstFun = filenames.indexOf('defaults/cat.svg');
    assert.ok(filenames.slice(0, firstFun).every((f) => /(mom|dad|girl|boy)-\d\.svg$/.test(f)), 'people listed first');

    // Display names are humanized.
    assert.equal(res.body.find((a) => a.filename === 'defaults/mom-3.svg').name, 'Mom');
    assert.equal(res.body.find((a) => a.filename === 'defaults/dino.svg').name, 'Dino');
});

test('seeded avatars are served from the uploads static root', async () => {
    const response = await fetch(`${baseUrl}/Uploads/users/defaults/cat.svg`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/);
    assert.match(await response.text(), /<svg/);

    // The day-long cache comes solely from the registration's maxAge (#136
    // removed the setHeaders callback that only re-set the same value).
    // Assert the exact string: losing maxAge degrades this to max-age=0
    // silently rather than erroring, so this line is what pins the policy.
    // An exact match also proves nothing sets the header twice, since fetch
    // joins repeated headers with ", ".
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
});

test('both upload static roots share one cache policy', async () => {
    // /Uploads/ and the nested /Uploads/users/ are separate registrations that
    // used to carry a header callback each — easy to let drift apart. A sound
    // exercises the outer root; an avatar exercises the nested one.
    for (const url of [
        `${baseUrl}/Uploads/sounds/chime.wav`,
        `${baseUrl}/Uploads/users/defaults/robot.svg`,
    ]) {
        const response = await fetch(url);
        assert.equal(response.status, 200, `${url} served`);
        assert.equal(response.headers.get('cache-control'), 'public, max-age=86400', `${url} cache policy`);
    }
});

test('selecting a default avatar sets profile_picture; bad input is rejected', async () => {
    const ok = await api(`/api/users/${userId}/avatar`, { method: 'POST', body: JSON.stringify({ filename: 'defaults/frog.svg' }) });
    assert.equal(ok.status, 200);
    const user = (await api('/api/users')).body.find((u) => u.id === userId);
    assert.equal(user.profile_picture, 'defaults/frog.svg');

    // Not in the defaults namespace / traversal-shaped / unknown file / unknown user.
    assert.equal((await api(`/api/users/${userId}/avatar`, { method: 'POST', body: JSON.stringify({ filename: 'frog.svg' }) })).status, 400);
    assert.equal((await api(`/api/users/${userId}/avatar`, { method: 'POST', body: JSON.stringify({ filename: 'defaults/../secret.svg' }) })).status, 400);
    assert.equal((await api(`/api/users/${userId}/avatar`, { method: 'POST', body: JSON.stringify({ filename: 'defaults/nope.svg' }) })).status, 404);
    assert.equal((await api('/api/users/99999/avatar', { method: 'POST', body: JSON.stringify({ filename: 'defaults/frog.svg' }) })).status, 404);
});
