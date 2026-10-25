import { describe, it, expect } from 'vitest';
import { fromDateKey, formatHourOfDay, formatTime } from './dateUtils.js';

describe('fromDateKey', () => {
  it('is local midnight of the date, not UTC midnight', () => {
    const date = fromDateKey('2026-11-26');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 26]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });
});

describe('formatHourOfDay', () => {
  it('formats an hour with the same clock convention as formatTime', () => {
    expect(formatHourOfDay(0)).toBe(formatTime(new Date(2000, 0, 1, 0, 0)));
    expect(formatHourOfDay(23)).toBe(formatTime(new Date(2000, 0, 1, 23, 0)));
  });

  it('accepts numeric strings and blanks out bad input', () => {
    expect(formatHourOfDay('6')).toBe(formatTime(new Date(2000, 0, 1, 6, 0)));
    expect(formatHourOfDay('')).toBe('');
    expect(formatHourOfDay('abc')).toBe('');
    expect(formatHourOfDay(null)).toBe('');
  });
});
