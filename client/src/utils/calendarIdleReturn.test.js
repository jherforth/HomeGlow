import { describe, it, expect } from 'vitest';
import {
  DEFAULT_IDLE_RETURN_MINUTES,
  MAX_IDLE_RETURN_MINUTES,
  MIN_IDLE_RETURN_MINUTES,
  normalizeIdleReturnMinutes,
  isIdleReturnEnabled,
  idleReturnTimeoutMs,
  isSameLocalCalendarDay,
} from './calendarIdleReturn.js';

describe('normalizeIdleReturnMinutes', () => {
  it('treats empty, null, undefined, NaN, and non-numeric as disabled (0)', () => {
    expect(normalizeIdleReturnMinutes('')).toBe(0);
    expect(normalizeIdleReturnMinutes(null)).toBe(0);
    expect(normalizeIdleReturnMinutes(undefined)).toBe(0);
    expect(normalizeIdleReturnMinutes('abc')).toBe(0);
    expect(normalizeIdleReturnMinutes(Number.NaN)).toBe(0);
    expect(normalizeIdleReturnMinutes(Infinity)).toBe(0);
  });

  it('treats 0 and negative values as disabled', () => {
    expect(normalizeIdleReturnMinutes(0)).toBe(0);
    expect(normalizeIdleReturnMinutes('0')).toBe(0);
    expect(normalizeIdleReturnMinutes(-5)).toBe(0);
    expect(normalizeIdleReturnMinutes('-5')).toBe(0);
  });

  it('clamps to [MIN, MAX] and floors fractional inputs', () => {
    expect(normalizeIdleReturnMinutes(20)).toBe(20);
    expect(normalizeIdleReturnMinutes('45')).toBe(45);
    expect(normalizeIdleReturnMinutes(20.9)).toBe(20);
    expect(normalizeIdleReturnMinutes(1)).toBe(MIN_IDLE_RETURN_MINUTES);
    expect(normalizeIdleReturnMinutes(9999)).toBe(MAX_IDLE_RETURN_MINUTES);
  });
});

describe('isIdleReturnEnabled', () => {
  it('is false only when normalization produces 0', () => {
    expect(isIdleReturnEnabled(0)).toBe(false);
    expect(isIdleReturnEnabled('')).toBe(false);
    expect(isIdleReturnEnabled(null)).toBe(false);
    expect(isIdleReturnEnabled(DEFAULT_IDLE_RETURN_MINUTES)).toBe(true);
    expect(isIdleReturnEnabled(1)).toBe(true);
  });
});

describe('idleReturnTimeoutMs', () => {
  it('returns null when disabled, and minutes-in-ms otherwise', () => {
    expect(idleReturnTimeoutMs(0)).toBeNull();
    expect(idleReturnTimeoutMs('')).toBeNull();
    expect(idleReturnTimeoutMs(20)).toBe(20 * 60 * 1000);
    expect(idleReturnTimeoutMs('1')).toBe(60 * 1000);
  });
});

describe('isSameLocalCalendarDay', () => {
  it('is true for two Dates on the same local day, regardless of time', () => {
    const morning = new Date(2026, 7, 28, 6, 30);
    const evening = new Date(2026, 7, 28, 23, 59);
    expect(isSameLocalCalendarDay(morning, evening)).toBe(true);
  });

  it('is false across a midnight boundary', () => {
    const late = new Date(2026, 7, 28, 23, 59);
    const early = new Date(2026, 7, 29, 0, 1);
    expect(isSameLocalCalendarDay(late, early)).toBe(false);
  });

  it('coerces Date-likes and rejects invalid inputs', () => {
    expect(isSameLocalCalendarDay(null, new Date())).toBe(false);
    expect(isSameLocalCalendarDay(new Date(), undefined)).toBe(false);
    expect(isSameLocalCalendarDay('not a date', new Date())).toBe(false);
    expect(
      isSameLocalCalendarDay('2026-08-28T10:00:00', '2026-08-28T22:00:00'),
    ).toBe(true);
  });
});
