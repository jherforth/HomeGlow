// Outbound TLS policy (issue #139).
//
// The bug: /api/proxy set `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` the
// first time it saw an https:// target, disabling certificate verification for
// the entire process — every later Google token exchange included — and never
// restoring it.
//
// The fix has to hold two things at once, which is what these tests pin:
// public hosts are always verified, and private ones still work when they
// present a self-signed certificate, because that is the normal case for a NAS
// or photo server on a home network. Plain HTTP must be untouched, since plenty
// of installs never use TLS at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
    isPrivateHost,
    httpsAgentFor,
    isCertificateVerificationSkipped,
} = require('../utils/outboundTls');

// --- classification ---------------------------------------------------------

test('private address ranges are recognised', () => {
    const priv = [
        'localhost',
        '127.0.0.1', '127.1.2.3',
        '10.0.0.1', '10.255.255.255',
        '172.16.0.1', '172.20.10.5', '172.31.255.254',
        '192.168.0.1', '192.168.1.50',
        '169.254.1.1',
        'immich.local', 'nas.lan', 'ha.internal', 'server.home', 'thing.home.arpa',
        '::1', '[::1]',
        'fd00::1', '[fd12:3456::1]',
        'fe80::1',
        '::ffff:192.168.1.1',
    ];
    for (const host of priv) {
        assert.equal(isPrivateHost(host), true, `${host} should be private`);
    }
});

test('public hosts are not mistaken for private ones', () => {
    const pub = [
        'accounts.google.com',
        'oauth2.googleapis.com',
        'caldav.icloud.com',
        'api.openweathermap.org',
        'calapi.inadiutorium.cz',
        '8.8.8.8',
        '1.1.1.1',
        // Adjacent to private ranges but outside them.
        '172.15.0.1', '172.32.0.1', '11.0.0.1', '192.169.0.1',
        // Suffix lookalikes that are not the local suffix.
        'notlocal.com', 'mylocal.io', 'local.example.com',
        '2606:4700::1111',
        '',
        null,
    ];
    for (const host of pub) {
        assert.equal(isPrivateHost(host), false, `${host} should not be private`);
    }
});

// --- agent selection --------------------------------------------------------

test('plain HTTP gets no https agent at all', () => {
    // Installs that run entirely over HTTP on a LAN or localhost must be
    // completely unaffected by any of this.
    assert.equal(httpsAgentFor('http://localhost:3000/api'), undefined);
    assert.equal(httpsAgentFor('http://192.168.1.50:2283/api'), undefined);
    assert.equal(httpsAgentFor('http://example.com'), undefined);
});

test('public HTTPS is verified, private HTTPS accepts a self-signed certificate', () => {
    const publicAgent = httpsAgentFor('https://oauth2.googleapis.com/token');
    assert.equal(publicAgent.options.rejectUnauthorized, true);

    for (const url of [
        'https://192.168.1.50:8123/api/',
        'https://immich.local/api',
        'https://localhost:8443/',
        'https://[fd00::1]/api',
    ]) {
        assert.equal(httpsAgentFor(url).options.rejectUnauthorized, false, url);
    }
});

test('agents are reused rather than rebuilt per request', () => {
    // A fresh agent each time would throw away connection reuse and pile up
    // sockets on a widget that polls.
    assert.equal(
        httpsAgentFor('https://example.com/a'),
        httpsAgentFor('https://example.com/b'),
    );
    assert.equal(
        httpsAgentFor('https://192.168.1.5/a'),
        httpsAgentFor('https://192.168.1.9/b'),
    );
});

test('an unparseable URL falls back to verifying', () => {
    assert.equal(httpsAgentFor('not a url').options.rejectUnauthorized, true);
});

test('isCertificateVerificationSkipped only reports true for private HTTPS', () => {
    assert.equal(isCertificateVerificationSkipped('https://192.168.1.50/'), true);
    assert.equal(isCertificateVerificationSkipped('https://example.com/'), false);
    assert.equal(isCertificateVerificationSkipped('http://192.168.1.50/'), false);
    assert.equal(isCertificateVerificationSkipped('nonsense'), false);
});

// --- the actual regression, against a running server ------------------------

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `outbound-tls-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 9200 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;
let serverLogs = '';
let originHttp;
let originPort;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
}

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // A plain-HTTP origin standing in for a LAN service, which is how a great
    // many HomeGlow installs actually talk to Immich or Home Assistant.
    originHttp = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, path: req.url }));
    });
    await new Promise((resolve) => originHttp.listen(0, '127.0.0.1', resolve));
    originPort = originHttp.address().port;

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
    serverProcess.stdout.on('data', (c) => { serverLogs += c.toString(); });
    serverProcess.stderr.on('data', (c) => { serverLogs += c.toString(); });

    const start = Date.now();
    while (Date.now() - start < 30000) {
        try {
            const r = await fetch(`${baseUrl}/api/test`);
            if (r.ok) break;
        } catch { /* starting */ }
        await delay(250);
    }

    await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'PROXY_WHITELIST', value: '127.0.0.1,self-signed.badssl.com' }),
    });
});

test.after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', () => resolve());
            setTimeout(resolve, 5000);
        });
    }
    if (originHttp) await new Promise((resolve) => originHttp.close(resolve));
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const p = `${testDbPath}${suffix}`;
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
    }
});

test('proxying a plain-HTTP LAN target still works', async () => {
    const result = await api(`/api/proxy?targetUrl=${encodeURIComponent(`http://127.0.0.1:${originPort}/hello`)}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.path, '/hello');
});

test('nothing in the server mutates the global TLS switch', () => {
    // The defect in #139 was one assignment, so guard it directly. A runtime
    // assertion cannot see the spawned process's environment portably, and
    // proving the negative over TLS would need a self-signed server and a
    // certificate fixture; this fails the moment anyone reintroduces the line.
    const sources = ['index.js', 'utils/outboundTls.js']
        .concat(fs.readdirSync(path.join(serverDir, 'services')).map((f) => `services/${f}`))
        .filter((f) => f.endsWith('.js'));

    for (const file of sources) {
        // Comments are stripped first: the name legitimately appears in prose
        // explaining why this rule exists. An assignment in live code is the
        // thing being forbidden.
        const code = fs.readFileSync(path.join(serverDir, file), 'utf8')
            .split(/\r?\n/)
            .filter((line) => {
                const trimmed = line.trim();
                return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
            })
            .join('\n');

        assert.doesNotMatch(
            code,
            /process\.env\s*(\.\s*NODE_TLS_REJECT_UNAUTHORIZED|\[\s*['"]NODE_TLS_REJECT_UNAUTHORIZED['"]\s*\])\s*=/,
            `${file} assigns to the global TLS switch`,
        );
    }
});

test('an HTTPS proxy request leaves the server healthy', async () => {
    // Unreachable on purpose, so the suite stays offline. What matters is that
    // the request fails cleanly rather than taking the process with it.
    const result = await api('/api/proxy?targetUrl=' + encodeURIComponent('https://self-signed.badssl.com/'));
    assert.ok(result.status >= 400, `expected a failure status, got ${result.status}`);

    const after = await api(`/api/proxy?targetUrl=${encodeURIComponent(`http://127.0.0.1:${originPort}/still-here`)}`);
    assert.equal(after.status, 200, 'a later request should still work');
    assert.equal(after.body.path, '/still-here');
});

test('a non-whitelisted host is still refused', async () => {
    const result = await api('/api/proxy?targetUrl=' + encodeURIComponent('https://example.com/'));
    assert.equal(result.status, 403);
});
