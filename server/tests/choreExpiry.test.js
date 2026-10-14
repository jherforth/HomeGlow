const test = require('node:test');
const assert = require('node:assert/strict');
const { expiryOf, isExpired, normalizeExpireMinutes } = require('../utils/choreExpiry');

const daily = { crontab: '0 0 * * *', due_time: '07:30', expire_minutes: 30 };
const at = (date, hhmm) => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });

test('no due time or no expiry: never expires', () => {
  assert.equal(expiryOf({ ...daily, due_time: null }, '2026-10-14'), null);
  assert.equal(expiryOf({ ...daily, expire_minutes: null }, '2026-10-14'), null);
  assert.equal(isExpired({ ...daily, expire_minutes: null }, '2026-10-14', at('2026-10-20', '23:00')), false);
});

test('expires the minute after due time plus the buffer', () => {
  assert.deepEqual(expiryOf(daily, '2026-10-14'), at('2026-10-14', '08:00'));
  assert.equal(isExpired(daily, '2026-10-14', at('2026-10-14', '08:00')), false);
  assert.equal(isExpired(daily, '2026-10-14', at('2026-10-14', '08:01')), true);
  // At the due time.
  assert.equal(isExpired({ ...daily, expire_minutes: 0 }, '2026-10-14', at('2026-10-14', '07:31')), true);
});

test('a buffer can run past midnight', () => {
  const late = { ...daily, due_time: '22:00', expire_minutes: 240 };
  assert.deepEqual(expiryOf(late, '2026-10-14'), at('2026-10-15', '02:00'));
  assert.equal(isExpired(late, '2026-10-14', at('2026-10-14', '23:59')), false);
  assert.equal(isExpired(late, '2026-10-14', at('2026-10-15', '02:01')), true);
});

test('a one-time chore with a due date expires on that day; a past day has expired', () => {
  const once = { crontab: null, due_date: '2026-10-16', due_time: '18:00', expire_minutes: 60 };
  assert.deepEqual(expiryOf(once, '2026-10-14'), at('2026-10-16', '19:00'));
  assert.equal(isExpired(once, '2026-10-14', at('2026-10-15', '20:00')), false);
  assert.equal(isExpired(daily, '2026-10-13', at('2026-10-14', '06:00')), true, 'yesterday\'s is past');
});

test('only the offered buffers are accepted', () => {
  assert.deepEqual(normalizeExpireMinutes(''), { valid: true, value: null });
  assert.deepEqual(normalizeExpireMinutes('60'), { valid: true, value: 60 });
  assert.equal(normalizeExpireMinutes(45).valid, false);
});
