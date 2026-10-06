const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assets = require('../services/appearanceAssets');
const { freePort } = require('./freePort');

const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16, 3)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hg-appearance-'));

test('the type comes from the bytes, not the name or the claim', () => {
    assert.equal(assets.sniffImageType(PNG), 'png');
    assert.equal(assets.sniffImageType(JPEG), 'jpg');
    assert.equal(assets.sniffImageType(WEBP), 'webp');
    assert.equal(assets.sniffImageType(SVG), null);
    assert.equal(assets.sniffImageType(Buffer.from('GIF89a................')), null);
    assert.equal(assets.sniffImageType(Buffer.alloc(4)), null);
});

test('a background is saved under a random name, listed and deleted', async () => {
    const root = tmpRoot();
    const saved = await assets.saveBackground(root, PNG);
    assert.match(saved.file, /^[0-9a-f]{24}\.png$/);
    assert.equal(saved.url, `/api/appearance/backgrounds/${saved.file}`);
    const listed = await assets.listBackgrounds(root);
    assert.deepEqual(listed.map((entry) => entry.file), [saved.file]);
    assert.equal(await assets.deleteBackground(root, saved.file), true);
    assert.deepEqual(await assets.listBackgrounds(root), []);
});

test('anything but JPEG, PNG or WebP is refused, as is an empty or oversized file', async () => {
    const root = tmpRoot();
    assert.equal((await assets.saveBackground(root, SVG)).status, 415);
    assert.equal((await assets.saveBackground(root, Buffer.alloc(0))).status, 400);
    const huge = Buffer.concat([PNG, Buffer.alloc(assets.BACKGROUND_MAX_BYTES)]);
    assert.equal((await assets.saveBackground(root, huge)).status, 413);
    assert.deepEqual(await assets.listBackgrounds(root), []);
});

test('only names the store itself issues resolve, so no path escapes it', () => {
    const root = tmpRoot();
    assert.equal(assets.resolveBackground(root, '../../index.js'), null);
    assert.equal(assets.resolveBackground(root, 'abc.png'), null);
    assert.equal(assets.resolveBackground(root, `${'a'.repeat(24)}.svg`), null);
    const ok = assets.resolveBackground(root, `${'a'.repeat(24)}.webp`);
    assert.equal(ok.type, 'image/webp');
    assert.equal(path.dirname(ok.path), path.join(root, 'appearance', 'backgrounds'));
});

// The routes, on a real server. Every file this creates is deleted again, so
// nothing is left behind in server/uploads.
test('the background routes upload, serve, list and delete', async (t) => {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const dbPath = path.join(tmpRoot(), 'test.db');
    let logs = '';
    const server = spawn('node', ['index.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: {
            ...process.env,
            PORT: String(port),
            DB_PATH: dbPath,
            HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
            HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
            ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (chunk) => { logs += chunk; });
    server.stderr.on('data', (chunk) => { logs += chunk; });
    t.after(() => server.kill('SIGTERM'));

    const start = Date.now();
    for (;;) {
        try {
            if ((await fetch(`${baseUrl}/api/test`)).ok) break;
        } catch { /* starting */ }
        if (Date.now() - start > 30000) throw new Error(`server did not start:\n${logs}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const upload = (buffer, type, name) => {
        const form = new FormData();
        form.append('file', new Blob([buffer], { type }), name);
        return fetch(`${baseUrl}/api/appearance/backgrounds`, { method: 'POST', body: form });
    };

    const refused = await upload(SVG, 'image/png', 'pretend.png');
    assert.equal(refused.status, 415);

    const created = await upload(PNG, 'image/png', 'sky.png');
    assert.equal(created.status, 200);
    const { file, url } = await created.json();

    const served = await fetch(`${baseUrl}${url}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.match(served.headers.get('cache-control'), /immutable/);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);

    const listed = await (await fetch(`${baseUrl}/api/appearance/backgrounds`)).json();
    assert.ok(listed.some((entry) => entry.file === file));

    assert.equal((await fetch(`${baseUrl}/api/appearance/backgrounds/..%2F..%2Findex.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/appearance/backgrounds/${file}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${baseUrl}${url}`)).status, 404);
});
