// A bonus chore can be offered to some people only (issue #403): the chore
// carries `claim_user_ids`, a list of who may take it, null for everyone or
// an empty list for nobody. The claim route enforces the list, and so does a
// transfer made from the dashboard; every schedule of the chore and a sticky
// chore's card follow it, an admin's own assignment is not held to it, and a
// deleted person comes off every list. The helper's rules first; then a real
// HomeGlow server on a throwaway database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePort } = require('./freePort');
const { parseClaimUserIds, normalizeClaimUserIds, mayClaim, withoutUser } = require('../utils/choreClaimers');

test('the stored list reads as user ids, null for everyone, empty for nobody', () => {
  assert.equal(parseClaimUserIds(null), null);
  assert.equal(parseClaimUserIds(''), null);
  assert.equal(parseClaimUserIds('not json'), null);
  assert.equal(parseClaimUserIds('{"a":1}'), null);
  assert.deepEqual(parseClaimUserIds('[]'), []);
  assert.deepEqual(parseClaimUserIds('[3,4]'), [3, 4]);
  assert.deepEqual(parseClaimUserIds('[3,3,"x",0,-1,4]'), [3, 4]);
  assert.deepEqual(parseClaimUserIds([5]), [5]);
});

test('a sent list is checked before it is stored', () => {
  const known = (id) => [1, 2, 3].includes(id);
  assert.deepEqual(normalizeClaimUserIds(undefined, known), { value: null });
  assert.deepEqual(normalizeClaimUserIds(null, known), { value: null });
  assert.deepEqual(normalizeClaimUserIds([], known), { value: '[]' });
  assert.deepEqual(normalizeClaimUserIds([2, '3', 2], known), { value: '[2,3]' });
  assert.match(normalizeClaimUserIds('2', known).error, /must be a list/);
  assert.match(normalizeClaimUserIds([0], known).error, /Invalid user id/);
  assert.match(normalizeClaimUserIds([1.5], known).error, /Invalid user id/);
  assert.match(normalizeClaimUserIds([9], known).error, /Unknown user id/);
});

test('everyone may claim without a list; only those listed with one', () => {
  assert.equal(mayClaim(null, 7), true);
  assert.equal(mayClaim('[]', 7), false);
  assert.equal(mayClaim('[7,8]', 7), true);
  assert.equal(mayClaim('[7,8]', '8'), true);
  assert.equal(mayClaim('[7,8]', 9), false);
});

test('taking someone off a list leaves the rest, or nobody', () => {
  assert.equal(withoutUser(null, 7), null);
  assert.equal(withoutUser('[7,8]', 7), '[8]');
  assert.equal(withoutUser('[7,8]', '8'), '[7]');
  assert.equal(withoutUser('[7]', 7), '[]');
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
const choreById = async (id) => (await api('/api/chores')).body.find((c) => c.id === id);

let people = 0;
async function makeKid() {
  people += 1;
  return (await post('/api/users', { username: `Kid ${people}`, email: `claimer${people}@example.com` })).body.id;
}
// A bonus chore in the pool: worth points, assigned to no one. `choreFields`
// go on the chore (the list lives there), `scheduleFields` on its schedule.
async function makePoolChore(title, choreFields = {}, scheduleFields = {}) {
  const made = await post('/api/chores', { title, clam_value: 2, ...choreFields });
  const chore = made.body?.id;
  const schedule = made.status === 200
    ? (await post('/api/chore-schedules', { chore_id: chore, user_id: null, crontab: '0 0 * * *', ...scheduleFields })).body.id
    : undefined;
  return { made, chore, schedule };
}
// The chore dialog's save: PATCH sends the chore whole.
const saveChore = (id, title, fields = {}) => patch(`/api/chores/${id}`, { title, description: '', clam_value: 2, icon: '', ...fields });
const claim = (scheduleId, kid) => post(`/api/chore-schedules/${scheduleId}/claim`, { user_id: kid });
// The widget's Transfer dialog, and an admin assigning by hand: the same
// PATCH, told apart by `transfer`.
const transfer = (scheduleId, kid) => patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1, transfer: true });
const assign = (scheduleId, kid) => patch(`/api/chore-schedules/${scheduleId}`, { user_id: kid, visible: 1 });

test('a chore made without a list is offered to everyone', async () => {
  const kid = await makeKid();
  const { made, chore, schedule } = await makePoolChore('Sweep the porch');
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await choreById(chore)).claim_user_ids, null);
  assert.equal((await scheduleById(schedule)).claim_user_ids, null);
  assert.equal((await api(`/api/chore-schedules/${schedule}`)).body.claim_user_ids, null);
  assert.equal((await claim(schedule, kid)).status, 200);
});

test('only someone on the list can claim it', async () => {
  const [listed, other] = [await makeKid(), await makeKid()];
  const { made, chore, schedule } = await makePoolChore('Wash the car', { claim_user_ids: [listed] });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.deepEqual((await choreById(chore)).claim_user_ids, [listed]);
  assert.deepEqual((await scheduleById(schedule)).claim_user_ids, [listed]);
  assert.deepEqual((await api(`/api/chore-schedules/${schedule}`)).body.claim_user_ids, [listed]);

  const refused = await claim(schedule, other);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'CHORE_NOT_OFFERED');
  assert.equal((await scheduleById(schedule)).user_id, null);

  const claimed = await claim(schedule, listed);
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  assert.deepEqual(claimed.body.claim_user_ids, [listed]);
  assert.equal((await scheduleById(schedule)).user_id, listed);
});

test('the list can be changed and cleared on an existing chore', async () => {
  const [first, second] = [await makeKid(), await makeKid()];
  const { chore, schedule } = await makePoolChore('Rake the leaves');

  assert.equal((await saveChore(chore, 'Rake the leaves', { claim_user_ids: [first] })).status, 200);
  assert.deepEqual((await scheduleById(schedule)).claim_user_ids, [first]);
  assert.equal((await claim(schedule, second)).status, 403);

  // Saved without the field, the list stays as it was.
  assert.equal((await saveChore(chore, 'Rake all the leaves')).status, 200);
  assert.deepEqual((await choreById(chore)).claim_user_ids, [first]);

  // null is everyone again.
  assert.equal((await saveChore(chore, 'Rake all the leaves', { claim_user_ids: null })).status, 200);
  assert.equal((await choreById(chore)).claim_user_ids, null);
  assert.equal((await claim(schedule, second)).status, 200);
});

test('a list naming no real person is refused', async () => {
  const kid = await makeKid();
  const { made: unknown } = await makePoolChore('Feed the fish', { claim_user_ids: [999999] });
  assert.equal(unknown.status, 400, JSON.stringify(unknown.body));
  const { made: notAList } = await makePoolChore('Feed the cat', { claim_user_ids: String(kid) });
  assert.equal(notAList.status, 400, JSON.stringify(notAList.body));

  const { chore } = await makePoolChore('Feed the dog');
  const bad = await saveChore(chore, 'Feed the dog', { claim_user_ids: [0] });
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
  assert.equal((await choreById(chore)).claim_user_ids, null);
});

test('every schedule of the chore follows its list, a sticky card too', async () => {
  const [listed, other] = [await makeKid(), await makeKid()];
  const { chore, schedule } = await makePoolChore('Vacuum the stairs', { claim_user_ids: [listed] }, { duration: 'until-completed' });
  const second = (await post('/api/chore-schedules', { chore_id: chore, user_id: null, crontab: '0 0 * * *' })).body.id;

  // Made today and firing today, the sticky schedule's card is out at once.
  const card = (await schedules()).find((s) => s.parent_schedule_id === schedule);
  assert.ok(card, 'the sticky schedule has a card today');
  assert.deepEqual(card.claim_user_ids, [listed]);
  assert.equal((await claim(card.id, other)).status, 403);
  assert.equal((await claim(second, other)).status, 403);

  // Changing the chore changes the card already out.
  assert.equal((await saveChore(chore, 'Vacuum the stairs', { claim_user_ids: [other] })).status, 200);
  assert.deepEqual((await scheduleById(card.id)).claim_user_ids, [other]);
  assert.equal((await claim(card.id, listed)).status, 403);
  assert.equal((await claim(card.id, other)).status, 200);
});

test('a transfer from the dashboard is held to the list', async () => {
  const [listed, alsoListed, other] = [await makeKid(), await makeKid(), await makeKid()];
  const { schedule } = await makePoolChore('Mow the lawn', { claim_user_ids: [listed, alsoListed] });
  assert.equal((await claim(schedule, listed)).status, 200);

  const refused = await transfer(schedule, other);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'CHORE_NOT_OFFERED');
  assert.equal((await scheduleById(schedule)).user_id, listed);

  assert.equal((await transfer(schedule, alsoListed)).status, 200);
  assert.equal((await scheduleById(schedule)).user_id, alsoListed);

  // Back to the pool is always allowed.
  assert.equal((await transfer(schedule, 0)).status, 200);
  assert.equal((await scheduleById(schedule)).user_id, null);
});

test('a list on a chore worth no points holds no one back', async () => {
  const [listed, other] = [await makeKid(), await makeKid()];
  const { schedule } = await makePoolChore('Set the table', { clam_value: 0, claim_user_ids: [listed] });
  assert.equal((await assign(schedule, listed)).status, 200);
  assert.equal((await transfer(schedule, other)).status, 200);
  assert.equal((await scheduleById(schedule)).user_id, other);
});

test('an admin can still assign it to someone not on the list', async () => {
  const [listed, other] = [await makeKid(), await makeKid()];
  const { schedule } = await makePoolChore('Water the garden', { claim_user_ids: [listed] });
  const assigned = await assign(schedule, other);
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  const row = await scheduleById(schedule);
  assert.equal(row.user_id, other);
  assert.deepEqual(row.claim_user_ids, [listed]);
});

test('a deleted person comes off every list, and an emptied list is nobody', async () => {
  const [leaving, staying, other] = [await makeKid(), await makeKid(), await makeKid()];
  const { chore: shared } = await makePoolChore('Fold the laundry', { claim_user_ids: [leaving, staying] });
  const { chore: theirs, schedule } = await makePoolChore('Tidy the shed', { claim_user_ids: [leaving] });
  const { chore: open } = await makePoolChore('Dust the shelves');

  assert.equal((await api(`/api/users/${leaving}`, { method: 'DELETE' })).status, 200);

  assert.deepEqual((await choreById(shared)).claim_user_ids, [staying]);
  assert.equal((await choreById(open)).claim_user_ids, null);
  // Nobody, not everyone: it waits for an admin to pick again.
  assert.deepEqual((await choreById(theirs)).claim_user_ids, []);
  assert.deepEqual((await scheduleById(schedule)).claim_user_ids, []);
  assert.equal((await claim(schedule, other)).status, 403);

  // Saved again untouched (the dialog sends the empty list back), it stays
  // nobody; picking someone opens it to them.
  assert.equal((await saveChore(theirs, 'Tidy the shed', { claim_user_ids: [] })).status, 200);
  assert.deepEqual((await choreById(theirs)).claim_user_ids, []);
  assert.equal((await saveChore(theirs, 'Tidy the shed', { claim_user_ids: [other] })).status, 200);
  assert.equal((await claim(schedule, other)).status, 200);
});
