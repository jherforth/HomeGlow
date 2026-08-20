// Calendar and photo credentials share the auto-keyed encryption store.
//
// These used to use a separate AES-256-CBC scheme keyed on
// `ENCRYPTION_KEY || <string hardcoded in this repo>`, so on any install that
// did not set the variable — which was every stock docker-compose install,
// since it never forwarded it — Apple app passwords, Immich API keys and photo
// refresh tokens were encrypted with a published key.
//
// The properties worth pinning: new writes use the current scheme, values
// written under the old one are re-encrypted on upgrade, anything the migration
// could not convert is still readable, and a replay does not double-encrypt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `credential-encryption-${process.pid}-${Date.now()}.db`);
const keyFilePath = path.join(tmpDir, `credential-encryption-${process.pid}-${Date.now()}.key`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 8900 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

// The exact scheme the old code used, reproduced here so the migration is
// tested against real legacy ciphertext rather than a mock of it.
const LEGACY_FALLBACK_KEY = 'homeglow-default-key-change-in-production-32bytes';
function legacyEncrypt(plain, keyMaterial = LEGACY_FALLBACK_KEY) {
    const key = crypto.scryptSync(keyMaterial, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plain, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

const isLegacyShaped = (value) => /^[0-9a-f]{32}:[0-9a-f]+$/i.test(String(value || ''));

let serverProcess;
let serverLogs = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// No ENCRYPTION_KEY: exercises the auto-generated-key path, which is what a
// real install uses.
const serverEnv = {
    PORT: String(port),
    DB_PATH: testDbPath,
    ENCRYPTION_KEY_FILE: keyFilePath,
    TZ: 'UTC',
    HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
    HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
};

async function waitForServerReady(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/api/test`);
            if (response.ok) return;
        } catch {
            // Still starting.
        }
        await delay(250);
    }
    throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

function startServer() {
    const env = { ...process.env, ...serverEnv };
    delete env.ENCRYPTION_KEY;
    serverProcess = spawn('node', ['index.js'], { cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    serverProcess.stdout.on('data', (c) => { serverLogs += c.toString(); });
    serverProcess.stderr.on('data', (c) => { serverLogs += c.toString(); });
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
    serverProcess = null;
}

async function api(pathname, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
}

const readColumn = (table, column, id) => {
    const db = new Database(testDbPath);
    const row = db.prepare(`SELECT ${column} AS value FROM ${table} WHERE id = ?`).get(id);
    db.close();
    return row ? row.value : null;
};

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    await startServer();
});

test.after(async () => {
    await stopServer();
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const p = `${testDbPath}${suffix}`;
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        if (fs.existsSync(keyFilePath)) fs.unlinkSync(keyFilePath);
    }
});

test('a key is generated with no configuration, and stored restrictively', () => {
    assert.ok(fs.existsSync(keyFilePath), 'no key file was created');

    const contents = fs.readFileSync(keyFilePath, 'utf8').trim();
    assert.equal(Buffer.from(contents, 'base64').length, 32, 'key is not 32 bytes');

    if (process.platform !== 'win32') {
        const mode = fs.statSync(keyFilePath).mode & 0o777;
        assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
    }
});

test('a newly saved credential is encrypted with the current scheme', async () => {
    const created = await api('/api/photo-sources', {
        method: 'POST',
        body: JSON.stringify({
            name: 'Immich test', type: 'Immich', url: 'http://immich.invalid', api_key: 'super-secret-api-key',
        }),
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));

    const sources = await api('/api/photo-sources');
    const source = sources.body.find((s) => s.name === 'Immich test');
    assert.ok(source);

    const stored = readColumn('photo_sources', 'api_key', source.id);
    assert.notEqual(stored, 'super-secret-api-key', 'stored in plaintext');
    assert.equal(isLegacyShaped(stored), false, 'stored in the legacy format');
    // Current format is base64 of iv|tag|ciphertext.
    assert.ok(Buffer.from(stored, 'base64').length > 28);
});

test('credentials written under the old scheme are re-encrypted on upgrade', async () => {
    await stopServer();

    // Seed rows exactly as the previous release would have written them, then
    // roll the schema id back so migration 25 runs on the next boot.
    const db = new Database(testDbPath);
    const calendar = db.prepare(`
        INSERT INTO calendar_sources (name, type, url, username, password)
        VALUES (?, 'Apple', 'https://caldav.icloud.com', 'someone@icloud.com', ?)
    `).run('Legacy Apple calendar', legacyEncrypt('apple-app-specific-password'));
    const photo = db.prepare(`
        INSERT INTO photo_sources (name, type, url, api_key, refresh_token)
        VALUES (?, 'Immich', 'http://immich.invalid', ?, ?)
    `).run('Legacy Immich', legacyEncrypt('legacy-immich-key'), legacyEncrypt('legacy-refresh-token'));

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('SYSTEM_SCHEMA_ID', '24')").run();
    db.close();

    const calendarId = calendar.lastInsertRowid;
    const photoId = photo.lastInsertRowid;

    // Sanity: they really are legacy-shaped before the upgrade.
    assert.equal(isLegacyShaped(readColumn('calendar_sources', 'password', calendarId)), true);

    await startServer();

    // Converted in place...
    const migratedCalendar = readColumn('calendar_sources', 'password', calendarId);
    assert.equal(isLegacyShaped(migratedCalendar), false, 'calendar password was not migrated');
    assert.equal(isLegacyShaped(readColumn('photo_sources', 'api_key', photoId)), false);
    assert.equal(isLegacyShaped(readColumn('photo_sources', 'refresh_token', photoId)), false);

    // ...and still decrypt to the original secret. The test endpoint reaches a
    // .invalid host so it cannot succeed, but reaching a connection error at
    // all proves the credential was decrypted rather than throwing on read.
    const tested = await api(`/api/photo-sources/${photoId}/test`, { method: 'POST' });
    assert.ok(tested.status < 500, `credential failed to decrypt: ${JSON.stringify(tested.body)}`);
});

test('replaying the migration does not double-encrypt', async () => {
    const sources = await api('/api/photo-sources');
    const source = sources.body.find((s) => s.name === 'Legacy Immich');
    const before = readColumn('photo_sources', 'api_key', source.id);

    await stopServer();
    const db = new Database(testDbPath);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('SYSTEM_SCHEMA_ID', '24')").run();
    db.close();
    await startServer();

    const after = readColumn('photo_sources', 'api_key', source.id);
    assert.equal(after, before, 'already-migrated value was re-encrypted a second time');
});

test('a credential that cannot be decrypted is skipped, not fatal', async () => {
    await stopServer();

    // Legacy-shaped but written with a key nobody has. The migration must name
    // it and carry on rather than aborting and stranding the other rows.
    const db = new Database(testDbPath);
    const broken = db.prepare(`
        INSERT INTO calendar_sources (name, type, url, username, password)
        VALUES ('Unrecoverable', 'CalDAV', 'https://example.invalid', 'x', ?)
    `).run(legacyEncrypt('lost', crypto.randomBytes(32).toString('base64')));
    const alsoLegacy = db.prepare(`
        INSERT INTO calendar_sources (name, type, url, username, password)
        VALUES ('Recoverable', 'CalDAV', 'https://example.invalid', 'y', ?)
    `).run(legacyEncrypt('still-here'));

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('SYSTEM_SCHEMA_ID', '24')").run();
    db.close();

    serverLogs = '';
    await startServer();

    // The good one migrated even though the bad one was in the same table.
    assert.equal(
        isLegacyShaped(readColumn('calendar_sources', 'password', alsoLegacy.lastInsertRowid)),
        false,
        'a sibling row blocked the migration',
    );
    // The bad one is left alone and named in the logs.
    assert.match(serverLogs, /Unrecoverable/, 'the skipped credential was not reported by name');

    // And the server is up and serving, which is the real assertion.
    const sources = await api('/api/calendar-sources');
    assert.equal(sources.status, 200);
});

test('an unmigrated legacy value is still readable through the legacy path', async () => {
    // Written after the migration ran, so nothing converts it — this is the
    // permanent fallback that makes a skipped migration a non-event.
    const db = new Database(testDbPath);
    const row = db.prepare(`
        INSERT INTO photo_sources (name, type, url, api_key)
        VALUES ('Never migrated', 'Immich', 'http://immich.invalid', ?)
    `).run(legacyEncrypt('legacy-but-readable'));
    db.close();

    assert.equal(isLegacyShaped(readColumn('photo_sources', 'api_key', row.lastInsertRowid)), true);

    const tested = await api(`/api/photo-sources/${row.lastInsertRowid}/test`, { method: 'POST' });
    assert.ok(tested.status < 500, `legacy read path failed: ${JSON.stringify(tested.body)}`);
});
