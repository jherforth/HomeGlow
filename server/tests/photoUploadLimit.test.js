// A photo over the 25 MB limit in a batch upload.
//
// The other photos are saved, but the upload used to answer 500 "Failed to
// upload photos" anyway, so a person saw a failure, tried again and got
// duplicates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `photo-upload-limit-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';

let baseUrl;
let serverProcess;
let serverLogs = '';
const savedFiles = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServerReady(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            if ((await fetch(`${baseUrl}/api/test`)).ok) return;
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }
    throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(port),
            DB_PATH: testDbPath,
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
    // Uploads land in the real uploads folder, so remove only what this test saved.
    for (const file of savedFiles) fs.rmSync(file, { force: true });
    // And its folders, if this test made them: rmdir refuses a folder with files.
    for (const dir of [...new Set(savedFiles.map((file) => path.dirname(file)))]) {
        for (const folder of [dir, path.dirname(dir)]) {
            try { fs.rmdirSync(folder); } catch { /* not empty, or gone */ }
        }
    }
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            fs.rmSync(`${testDbPath}${suffix}`, { force: true });
        }
    }
});

test('a photo over 25 MB is reported as failed, and the others are kept', async () => {
    const created = await fetch(`${baseUrl}/api/photo-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Family', type: 'HomeGlowPhotos' }),
    });
    const { id } = await created.json();

    const photo = (bytes) => new Blob([Buffer.alloc(bytes, 7)], { type: 'image/jpeg' });
    const form = new FormData();
    form.append('photos', photo(100 * 1024), 'one.jpg');
    form.append('photos', photo(100 * 1024), 'two.jpg');
    form.append('photos', photo(26 * 1024 * 1024), 'huge.jpg');
    form.append('photos', photo(100 * 1024), 'three.jpg');

    const response = await fetch(`${baseUrl}/api/photo-sources/${id}/uploaded`, { method: 'POST', body: form });
    const body = await response.json();
    body.items?.forEach((item) => savedFiles.push(path.join(serverDir, 'uploads', 'homeglow-photos', String(id), item.filename)));

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.added, 3);
    assert.deepEqual(body.items.map((item) => item.original_name), ['one.jpg', 'two.jpg', 'three.jpg']);
    assert.equal(body.failed, 1);
    assert.equal(body.errors[0].name, 'huge.jpg');
    assert.match(body.errors[0].reason, /25 MB/);

    const photos = await (await fetch(`${baseUrl}/api/photo-sources/${id}/uploaded`)).json();
    assert.equal(photos.length, 3);
});
