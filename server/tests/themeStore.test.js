const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../services/themeStore');
const { freePort } = require('./freePort');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(32, 4)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" opacity="0.5"/></svg>');
const manifest = (fields = {}) => Buffer.from(JSON.stringify({ manifestVersion: 1, id: 'nebula', name: 'Nebula', version: '1.0.0', ...fields }));
const theme = (extra = [], fields = {}) => [
    { path: 'theme.json', buffer: manifest(fields) },
    { path: 'assets/cloud.svg', buffer: SVG },
    { path: 'fonts/face-400.woff2', buffer: WOFF2 },
    ...extra,
];

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hg-themes-'));

test('a theme is refused for a bad manifest, a disguised file or script', () => {
    const problem = (files) => store.checkTheme(files).error;
    assert.equal(problem(theme().slice(1)), 'theme.json is missing');
    assert.match(problem(theme([], { id: 'Not A Slug' })), /needs an id/);
    assert.match(problem(theme([], { id: 'classic' })), /built in/);
    assert.match(problem(theme([], { manifestVersion: 2 })), /manifestVersion 1/);
    assert.match(problem([{ path: 'theme.json', buffer: Buffer.from('{nope') }]), /not valid JSON/);
    assert.match(problem(theme([{ path: 'assets/photo.png', buffer: SVG }])), /assets\/photo\.png is not a PNG image/);
    assert.match(problem(theme([{ path: 'fonts/x.woff2', buffer: PNG }])), /not a WOFF2 font/);
    const scripted = Buffer.from('<svg><script>alert(1)</script></svg>');
    assert.match(problem(theme([{ path: 'assets/x.svg', buffer: scripted }])), /carries script/);
    assert.match(problem(theme([{ path: 'assets/x.svg', buffer: Buffer.from('<svg onload="x()"/>') }])), /carries script/);
    assert.match(problem(theme([{ path: 'assets/x.svg', buffer: Buffer.from('<svg><a href="javascript:x()"/></svg>') }])), /carries script/);
    const many = Array.from({ length: store.MAX_FILES }, (_, i) => ({ path: `assets/a${i}.svg`, buffer: SVG }));
    assert.match(problem(theme(many)), /at most/);
});

test('files outside the theme layout are skipped, not installed', () => {
    const checked = store.checkTheme(theme([
        { path: 'README.md', buffer: Buffer.from('# hi') },
        { path: '../escape.svg', buffer: SVG },
        { path: 'assets/sub/deep.svg', buffer: SVG },
        { path: 'index.html', buffer: Buffer.from('<script>') },
    ]));
    assert.equal(checked.error, undefined);
    assert.deepEqual(checked.files.map((file) => file.path).sort(), ['assets/cloud.svg', 'fonts/face-400.woff2', 'theme.json']);
    assert.deepEqual(checked.skipped.sort(), ['../escape.svg', 'README.md', 'assets/sub/deep.svg', 'index.html']);
});

test('a theme installs, lists, replaces itself and is removed', async () => {
    const root = tmpRoot();
    const first = await store.installTheme(root, theme(), { source: 'store', ref: 'abc' });
    assert.equal(first.id, 'nebula');
    let [listed] = await store.listThemes(root);
    assert.equal(listed.manifest.name, 'Nebula');
    assert.deepEqual(listed.files, ['assets/cloud.svg', 'fonts/face-400.woff2']);
    assert.equal(listed.source, 'store');
    assert.equal(listed.ref, 'abc');

    // A reinstall replaces the folder: a file the new version lacks is gone.
    await store.installTheme(root, theme().filter((file) => !file.path.startsWith('fonts/')), { source: 'upload' });
    [listed] = await store.listThemes(root);
    assert.deepEqual(listed.files, ['assets/cloud.svg']);
    assert.equal(listed.source, 'upload');
    assert.deepEqual(fs.readdirSync(path.join(root, 'themes')), ['nebula']);

    assert.equal(await store.removeTheme(root, 'nebula'), true);
    assert.deepEqual(await store.listThemes(root), []);
    assert.equal(await store.removeTheme(root, 'nebula'), false);
    assert.equal(await store.removeTheme(root, '../themes'), false);
});

test('a failed check leaves the installed version in place', async () => {
    const root = tmpRoot();
    await store.installTheme(root, theme());
    const refused = await store.installTheme(root, theme([{ path: 'assets/x.svg', buffer: Buffer.from('<svg><script/></svg>') }]));
    assert.match(refused.error, /carries script/);
    const [listed] = await store.listThemes(root);
    assert.deepEqual(listed.files, ['assets/cloud.svg', 'fonts/face-400.woff2']);
});

test('only theme files resolve, never the manifest or a path outside the folder', () => {
    const root = tmpRoot();
    assert.equal(store.resolveThemeFile(root, 'nebula', 'assets/cloud.svg').type, 'image/svg+xml');
    assert.equal(store.resolveThemeFile(root, 'nebula', 'fonts/face-400.woff2').type, 'font/woff2');
    assert.match(store.resolveThemeFile(root, 'nebula', 'assets/cloud.svg').csp, /sandbox/);
    assert.equal(store.resolveThemeFile(root, 'nebula', 'theme.json'), null);
    assert.equal(store.resolveThemeFile(root, 'nebula', 'assets/../../x.svg'), null);
    assert.equal(store.resolveThemeFile(root, '..', 'assets/cloud.svg'), null);
    assert.equal(store.resolveThemeFile(root, 'nebula', 'assets/x.html'), null);
});

// A fake GitHub: a commit, its tree, and raw files by path at that commit.
// `staleHead` is what a cached HEAD would serve instead.
const COMMIT = 'c'.repeat(40);
function fakeGitHub(files, staleHead = {}) {
    const calls = [];
    const tree = [];
    const dirs = new Set();
    Object.entries(files).forEach(([filePath, buffer]) => {
        tree.push({ type: 'blob', path: filePath, sha: `blob-${filePath}-${buffer.length}`, size: buffer.length });
        dirs.add(filePath.split('/')[0]);
    });
    dirs.forEach((dir) => tree.push({ type: 'tree', path: dir, sha: `tree-${dir}` }));
    return {
        calls,
        get: async (url) => {
            calls.push(url);
            if (url.endsWith('/commits/HEAD')) return { data: { sha: COMMIT } };
            if (url.includes(`/git/trees/${COMMIT}`)) return { data: { tree } };
            const [, ref, filePath] = url.match(/HomeGlowThemes\/([^/]+)\/(.+)$/);
            const source = ref === 'HEAD' ? { ...files, ...staleHead } : ref === COMMIT ? files : {};
            const body = source[decodeURIComponent(filePath)];
            if (!body) throw Object.assign(new Error('404'), { response: { status: 404 } });
            return { data: body };
        },
    };
}

test('the repository lists one theme per folder whose id matches it', async () => {
    const github = fakeGitHub({
        'README.md': Buffer.from('# Themes'),
        'nebula/theme.json': manifest({ author: 'Ram', description: 'Clouds' }),
        'nebula/assets/cloud.svg': SVG,
        'nebula/preview.png': PNG,
        'wrong/theme.json': manifest({ id: 'other' }),
        'broken/theme.json': Buffer.from('{'),
    });
    const listed = await store.listRepositoryThemes(github, 'someone/HomeGlowThemes');
    assert.deepEqual(listed.map((t) => t.id), ['nebula']);
    assert.equal(listed[0].author, 'Ram');
    assert.equal(listed[0].ref, 'tree-nebula');
    assert.match(listed[0].previewUrl, new RegExp(`someone/HomeGlowThemes/${COMMIT}/nebula/preview\\.png$`));
    assert.equal(github.calls.filter((url) => url.includes('api.github.com')).length, 2);

    const fetched = await store.fetchRepositoryTheme(github, 'someone/HomeGlowThemes', 'nebula');
    assert.deepEqual(fetched.files.map((file) => file.path).sort(), ['assets/cloud.svg', 'theme.json']);
    assert.equal(fetched.ref, 'tree-nebula');
    assert.equal((await store.fetchRepositoryTheme(github, 'someone/HomeGlowThemes', 'missing')).status, 404);
    assert.equal((await store.fetchRepositoryTheme(github, 'someone/HomeGlowThemes', '../x')).status, 400);
});

test('the theme routes upload, list, serve and remove', async (t) => {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const dbPath = path.join(tmpRoot(), 'test.db');
    // Routes write to the real uploads folder, so the id is unique and removed after.
    const id = `test-theme-${process.pid}`;
    t.after(() => fs.rmSync(path.resolve(__dirname, '../uploads/themes', id), { recursive: true, force: true }));
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

    const upload = (files) => {
        const form = new FormData();
        files.forEach((file) => form.append(file.path, new Blob([file.buffer]), path.basename(file.path)));
        return fetch(`${baseUrl}/api/themes/upload`, { method: 'POST', body: form });
    };

    const refused = await upload(theme([{ path: 'assets/x.svg', buffer: Buffer.from('<svg><script/></svg>') }], { id }));
    assert.equal(refused.status, 422);
    assert.match((await refused.json()).problems.join(), /carries script/);

    const created = await upload(theme([], { id }));
    assert.equal(created.status, 200, await created.clone().text());
    assert.equal((await created.json()).id, id);

    const { themes } = await (await fetch(`${baseUrl}/api/themes`)).json();
    const listed = themes.find((entry) => entry.id === id);
    assert.deepEqual(listed.files, ['assets/cloud.svg', 'fonts/face-400.woff2']);

    const served = await fetch(`${baseUrl}/api/themes/${id}/assets/cloud.svg?v=1`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/svg+xml');
    assert.match(served.headers.get('content-security-policy'), /sandbox/);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(served.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), SVG);

    assert.equal((await fetch(`${baseUrl}/api/themes/${id}/theme.json/x`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/themes/${id}/assets/..%2F..%2F..%2Findex.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/themes/${id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/themes/${id}/assets/cloud.svg?v=1`)).status, 404);
});

test('files are read at the listed commit, so a cached HEAD never serves an old version', async () => {
    // Just after a merge: the tree says 1.0.1, a cached HEAD still serves 1.0.0.
    const current = manifest({ version: '1.0.1', author: 'mrramam' });
    const github = fakeGitHub(
        { 'nebula/theme.json': current, 'nebula/assets/cloud.svg': SVG },
        { 'nebula/theme.json': manifest({ version: '1.0.0', author: 'HomeGlow' }) },
    );
    const [listed] = await store.listRepositoryThemes(github, 'someone/HomeGlowThemes');
    assert.equal(listed.version, '1.0.1');
    assert.equal(listed.author, 'mrramam');
    const fetched = await store.fetchRepositoryTheme(github, 'someone/HomeGlowThemes', 'nebula');
    assert.deepEqual(fetched.files.find((file) => file.path === 'theme.json').buffer, current);
    assert.ok(github.calls.every((url) => !url.includes('/HEAD/')));
});
