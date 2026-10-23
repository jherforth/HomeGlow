// Uploaded pictures and photos are typed by their bytes, not by the name or
// type the client sends, and /Uploads/ answers with nosniff and a sandbox CSP.
//
// A file named pwn.html and declared image/png used to be stored as .html
// and served as text/html from the app's own origin.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `upload-types-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';

let baseUrl;
let serverProcess;
let serverLogs = '';
const savedFiles = [];
const { sniffImage } = require('../utils/imageType');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const HTML = Buffer.from('<!doctype html><script>alert(document.domain)</script>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const ftyp = (major, ...compatible) => {
    const brands = Buffer.from([major, '\0\0\0\0', ...compatible].join(''), 'latin1');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8 + brands.length);
    return Buffer.concat([size, Buffer.from('ftyp'), brands, Buffer.alloc(16)]);
};

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

const filePart = (bytes, type) => new Blob([bytes], { type });

test('sniffImage reads the type from the bytes', () => {
    assert.deepEqual(sniffImage(PNG), { ext: 'png', mime: 'image/png' });
    assert.equal(sniffImage(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)])).ext, 'gif');
    assert.equal(sniffImage(ftyp('heic', 'mif1', 'heic')).ext, 'heic');
    assert.equal(sniffImage(ftyp('avif', 'mif1', 'miaf')).ext, 'avif');
    assert.equal(sniffImage(ftyp('mif1', 'avif')).ext, 'avif');
    assert.equal(sniffImage(ftyp('isom', 'mp41')), null);
    assert.equal(sniffImage(HTML), null);
    assert.equal(sniffImage(SVG), null);
    assert.equal(sniffImage(Buffer.alloc(4)), null);
});

test('a profile picture is stored under the extension its bytes say, and HTML is refused', async () => {
    const created = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Upload Uma' }),
    });
    const { id } = await created.json();
    const upload = async (bytes, name) => {
        const form = new FormData();
        form.append('file', filePart(bytes, 'image/png'), name);
        return fetch(`${baseUrl}/api/users/${id}/upload-picture`, { method: 'POST', body: form });
    };

    assert.equal((await upload(HTML, 'pwn.html')).status, 400);

    const saved = await upload(PNG, 'pwn.html');
    const body = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(body));
    const users = await (await fetch(`${baseUrl}/api/users`)).json();
    const picture = users.find((user) => user.id === id).profile_picture;
    savedFiles.push(path.join(serverDir, 'uploads', 'users', picture));
    assert.match(picture, /^user_\d+_\d+\.png$/);

    const served = await fetch(`${baseUrl}/Uploads/users/${picture}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(served.headers.get('content-security-policy'), 'sandbox');
});

test('a photo is stored and served as the type its bytes say; HTML and SVG are refused', async () => {
    const created = await fetch(`${baseUrl}/api/photo-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Typed', type: 'HomeGlowPhotos' }),
    });
    const { id } = await created.json();
    const form = new FormData();
    form.append('photos', filePart(PNG, 'image/jpeg'), 'real.html');
    form.append('photos', filePart(HTML, 'image/png'), 'pwn.html');
    form.append('photos', filePart(SVG, 'image/svg+xml'), 'pwn.svg');

    const response = await fetch(`${baseUrl}/api/photo-sources/${id}/uploaded`, { method: 'POST', body: form });
    const body = await response.json();
    body.items?.forEach((item) => savedFiles.push(path.join(serverDir, 'uploads', 'homeglow-photos', String(id), item.filename)));
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.added, 1);
    assert.match(body.items[0].filename, /^[0-9a-f]{24}\.png$/);
    assert.deepEqual(body.errors.map((error) => [error.name, error.reason]), [
        ['pwn.html', 'Not a supported image'],
        ['pwn.svg', 'Not a supported image'],
    ]);

    const served = await fetch(`${baseUrl}/api/photo-sources/${id}/uploaded/${body.items[0].id}/file`);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(served.headers.get('content-security-policy'), 'sandbox');

    const direct = await fetch(`${baseUrl}/Uploads/homeglow-photos/${id}/${body.items[0].filename}`);
    assert.equal(direct.headers.get('content-security-policy'), 'sandbox');
});
