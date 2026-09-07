import { describe, it, expect } from 'vitest';
import { allDayInstantToLocalDate, eventDates } from './calendarAllDay.js';

const localYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('allDayInstantToLocalDate', () => {
    it('keeps the calendar date the source published', () => {
        // Stored as UTC midnight; must stay the 11th in any viewer timezone.
        expect(localYMD(allDayInstantToLocalDate('2026-09-11T00:00:00.000Z'))).toBe('2026-09-11');
    });

    it('returns local midnight, not a converted instant', () => {
        const d = allDayInstantToLocalDate('2026-09-11T00:00:00.000Z');
        expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    });

    it('passes an invalid date through rather than inventing one', () => {
        expect(Number.isNaN(allDayInstantToLocalDate('not-a-date').getTime())).toBe(true);
    });
});

describe('eventDates', () => {
    it('reinterprets an all-day event as a local date', () => {
        const { start, end } = eventDates({ all_day: true, start: '2026-09-11T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' });
        expect(localYMD(start)).toBe('2026-09-11');
        expect(localYMD(end)).toBe('2026-09-11');
    });

    it('keeps the inclusive end of a multi-day all-day event', () => {
        const { start, end } = eventDates({ all_day: true, start: '2026-09-11T00:00:00.000Z', end: '2026-09-13T00:00:00.000Z' });
        expect(localYMD(start)).toBe('2026-09-11');
        expect(localYMD(end)).toBe('2026-09-13');
    });

    it('leaves a timed event as a real instant', () => {
        // 01:30Z is a genuine moment; converting it to local is correct.
        const { start } = eventDates({ all_day: false, start: '2026-09-11T01:30:00.000Z', end: '2026-09-11T02:30:00.000Z' });
        expect(start.toISOString()).toBe('2026-09-11T01:30:00.000Z');
    });

    it('treats a missing all_day flag as timed', () => {
        const { start } = eventDates({ start: '2026-09-11T01:30:00.000Z', end: '2026-09-11T02:30:00.000Z' });
        expect(start.toISOString()).toBe('2026-09-11T01:30:00.000Z');
    });
});
