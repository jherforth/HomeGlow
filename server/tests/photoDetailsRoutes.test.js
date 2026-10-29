// Uploaded photos carry the day they were taken and where, read from their
// EXIF at upload, and photos uploaded before the server read them are read
// once at startup.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { freePort } = require('./freePort');
const { exifJpeg } = require('./helpers/exifJpeg');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `photo-details-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';

let baseUrl;
let serverProcess;
let serverLogs = '';
let sourceId;
const savedFiles = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverLogs = '';
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
}

async function stopServer() {
    if (!serverProcess || serverProcess.killed) return;
    serverProcess.kill('SIGTERM');
    await new Promise((resolve) => {
        serverProcess.once('close', () => resolve());
        setTimeout(resolve, 5000);
    });
}

const api = async (url) => (await fetch(`${baseUrl}${url}`)).json();

async function settledDetails() {
    for (let i = 0; i < 40; i += 1) {
        const details = await api(`/api/photo-sources/${sourceId}/uploaded/details`);
        if (!details.reading) return details;
        await delay(250);
    }
    throw new Error(`Photo details never finished reading. Logs:\n${serverLogs}`);
}

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    await startServer();
});

test.after(async () => {
    await stopServer();
    // Uploads land in the real uploads folder, so remove only what this test saved.
    for (const file of savedFiles) fs.rmSync(file, { force: true });
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

test('an upload reads the date and place, and the photo list carries them', async () => {
    const created = await fetch(`${baseUrl}/api/photo-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Family', type: 'HomeGlowPhotos' }),
    });
    sourceId = (await created.json()).id;

    const form = new FormData();
    const photo = (bytes, name) => form.append('photos', new Blob([bytes], { type: 'image/jpeg' }), name);
    photo(exifJpeg({ takenAt: '2019:09:14 09:53:34', latitude: 40.7484, longitude: -73.9857 }), 'city.jpg');
    photo(exifJpeg({ takenAt: '2021:06:01 10:00:00' }), 'dated.jpg');
    photo(exifJpeg(), 'plain.jpg');
    const response = await fetch(`${baseUrl}/api/photo-sources/${sourceId}/uploaded`, { method: 'POST', body: form });
    const body = await response.json();
    body.items?.forEach((item) => savedFiles.push(path.join(serverDir, 'uploads', 'homeglow-photos', String(sourceId), item.filename)));
    assert.equal(body.added, 3, JSON.stringify(body));

    assert.deepEqual(await settledDetails(), { total: 3, withDate: 2, withPlace: 1, reading: false });

    const items = (await api('/api/photo-items')).filter((item) => item.source_id === sourceId);
    const byDate = Object.fromEntries(items.map((item) => [item.takenOn || 'none', item]));
    assert.equal(byDate['2019-09-14'].place, 'New York City, New York');
    assert.equal(byDate['2021-06-01'].place, undefined);
    assert.equal(byDate.none.place, undefined);
    assert.equal(items.length, 3);
});

test('photos uploaded before the server read them are read once at startup', async () => {
    await stopServer();
    const db = new Database(testDbPath);
    db.prepare('UPDATE homeglow_photos SET taken_on = NULL, latitude = NULL, longitude = NULL, details_read_at = NULL').run();
    // A row whose file is gone is marked read too, so it isn't retried forever.
    const missing = db.prepare(
        "INSERT INTO homeglow_photos (source_id, filename, original_name, mime_type, size) VALUES (?, 'gone.jpg', 'gone.jpg', 'image/jpeg', 1)"
    ).run(sourceId).lastInsertRowid;
    db.close();

    await startServer();
    assert.deepEqual(await settledDetails(), { total: 4, withDate: 2, withPlace: 1, reading: false });

    await stopServer();
    const readAt = () => {
        const check = new Database(testDbPath, { readonly: true });
        const rows = check.prepare('SELECT id, details_read_at FROM homeglow_photos ORDER BY id').all();
        check.close();
        return rows;
    };
    const first = readAt();
    assert.ok(first.every((row) => row.details_read_at), JSON.stringify(first));
    assert.ok(first.find((row) => row.id === missing));

    // And not again on the next start: the read times don't move.
    await delay(1100);
    await startServer();
    await settledDetails();
    await stopServer();
    assert.deepEqual(readAt(), first);
});
