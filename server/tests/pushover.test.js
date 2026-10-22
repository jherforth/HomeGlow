// Pushover (services/pushover.js): keys kept encrypted and checked, what a
// message carries, and what "urgent" and "clear" become. Pushover itself is
// stubbed; the routes are tested against a stand-in in pluginNotifyRoutes.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
const pushover = require('../services/pushover');

const TOKEN = 'azGDORePK8gMaC0QOYAMyEEuzJnyUi';
const USER = 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG';

function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        get: (key) => (rows.has(key) ? { value: rows.get(key) } : undefined),
        run: (key, value) => { if (/INSERT OR REPLACE/.test(sql)) rows.set(key, value); },
      };
    },
  };
}

function stub(answers) {
  const calls = [];
  const original = pushover.pushoverFetch;
  pushover.pushoverFetch = async (apiPath, fields) => {
    calls.push({ apiPath, fields });
    const answer = typeof answers === 'function' ? answers(apiPath, fields) : answers;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, restore: () => { pushover.pushoverFetch = original; } };
}

test('keys are checked, stored encrypted, written blind and never reported', () => {
  const db = fakeDb();
  assert.deepEqual(pushover.getStatus(db), { has_token: false, has_user: false, configured: false, encryption_configured: true });
  assert.throws(() => pushover.saveConfig(db, { token: 'too-short' }), /30 letters and numbers/);
  pushover.saveConfig(db, { token: TOKEN, user: USER });
  assert.equal(pushover.getStatus(db).configured, true);
  assert.ok(![...db.rows.values()].some((v) => v.includes(TOKEN) || v.includes(USER)), 'stored encrypted');
  pushover.saveConfig(db, { token: '', user: '  ' });
  assert.equal(pushover.getStatus(db).configured, true, 'blank leaves the keys as they are');
  pushover.clearConfig(db);
  assert.equal(pushover.getStatus(db).configured, false);
});

test('phones: each device on the account, or the whole group', async () => {
  const db = fakeDb();
  pushover.saveConfig(db, { token: TOKEN, user: USER });
  pushover._cache.devices = null;
  let s = stub({ status: 1, group: 0, devices: ['pixel8', 'iphone', 'bad device!'] });
  assert.deepEqual(await pushover.phones(db), [
    { id: 'pushover:pixel8', name: 'pixel8 (Pushover)', platform: null, via: 'pushover' },
    { id: 'pushover:iphone', name: 'iphone (Pushover)', platform: null, via: 'pushover' },
  ]);
  assert.deepEqual(s.calls[0], { apiPath: 'users/validate.json', fields: { token: TOKEN, user: USER } });
  await pushover.phones(db);
  assert.equal(s.calls.length, 1, 'asked at most every minute');
  s.restore();

  s = stub({ status: 1, group: 1, devices: [] });
  assert.deepEqual(await pushover.phones(db, { fresh: true }), [{ id: 'pushover', name: 'Pushover group', platform: null, via: 'pushover' }]);
  s.restore();
  assert.deepEqual(await pushover.phones(fakeDb()), [], 'not set up: none');
});

test('a message: text only, to the devices named; urgent is emergency priority with its tag', async () => {
  const db = fakeDb();
  pushover.saveConfig(db, { token: TOKEN, user: USER });
  const s = stub({ status: 1, request: 'r1' });
  await pushover.send(db, { phones: ['pushover:pixel8', 'pushover:iphone'], title: 'Grill', message: 'Brisket is 198°. Pull it at 200°.' });
  assert.deepEqual(s.calls[0], {
    apiPath: 'messages.json',
    fields: { token: TOKEN, user: USER, message: 'Brisket is 198°. Pull it at 200°.', title: 'Grill', device: 'pixel8,iphone', priority: 0 },
  });
  await pushover.send(db, { phones: ['pushover'], message: 'Grill is 310°, set to 250°.', urgent: true, tag: 'homeglow-grill-card-problem' });
  assert.deepEqual(s.calls[1].fields, {
    token: TOKEN, user: USER, message: 'Grill is 310°, set to 250°.', priority: 2, retry: 60, expire: 3600, tags: 'homeglow-grill-card-problem',
  });
  // Long text is trimmed; nothing to say is refused before Pushover.
  await pushover.send(db, { phones: ['pushover'], title: 't'.repeat(100), message: 'm'.repeat(500) });
  assert.equal(s.calls[2].fields.title.length, 60);
  assert.equal(s.calls[2].fields.message.length, 300);
  await assert.rejects(pushover.send(db, { phones: ['pushover'], message: '  ' }), /needs a message/);
  assert.equal(s.calls.length, 3);
  // Clearing stops an emergency message repeating.
  await pushover.cancel(db, 'homeglow-grill-card-problem');
  assert.deepEqual(s.calls[3], { apiPath: 'receipts/cancel_by_tag/homeglow-grill-card-problem.json', fields: { token: TOKEN } });
  s.restore();
});

test('Pushover\'s own refusal comes back in its words', async () => {
  const db = fakeDb();
  pushover.saveConfig(db, { token: TOKEN, user: USER });
  const s = stub(new pushover.PushoverError('user key is invalid', 400));
  await assert.rejects(pushover.sendTest(db), (e) => e.status === 400 && /user key is invalid/.test(e.message));
  s.restore();
  await assert.rejects(pushover.send(fakeDb(), { phones: ['pushover'], message: 'hi' }), (e) => e.status === 503);
});
