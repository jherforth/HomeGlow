import { describe, expect, it } from 'vitest';
import { expiryOf, isExpired } from './choreExpiry.js';

// The same cases as server/tests/choreExpiry.test.js: the two rules must agree.
const daily = { crontab: '0 0 * * *', due_time: '07:30', expire_minutes: 30 };
const at = (date, hhmm) => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });

describe('chore expiry', () => {
  it('never expires without a due time or an expiry', () => {
    expect(expiryOf({ ...daily, due_time: null }, '2026-10-14')).toBeNull();
    expect(expiryOf({ ...daily, expire_minutes: null }, '2026-10-14')).toBeNull();
    expect(isExpired({ ...daily, expire_minutes: null }, '2026-10-14', at('2026-10-20', '23:00'))).toBe(false);
  });

  it('expires the minute after due time plus the buffer', () => {
    expect(expiryOf(daily, '2026-10-14')).toEqual(at('2026-10-14', '08:00'));
    expect(isExpired(daily, '2026-10-14', at('2026-10-14', '08:00'))).toBe(false);
    expect(isExpired(daily, '2026-10-14', at('2026-10-14', '08:01'))).toBe(true);
    expect(isExpired({ ...daily, expire_minutes: 0 }, '2026-10-14', at('2026-10-14', '07:31'))).toBe(true);
  });

  it('lets a buffer run past midnight', () => {
    const late = { ...daily, due_time: '22:00', expire_minutes: 240 };
    expect(expiryOf(late, '2026-10-14')).toEqual(at('2026-10-15', '02:00'));
    expect(isExpired(late, '2026-10-14', at('2026-10-14', '23:59'))).toBe(false);
    expect(isExpired(late, '2026-10-14', at('2026-10-15', '02:01'))).toBe(true);
  });

  it('expires a one-time chore on its due date; a past day has expired', () => {
    const once = { crontab: null, due_date: '2026-10-16', due_time: '18:00', expire_minutes: 60 };
    expect(expiryOf(once, '2026-10-14')).toEqual(at('2026-10-16', '19:00'));
    expect(isExpired(once, '2026-10-14', at('2026-10-15', '20:00'))).toBe(false);
    expect(isExpired(daily, '2026-10-13', at('2026-10-14', '06:00'))).toBe(true);
  });
});
