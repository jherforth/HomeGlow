import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('./timezone.js', () => ({
    getServerTimezoneSync: () => 'UTC',
}));

import { nextOccurrenceAt, getNextOccurrence } from './choreScheduleUtils.js';

describe('nextOccurrenceAt', () => {
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z')); // a Saturday
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('parses a crontab to a Date (next Monday 9am)', () => {
        const d = nextOccurrenceAt('0 9 * * 1', {});
        expect(d).toBeInstanceOf(Date);
        // 2026-09-28 is the next Monday
        expect(d.toISOString()).toBe('2026-09-28T09:00:00.000Z');
    });

    it('returns a date for a calendar schedule matching today', () => {
        const d = nextOccurrenceAt('', { calendar_match: 'Practice', calendar_matched_today: true });
        expect(d).toBeInstanceOf(Date);
    });

    it('returns null for a calendar schedule with no match today (sorts last)', () => {
        expect(nextOccurrenceAt('', { calendar_match: 'Practice', calendar_matched_today: false })).toBeNull();
    });

    it('returns null for one-time schedules', () => {
        expect(nextOccurrenceAt('', {})).toBeNull();
    });

    it('returns null for unparseable crontabs', () => {
        expect(nextOccurrenceAt('nonsense', {})).toBeNull();
    });

    it('returns null for once-completed schedules', () => {
        expect(nextOccurrenceAt('0 9 * * *', { duration: 'once-completed' })).toBeNull();
    });

    it('getNextOccurrence label and key agree on the same parse', () => {
        const label = getNextOccurrence('0 9 * * 1', {});
        const key = nextOccurrenceAt('0 9 * * 1', {});
        expect(label).toContain('Sep 28');
        expect(key.toISOString().slice(0, 10)).toBe('2026-09-28');
    });
});
