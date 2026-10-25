import { describe, it, expect } from 'vitest';
import { fromDateKey } from './dateUtils.js';

describe('fromDateKey', () => {
  it('is local midnight of the date, not UTC midnight', () => {
    const date = fromDateKey('2026-11-26');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 26]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });
});
