import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('./timezone.js', () => ({
    getServerTimezoneSync: () => 'UTC',
}));

import { shouldShowChoreToday, convertDaysToCrontab } from './choreHelpers.js';

describe('choreHelpers utilities', () => {
    let consoleErrorSpy;

    beforeAll(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    });

    afterAll(() => {
        vi.useRealTimers();
        consoleErrorSpy.mockRestore();
    });

    it('returns false for invisible schedules', () => {
        expect(shouldShowChoreToday({ visible: false, crontab: null })).toBe(false);
    });

    it('returns true for visible schedules without crontab', () => {
        expect(shouldShowChoreToday({ visible: true, crontab: null })).toBe(true);
    });

    it('returns true for daily crontab schedules', () => {
        expect(shouldShowChoreToday({ visible: true, crontab: '0 0 * * *' })).toBe(true);
    });

    it('returns false for malformed crontab strings', () => {
        expect(shouldShowChoreToday({ visible: true, crontab: 'invalid cron' })).toBe(false);
    });

    it('convertDaysToCrontab returns null for empty input', () => {
        expect(convertDaysToCrontab([])).toBe(null);
    });

    it('convertDaysToCrontab returns daily expression for all days', () => {
        expect(convertDaysToCrontab([
            'sunday',
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
        ])).toBe('0 0 * * *');
    });

    it('convertDaysToCrontab maps and sorts day values', () => {
        expect(convertDaysToCrontab(['friday', 'monday', 'sunday'])).toBe('0 0 * * 0,1,5');
    });
});
