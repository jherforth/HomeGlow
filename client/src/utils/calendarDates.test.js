import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { parseCalendarDate } from './calendarDates.js';

describe('parseCalendarDate', () => {
    it('keeps a timed event as the exact instant it was cached at', () => {
        const parsed = parseCalendarDate('2026-09-04T21:00:00.000Z', false);
        expect(parsed.toISOString()).toBe('2026-09-04T21:00:00.000Z');
    });

    // The regression: an all-day event cached as UTC midnight was handed straight
    // to `new Date`, so a display west of UTC rendered it at 11:00 PM (or 7:00 PM,
    // depending on the offset) on the day *before* the date the feed named.
    it('puts an all-day event on its own calendar date, not the day before', () => {
        const parsed = parseCalendarDate('2026-09-05T00:00:00.000Z', true);

        expect(moment(parsed).format('YYYY-MM-DD')).toBe('2026-09-05');
        expect(parsed.getHours()).toBe(0);
        expect(parsed.getMinutes()).toBe(0);
    });

    it('resolves an all-day event to local midnight, so day math is inclusive', () => {
        const parsed = parseCalendarDate('2026-09-05T00:00:00.000Z', true);
        expect(moment(parsed).isSame(moment(parsed).startOf('day'))).toBe(true);
    });

    it('keeps the last day of a multi-day all-day span on its own date', () => {
        const start = parseCalendarDate('2026-09-14T00:00:00.000Z', true);
        const end = parseCalendarDate('2026-09-17T00:00:00.000Z', true);

        expect(moment(start).format('YYYY-MM-DD')).toBe('2026-09-14');
        expect(moment(end).format('YYYY-MM-DD')).toBe('2026-09-17');
        expect(moment(end).diff(moment(start), 'days')).toBe(3);
    });

    it('falls back to the raw value when the date is unparseable', () => {
        expect(Number.isNaN(parseCalendarDate('not-a-date', true).getTime())).toBe(true);
    });
});
