// A bonus chore can be offered to some people only (issue #403): its
// schedule carries `claim_user_ids`, a list of who may claim it from the
// pool, or null for everyone. The claim route enforces the list, a sticky
// chore's card follows its parent schedule's, an admin's own assignment is
// not held to it, and a deleted person comes off every list. The helper's
// rules first; then a real HomeGlow server on a throwaway database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');
const { parseClaimUserIds, normalizeClaimUserIds, mayClaim, withoutUser } = require('../utils/choreClaimers');

test('the stored list reads as user ids, or null for everyone', () => {
  assert.equal(parseClaimUserIds(null), null);
  assert.equal(parseClaimUserIds(''), null);
  assert.equal(parseClaimUserIds('[]'), null);
  assert.equal(parseClaimUserIds('not json'), null);
  assert.equal(parseClaimUserIds('{"a":1}'), null);
  assert.deepEqual(parseClaimUserIds('[3,4]'), [3, 4]);
  assert.deepEqual(parseClaimUserIds('[3,3,"x",0,-1,4]'), [3, 4]);
  assert.deepEqual(parseClaimUserIds([5]), [5]);
});

test('a sent list is checked before it is stored', () => {
  const known = (id) => [1, 2, 3].includes(id);
  assert.deepEqual(normalizeClaimUserIds(undefined, known), { value: null });
  assert.deepEqual(normalizeClaimUserIds(null, known), { value: null });
  assert.deepEqual(normalizeClaimUserIds([], known), { value: null });
  assert.deepEqual(normalizeClaimUserIds([2, '3', 2], known), { value: '[2,3]' });
  assert.match(normalizeClaimUserIds('2', known).error, /must be a list/);
  assert.match(normalizeClaimUserIds([0], known).error, /Invalid user id/);
  assert.match(normalizeClaimUserIds([1.5], known).error, /Invalid user id/);
  assert.match(normalizeClaimUserIds([9], known).error, /Unknown user id/);
});

test('everyone may claim without a list; only those listed with one', () => {
  assert.equal(mayClaim(null, 7), true);
  assert.equal(mayClaim('[]', 7), true);
  assert.equal(mayClaim('[7,8]', 7), true);
  assert.equal(mayClaim('[7,8]', '8'), true);
  assert.equal(mayClaim('[7,8]', 9), false);
});

test('taking someone off a list leaves the rest, or everyone', () => {
  assert.equal(withoutUser(null, 7), null);
  assert.equal(withoutUser('[7,8]', 7), '[8]');
  assert.equal(withoutUser('[7,8]', '8'), '[7]');
  assert.equal(withoutUser('[7]', 7), null);
  assert.equal(withoutUser('[7,8]', 9), '[7,8]');
});

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `bonus-chore-claimers-${process.pid}-${Date.now()}.db`);
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

const schedules = async () => (await api('/api/chore-schedules')).body;
const scheduleById = async (id) => (await schedules()).find((s) => s.id === id);

let people = 0;
async function makeKid() {
  people += 1;
  return (await post('/api/users', { username: `Kid ${people}`, email: `claimer${people}@example.com` })).body.id;
}
// A bonus chore in the pool: worth points, assigned to no one.
async function makePoolChore(title, fields = {}) {
  const chore = (await post('/api/chores', { title, clam_value: 2 })).body.id;
  const made = await post('/api/chore-schedules', { chore_id: chore, user_id: null, crontab: '0 0 * * *', ...fields });
  return { chore, made };
}
const claim = (scheduleId, kid) => post(`/api/chore-schedules/${scheduleId}/claim`, { user_id: kid });

test('a schedule made without a list is offered to everyone', async () => {
  const kid = await makeKid();
  const { made } = await makePoolChore('Sweep the porch');
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await scheduleById(made.body.id)).claim_user_ids, null);
  assert.equal((await api(`/api/chore-schedules/${made.body.id}`)).body.claim_user_ids, null);
  assert.equal((await claim(made.body.id, kid)).status, 200);
});

test('only someone on the list can claim it', async () => {
  const [listed, other] = [await makeKid(), await makeKid()];
  const { made } = await makePoolChore('Wash the car', { claim_user_ids: [listed] });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.deepEqual((await scheduleById(made.body.id)).claim_user_ids, [listed]);
  assert.deepEqual((await api(`/api/chore-schedules/${made.body.id}`)).body.claim_user_ids, [listed]);

  const refused = await claim(made.body.id, other);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'CHORE_NOT_OFFERED');
  assert.equal((await scheduleById(made.body.id)).user_id, null);

  assert.equal((await claim(made.body.id, listed)).status, 200);
  assert.equal((await scheduleById(made.body.id)).user_id, listed);
});

test('the list can be changed and cleared on an existing schedule', async () => {
  const [first, second] = [await makeKid(), await makeKid()];
  const { made } = await makePoolChore('Rake the leaves');

  assert.equal((await patch(`/api/chore-schedules/${made.body.id}`, { claim_user_ids: [first] })).status, 200);
  assert.deepEqual((await scheduleById(made.body.id)).claim_user_ids, [first]);
  assert.equal((await claim(made.body.id, second)).status, 403);

  // Another field changed alone leaves the list as it was.
  assert.equal((await patch(`/api/chore-schedules/${made.body.id}`, { can_snooze: 0 })).status, 200);
  assert.deepEqual((await scheduleById(made.body.id)).claim_user_ids, [first]);

  // null, or an empty list, is everyone again.
  assert.equal((await patch(`/api/chore-schedules/${made.body.id}`, { claim_user_ids: [] })).status, 200);
  assert.equal((await scheduleById(made.body.id)).claim_user_ids, null);
  assert.equal((await claim(made.body.id, second)).status, 200);
});

test('a list naming no real person is refused', async () => {
  const kid = await makeKid();
  const { made: unknown } = await makePoolChore('Feed the fish', { claim_user_ids: [999999] });
  assert.equal(unknown.status, 400, JSON.stringify(unknown.body));
  const { made: notAList } = await makePoolChore('Feed the cat', { claim_user_ids: String(kid) });
  assert.equal(notAList.status, 400, JSON.stringify(notAList.body));

  const { made } = await makePoolChore('Feed the dog');
  const bad = await patch(`/api/chore-schedules/${made.body.id}`, { claim_user_ids: [0] });
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
  assert.equal((await scheduleById(made.body.id)).claim_user_ids, null);
});

test('a sticky bonus chore\'s card follows its schedule\'s list', async () => {
  const [listed, other] = [await makeKid(), await makeKid()];
  const { made } = await makePoolChore('Vacuum the stairs', { duration: 'until-completed', claim_user_ids: [listed] });
  assert.equal(made.status, 200, JSON.stringify(made.body));

  // Made today and firing today, its card is on the dashboard at once.
  const card = (await schedules()).find((s) => s.parent_schedule_id === made.body.id);
  assert.ok(card, 'the sticky schedule has a card today');
  assert.deepEqual(card.claim_user_ids, [listed]);
  assert.equal((await claim(card.id, other)).status, 403);

  // Changing the schedule changes the card already out.
  assert.equal((await patch(`/api/chore-schedules/${made.body.id}`, { claim_user_ids: [other] })).status, 200);
  assert.deepEqual((await scheduleById(card.id)).claim_user_ids, [other]);
  assert.equal((await claim(card.id, listed)).status, 403);
  assert.equal((await claim(card.id, other)).status, 200);
});

test('an admin can still assign it to someone not on the list', async () => {
  const [listed, other] = [await makeKid(), await makeKid()];
  const { made } = await makePoolChore('Water the garden', { claim_user_ids: [listed] });
  const assigned = await patch(`/api/chore-schedules/${made.body.id}`, { user_id: other, visible: 1 });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  const row = await scheduleById(made.body.id);
  assert.equal(row.user_id, other);
  assert.deepEqual(row.claim_user_ids, [listed]);
});

test('a deleted person comes off every list, and an emptied list is everyone', async () => {
  const [leaving, staying, other] = [await makeKid(), await makeKid(), await makeKid()];
  const { made: shared } = await makePoolChore('Fold the laundry', { claim_user_ids: [leaving, staying] });
  const { made: theirs } = await makePoolChore('Tidy the shed', { claim_user_ids: [leaving] });

  assert.equal((await api(`/api/users/${leaving}`, { method: 'DELETE' })).status, 200);

  assert.deepEqual((await scheduleById(shared.body.id)).claim_user_ids, [staying]);
  assert.equal((await scheduleById(theirs.body.id)).claim_user_ids, null);
  assert.equal((await claim(theirs.body.id, other)).status, 200);
});
