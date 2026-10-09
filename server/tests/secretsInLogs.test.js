// No secret reaches the server's output at info, the level an operator turns
// on to see requests (ram/HomeGlow #15). (debug and trace add the SQL trace,
// which prints statements with their values by design.) Each route below used to log one: the settings reads
// dumped every row before redaction, the settings write logged the value, the
// API-key test logged the key, and the proxy logged request headers and a
// preview of the response.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { freePort } = require('./freePort');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `secrets-in-logs-${process.pid}-${Date.now()}.db`);
let port;
let baseUrl;

// Ask the OS for a free port: a port picked from a fixed range can be one
// another program holds on 127.0.0.1, and then every request reaches it.
async function usePort() {
  port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
}

// One distinct secret per route, so a failure names the route that leaked.
const SECRETS = {
  saved: 'owm-key-saved-0f3a9c',
  tested: 'owm-key-tested-7b21e4',
  header: 'bearer-in-header-55d0aa',
  query: 'token-in-query-91c3f2',
  body: 'token-in-response-e8b417',
};

let serverProcess;
let serverLogs = '';
let target;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServerReady(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${baseUrl}/api/test`)).ok) return;
    } catch {
      // Still starting.
    }
    await delay(250);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

const post = (pathname, body) => fetch(`${baseUrl}${pathname}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test.before(async () => {
  await usePort();
  fs.mkdirSync(tmpDir, { recursive: true });
  // A proxy target whose answer carries a token.
  target = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ access_token: SECRETS.body }));
  });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));

  serverProcess = spawn('node', ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: testDbPath,
      TZ: 'UTC',
      LOG_LEVEL: 'info',
      HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
      HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
      ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
  serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
  await waitForServerReady();
});

test.after(async () => {
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.once('exit', resolve));
  }
  await new Promise((resolve) => target.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
});

test('saving, reading and searching settings never logs a secret value', async () => {
  assert.equal((await post('/api/settings', { key: 'WEATHER_API_KEY', value: SECRETS.saved })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/settings`)).status, 200);
  // The Admin Panel opens with this exact search.
  assert.equal((await post('/api/settings/search', ['*'])).status, 200);
  await delay(300);
  // Positive control: the routes did log, at this level, and we captured it.
  assert.match(serverLogs, /=== SAVING SETTING === Key: WEATHER_API_KEY/);
  assert.match(serverLogs, /=== FETCHING SETTINGS ===/);
  assert.match(serverLogs, /=== SEARCHING SETTINGS ===/);
  assert.ok(!serverLogs.includes(SECRETS.saved), 'the saved WEATHER_API_KEY value reached the log');
});

test('the API-key test logs neither the key nor the row it reads back', async () => {
  assert.equal((await post('/api/test-api-key', { apiKey: SECRETS.tested })).status, 200);
  await delay(300);
  assert.match(serverLogs, /=== TESTING API KEY SAVE ===/);
  assert.ok(!serverLogs.includes(SECRETS.tested), 'the tested API key reached the log');
});

test('the proxy logs host and status, not headers, query or response', async () => {
  assert.equal((await post('/api/settings', { key: 'PROXY_WHITELIST', value: '127.0.0.1' })).status, 200);
  const url = `http://127.0.0.1:${target.address().port}/data?token=${SECRETS.query}`;
  const response = await fetch(`${baseUrl}/api/proxy?targetUrl=${encodeURIComponent(url)}`, {
    headers: { Authorization: `Bearer ${SECRETS.header}`, Cookie: `session=${SECRETS.header}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).access_token, SECRETS.body); // the caller still gets the answer
  await delay(300);
  assert.match(serverLogs, /Proxy: 127\.0\.0\.1 answered 200/);
  // Request lines still name the route, just without the query string.
  assert.match(serverLogs, /"url":"\/api\/proxy"/);
  for (const name of ['header', 'query', 'body']) {
    assert.ok(!serverLogs.includes(SECRETS[name]), `the proxy's ${name} secret reached the log`);
  }
});
