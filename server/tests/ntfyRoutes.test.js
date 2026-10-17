// ntfy, end to end: a real HomeGlow server on a throwaway database, and a
// stand-in ntfy server that keeps what is published to it (issue #288).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `ntfy-routes-${process.pid}-${Date.now()}.db`);
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
const put = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body) });
const del = (p) => api(p, { method: 'DELETE' });


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

const http = require('node:http');

// A stand-in ntfy server: every publish is kept.
const published = [];
let ntfyServer;
let ntfyUrl;
let refuse = false;

test.before(async () => {
  ntfyServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (refuse) { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"error":"forbidden"}'); return; }
      published.push({ path: req.url, auth: req.headers.authorization || null, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"id":"x"}');
    });
  });
  const port = await freePort();
  await new Promise((resolve) => ntfyServer.listen(port, '127.0.0.1', resolve));
  ntfyUrl = `http://127.0.0.1:${port}`;
});
test.after(() => new Promise((resolve) => ntfyServer.close(resolve)));

const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) });

test('ntfy is off until turned on; the token never leaves the server', async () => {
  const status = await api('/api/connections/ntfy/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.enabled, false);
  assert.equal(status.body.server, 'https://ntfy.sh');

  const saved = await put('/api/connections/ntfy', { enabled: true, server: ntfyUrl, token: 'tk_route_secret', open_url: 'http://homeglow.lan:3000' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.hasToken, true);
  for (const res of [saved, await api('/api/connections/ntfy/status'), await api('/api/settings')]) {
    assert.ok(!JSON.stringify(res.body).includes('tk_route_secret'), 'no token in the response');
  }
  const settings = (await api('/api/settings')).body;
  assert.equal(settings.NTFY_TOKEN_ENC, undefined, 'the encrypted token is not handed to browsers either');

  assert.equal((await put('/api/connections/ntfy', { server: 'ftp://nope' })).status, 400);

  const tested = await post('/api/connections/ntfy/test', {});
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  assert.equal(published.at(-1).auth, 'Bearer tk_route_secret');
});

test('a topic is added, tested, hears a finished chore, and is removed', async () => {
  const kid = (await post('/api/users', { username: 'Ava', email: 'ava@example.com' })).body.id;
  const made = await post('/api/ntfy-topics', { label: "Mom's phone", topic: 'homeglow-route-mom', language: 'en' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await post('/api/ntfy-topics', { label: 'Again', topic: 'homeglow-route-mom' })).status, 400);
  assert.equal((await post('/api/ntfy-topics', { label: 'Bad', topic: 'has spaces' })).status, 400);

  const listed = await api('/api/ntfy-topics');
  assert.equal(listed.body.enabled, true);
  assert.deepEqual(listed.body.topics.map((t) => t.topic), ['homeglow-route-mom']);

  published.length = 0;
  assert.equal((await post(`/api/ntfy-topics/${made.body.id}/test`, {})).status, 200);
  assert.equal(published[0].body.topic, 'homeglow-route-mom');
  assert.equal(published[0].body.title, 'Notifications are working');

  // A real completion, through the chore routes.
  const chore = (await post('/api/chores', { title: 'Feed the cat', clam_value: 2 })).body.id;
  const schedule = (await post('/api/chore-schedules', { chore_id: chore, user_id: kid, crontab: '0 0 * * *' })).body.id;
  published.length = 0;
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await post('/api/chores/complete', { chore_schedule_id: schedule, user_id: kid, date: today })).status, 200);
  for (let i = 0; i < 40 && !published.some((p) => p.body.title === 'Ava finished Feed the cat'); i += 1) await delay(50);
  const message = published.find((p) => p.body.title === 'Ava finished Feed the cat');
  assert.ok(message, JSON.stringify(published));
  assert.equal(message.body.topic, 'homeglow-route-mom');
  assert.equal(message.body.message, '+2 clams');
  assert.equal(message.body.click, 'http://homeglow.lan:3000/');

  // Only about Leo now: Ava's next chore isn't sent.
  const leo = (await post('/api/users', { username: 'Leo', email: 'leo@example.com' })).body.id;
  assert.equal((await patch(`/api/ntfy-topics/${made.body.id}`, { members: [leo] })).status, 200);

  // A refused publish is recorded on the topic.
  refuse = true;
  const failed = await post(`/api/ntfy-topics/${made.body.id}/test`, {});
  refuse = false;
  assert.equal(failed.status, 502);
  assert.match((await api('/api/ntfy-topics')).body.topics[0].lastFailure, /refused the access token/);

  assert.equal((await del(`/api/ntfy-topics/${made.body.id}`)).status, 200);
  assert.equal((await api('/api/ntfy-topics')).body.topics.length, 0);
});

test('turned off, the topics are kept but nothing is sent', async () => {
  const made = await post('/api/ntfy-topics', { label: 'Kept', topic: 'homeglow-route-kept' });
  assert.equal((await put('/api/connections/ntfy', { enabled: false })).status, 200);
  assert.equal((await post(`/api/ntfy-topics/${made.body.id}/test`, {})).status, 400);
  assert.equal((await api('/api/ntfy-topics')).body.topics.length, 1);
});
