// Backup to a file and restore from one, without Google (issue #305): real
// servers on throwaway databases. Export downloads the archive a Drive backup
// holds; import stages it through the same checks. Applying a staged restore
// at start-up is covered by driveRestore.test.js, on temporary folders.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { freePort } = require('./freePort');
const { extractArchive } = require('../utils/tarArchive');

const serverDir = path.resolve(__dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const KEY_A = Buffer.alloc(32, 9).toString('base64');
const KEY_B = Buffer.alloc(32, 7).toString('base64');

async function startServer({ key = KEY_A, demo = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-local-backup-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: path.join(dataDir, 'tasks.db'), TZ: 'UTC',
      ENCRYPTION_KEY: key, DEMO_MODE: demo ? 'true' : 'false',
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1', HOMEGLOW_DISABLE_CALENDAR_SYNC: '1', HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const base = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if ((await fetch(`${base}/api/test`)).ok) break; } catch { /* starting */ }
    await delay(250);
  }
  const json = async (res) => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
  const server = {
    base,
    dataDir,
    async post(pathname, body) {
      const res = await fetch(`${base}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      return { status: res.status, body: await json(res) };
    },
    async get(pathname) {
      const res = await fetch(`${base}${pathname}`);
      return { status: res.status, body: await json(res) };
    },
    async exportBackup(pin) {
      const res = await fetch(`${base}/api/backup/local/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pin ? { pin } : {}) });
      return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
    },
    async importBackup(bytes, filename = 'homeglow-backup.tar.gz') {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: 'application/gzip' }), filename);
      const res = await fetch(`${base}/api/backup/local/import`, { method: 'POST', body: form });
      return { status: res.status, body: await json(res) };
    },
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('close', resolve);
      child.kill();
      setTimeout(resolve, 5000);
    }).then(() => fs.rmSync(dataDir, { recursive: true, force: true })),
  };
  return server;
}

let exported; // the archive from the first test, for the others

test('export downloads the full backup, and asks for the PIN once one is set', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  assert.equal((await server.post('/api/users', { username: 'Mia', email: 'mia@example.com' })).status, 200);

  const res = await server.exportBackup();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/gzip');
  assert.match(res.headers.get('content-disposition'), /attachment; filename="homeglow-backup-\d{4}-\d{2}-\d{2}-\d{4}\.tar\.gz"/);
  exported = res.bytes;

  // What's inside: the database, the key in use, uploads, and a manifest.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-export-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'backup.tar.gz'), exported);
  const contents = path.join(dir, 'contents');
  fs.mkdirSync(contents);
  extractArchive(path.join(dir, 'backup.tar.gz'), contents);
  const manifest = JSON.parse(fs.readFileSync(path.join(contents, 'manifest.json'), 'utf8'));
  assert.equal(manifest.app, 'homeglow');
  assert.equal(manifest.encryptionKeySource, 'env');
  assert.ok(fs.existsSync(path.join(contents, 'tasks.db')));
  assert.equal(fs.readFileSync(path.join(contents, '.encryption-key'), 'utf8').trim(), KEY_A);
  assert.ok(fs.existsSync(path.join(contents, 'uploads')));
  assert.deepEqual(fs.readdirSync(server.dataDir).filter((name) => name.startsWith('export-')), [], 'nothing left behind');

  assert.equal((await server.post('/api/admin-pin/set', { pin: '2468' })).status, 200);
  assert.equal((await server.exportBackup()).status, 403, 'no PIN');
  assert.equal((await server.exportBackup('1357')).status, 403, 'a wrong PIN');
  assert.equal((await server.exportBackup('2468')).status, 200);
});

test('import stages the file, one at a time, and can be cancelled; a file that is not a backup is refused', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());

  const bad = await server.importBackup(Buffer.from('not a backup'), 'notes.txt');
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /could not be read as a backup/);

  const staged = await server.importBackup(exported, 'homeglow-backup-test.tar.gz');
  assert.equal(staged.status, 200, JSON.stringify(staged.body));
  assert.equal(staged.body.staged.source, 'upload');
  assert.equal(staged.body.staged.name, 'homeglow-backup-test.tar.gz');
  const status = await server.get('/api/backup/drive/status');
  assert.equal(status.body.restore.staged.name, 'homeglow-backup-test.tar.gz');

  assert.equal((await server.importBackup(exported)).status, 409, 'one waiting restore at a time');
  assert.equal((await server.post('/api/backup/drive/restore/cancel')).status, 200);
  assert.equal((await server.get('/api/backup/drive/status')).body.restore.staged, null);
  assert.deepEqual(fs.readdirSync(server.dataDir).filter((name) => name.startsWith('import-')), [], 'the upload is not kept');
});

test('a backup made under another ENCRYPTION_KEY is refused, with what to do', async (t) => {
  const server = await startServer({ key: KEY_B });
  t.after(() => server.stop());
  const res = await server.importBackup(exported);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /ENCRYPTION_KEY/);
  assert.match(res.body.error, /\.encryption-key file inside the archive/);
});

test('the demo neither exports nor imports', async (t) => {
  const server = await startServer({ demo: true });
  t.after(() => server.stop());
  assert.equal((await server.exportBackup()).status, 403);
  assert.equal((await server.importBackup(exported)).status, 403);
});
