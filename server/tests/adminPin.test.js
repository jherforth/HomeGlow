// The admin PIN's storage and its limit on wrong guesses (mrramam/HomeGlow#62).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const adminPin = require('../utils/adminPin');

// Just enough of the database for the admin_pin row.
function fakeDb(pinHash = null) {
  const row = { pin_hash: pinHash };
  return {
    row,
    prepare(query) {
      if (query.startsWith('SELECT pin_hash')) return { get: () => (row.pin_hash ? { pin_hash: row.pin_hash } : undefined) };
      if (query.includes('INSERT INTO admin_pin')) return { run: (hash) => { row.pin_hash = hash; } };
      throw new Error(`Unexpected query: ${query}`);
    },
  };
}

const sha256 = (pin) => crypto.createHash('sha256').update(pin).digest('hex');

test.beforeEach(() => adminPin.resetPinAttempts());

test('a PIN is stored as salted scrypt, never as itself', async () => {
  const a = await adminPin.hashPin('1234');
  const b = await adminPin.hashPin('1234');
  assert.match(a, /^scrypt\$[\w-]+\$[\w-]+$/);
  assert.notEqual(a, b, 'a fresh salt each time');
  assert.ok(!a.includes('1234'));
  assert.equal(await adminPin.pinMatchesHash('1234', a), true);
  assert.equal(await adminPin.pinMatchesHash('1235', a), false);
});

test('a PIN saved by an older version (unsalted SHA-256) still matches', async () => {
  assert.equal(await adminPin.pinMatchesHash('1234', sha256('1234')), true);
  assert.equal(await adminPin.pinMatchesHash('4321', sha256('1234')), false);
  assert.equal(await adminPin.pinMatchesHash('1234', 'scrypt$broken'), false);
  assert.equal(await adminPin.pinMatchesHash(1234, sha256('1234')), false);
});

test('the right legacy PIN is rehashed as scrypt; a wrong one leaves it alone', async () => {
  const db = fakeDb(sha256('2468'));
  assert.deepEqual(await adminPin.checkAdminPin(db, '1111'), { ok: false, reason: 'wrong' });
  assert.equal(db.row.pin_hash, sha256('2468'));
  assert.deepEqual(await adminPin.checkAdminPin(db, '2468'), { ok: true });
  assert.match(db.row.pin_hash, /^scrypt\$/);
  assert.deepEqual(await adminPin.checkAdminPin(db, '2468'), { ok: true });
});

test('no PIN set lets everything through; a missing PIN is not a guess', async () => {
  assert.deepEqual(await adminPin.checkAdminPin(fakeDb(), undefined), { ok: true, noPin: true });
  const db = fakeDb(await adminPin.hashPin('1234'));
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(await adminPin.checkAdminPin(db, undefined), { ok: false, reason: 'missing' });
  }
  assert.deepEqual(await adminPin.checkAdminPin(db, '1234'), { ok: true });
});

test('after five wrong guesses even the right PIN waits, longer each time', async () => {
  const db = fakeDb(await adminPin.hashPin('1234'));
  const t0 = 1_000_000;
  for (let i = 0; i < adminPin.FREE_ATTEMPTS - 1; i += 1) {
    assert.equal((await adminPin.checkAdminPin(db, '0000', t0)).reason, 'wrong');
  }
  assert.equal((await adminPin.checkAdminPin(db, '0000', t0)).reason, 'wrong', 'the fifth still answers');

  const locked = await adminPin.checkAdminPin(db, '1234', t0 + 1000);
  assert.deepEqual(locked, { ok: false, reason: 'locked', retryAfterSeconds: 29 });

  // The next wrong guess after the wait doubles it.
  assert.equal((await adminPin.checkAdminPin(db, '0000', t0 + 30_000)).reason, 'wrong');
  assert.equal((await adminPin.checkAdminPin(db, '1234', t0 + 30_000 + 59_000)).reason, 'locked');

  // The right PIN once the wait is over clears the count.
  assert.deepEqual(await adminPin.checkAdminPin(db, '1234', t0 + 30_000 + 60_000), { ok: true });
  assert.equal((await adminPin.checkAdminPin(db, '0000', t0 + 100_000)).reason, 'wrong');
  assert.deepEqual(await adminPin.checkAdminPin(db, '1234', t0 + 100_000), { ok: true });
});

test('the wait stops growing at five minutes', async () => {
  const db = fakeDb(await adminPin.hashPin('1234'));
  let now = 0;
  const waits = [];
  for (let i = 0; i < 15; i += 1) {
    assert.equal((await adminPin.checkAdminPin(db, '0000', now)).reason, 'wrong');
    // Asking with no PIN reports a wait without counting as a guess.
    const locked = await adminPin.checkAdminPin(db, undefined, now);
    if (locked.reason === 'locked') {
      waits.push(locked.retryAfterSeconds);
      now += locked.retryAfterSeconds * 1000;
    }
  }
  assert.deepEqual(waits.slice(0, 5), [30, 60, 120, 240, 300]);
  assert.ok(waits.every((wait) => wait <= 300), waits.join(','));
});
