// Transferring an assigned chore back to the bonus pool, end to end: a real
// HomeGlow server on a throwaway database. The widget's Transfer dialog used
// to offer only real users, so an assigned chore could never go back to
// bonus from the wall display — while the API itself already accepted it
// (PATCH user_id 0 stores NULL, which is how the bonus pool is read).
// This test pins the API half of that round trip: person -> bonus -> person.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `chore-transfer-back-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
let baseUrl;
let serverProcess;
let serverLogs = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });

test.before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: testDbPath, TZ: 'UTC',
      ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1', HOMEGLOW_DISABLE_CALENDAR_SYNC: '1', HOMEGLOW_DISABLE_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk; });
  serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk; });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if ((await fetch(`${baseUrl}/api/test`)).ok) break; } catch { /* starting */ }
    await delay(250);
  }
});

const stopServer = () => new Promise((resolve) => {
  if (!serverProcess || serverProcess.exitCode !== null) return resolve();
  serverProcess.once('close', resolve);
  serverProcess.kill();
  setTimeout(resolve, 5000);
});

test.after(async () => {
  await stopServer();
  if (process.exitCode && serverLogs) console.error(serverLogs.slice(-4000));
  if (!keepTestArtifacts) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }
});

const scheduleById = async (id) => (await api('/api/chore-schedules')).body.find((s) => s.id === id);

test('an assigned chore transfers back to bonus and stays claimable', async () => {
  const kid = (await post('/api/users', { username: 'Leo', email: 'leo@example.com' })).body.id;
  const chore = (await post('/api/chores', { title: 'Take out trash', clam_value: 2 })).body.id;
  const made = await post('/api/chore-schedules', { chore_id: chore, user_id: kid, crontab: '0 0 * * *' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.id;
  assert.equal((await scheduleById(id)).user_id, kid);

  // Back to bonus: the API stores NULL for user_id 0, which is exactly how
  // the widget reads the bonus pool (user_id null or 0).
  assert.equal((await patch(`/api/chore-schedules/${id}`, { user_id: 0 })).status, 200);
  assert.equal((await scheduleById(id)).user_id, null);

  // ...and back out again: a bonus chore is still claimable by a person.
  assert.equal((await patch(`/api/chore-schedules/${id}`, { user_id: kid })).status, 200);
  assert.equal((await scheduleById(id)).user_id, kid);
});
