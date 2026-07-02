import { describe, it, expect } from 'vitest';
import {
  parseDueTimeToMinutes,
  getElapsedDueSlots,
  getMinutesSinceMidnightInTz,
  soundUrl,
} from './choreSound.js';

describe('parseDueTimeToMinutes', () => {
  it('parses valid HH:MM strings', () => {
    expect(parseDueTimeToMinutes('00:00')).toBe(0);
    expect(parseDueTimeToMinutes('09:30')).toBe(570);
    expect(parseDueTimeToMinutes('23:59')).toBe(1439);
  });

  it('returns null for invalid input', () => {
    expect(parseDueTimeToMinutes('24:00')).toBeNull();
    expect(parseDueTimeToMinutes('7:5')).toBeNull();
    expect(parseDueTimeToMinutes('')).toBeNull();
    expect(parseDueTimeToMinutes(null)).toBeNull();
    expect(parseDueTimeToMinutes(undefined)).toBeNull();
  });
});

describe('getElapsedDueSlots', () => {
  it('returns nothing before the due time', () => {
    expect(getElapsedDueSlots({ due_time: '15:00' }, 14 * 60)).toEqual([]);
  });

  it('returns the single due slot at/after the due time with no reminder', () => {
    expect(getElapsedDueSlots({ due_time: '15:00' }, 15 * 60)).toEqual([900]);
    expect(getElapsedDueSlots({ due_time: '15:00' }, 18 * 60)).toEqual([900]);
  });

  it('returns due + reminder slots that have elapsed', () => {
    const schedule = { due_time: '15:00', reminder_interval_minutes: 30 };
    // At 16:10 -> 15:00, 15:30, 16:00 have elapsed (16:30 has not)
    expect(getElapsedDueSlots(schedule, 16 * 60 + 10)).toEqual([900, 930, 960]);
  });

  it('does not produce slots past end of day', () => {
    const schedule = { due_time: '23:00', reminder_interval_minutes: 30 };
    // 23:00, 23:30 only (24:00 is out of range)
    expect(getElapsedDueSlots(schedule, 23 * 60 + 59)).toEqual([1380, 1410]);
  });

  it('returns nothing when there is no due time', () => {
    expect(getElapsedDueSlots({ due_time: null }, 800)).toEqual([]);
    expect(getElapsedDueSlots({}, 800)).toEqual([]);
  });
});

describe('getMinutesSinceMidnightInTz', () => {
  it('computes minutes since midnight for a known UTC instant', () => {
    // 2026-07-02T13:37:00Z -> 13:37 UTC = 817 minutes
    const date = new Date('2026-07-02T13:37:00Z');
    expect(getMinutesSinceMidnightInTz('UTC', date)).toBe(817);
  });

  it('respects the target timezone offset', () => {
    const date = new Date('2026-07-02T13:37:00Z');
    // America/New_York is UTC-4 in July -> 09:37 = 577 minutes
    expect(getMinutesSinceMidnightInTz('America/New_York', date)).toBe(577);
  });
});

describe('soundUrl', () => {
  it('builds an /Uploads/sounds/ path for a bare filename', () => {
    expect(soundUrl('chime.wav')).toContain('/Uploads/sounds/chime.wav');
  });

  it('passes through absolute paths and URLs', () => {
    expect(soundUrl('/Uploads/sounds/x.wav')).toBe('/Uploads/sounds/x.wav');
    expect(soundUrl('https://cdn/x.mp3')).toBe('https://cdn/x.mp3');
  });

  it('returns null for empty input', () => {
    expect(soundUrl('')).toBeNull();
    expect(soundUrl(null)).toBeNull();
  });
});
