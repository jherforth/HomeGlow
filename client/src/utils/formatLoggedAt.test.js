import { describe, it, expect, vi } from 'vitest';

// The server's timezone, not the viewer's, decides both the rendered time and
// whether the logged date differs from the row's date. Pinning it here is what
// makes these assertions independent of the machine running them.
vi.mock('./timezone.js', () => ({
    getServerTimezoneSync: () => 'America/Los_Angeles',
}));

import { formatLoggedAt } from './choreHelpers.js';

describe('formatLoggedAt', () => {
    it('shows only the time when the row was logged on its own date', () => {
        // 2026-09-12T22:05Z is 3:05pm on 2026-09-12 in Los Angeles.
        expect(formatLoggedAt('2026-09-12T22:05:00.000Z', '2026-09-12', 'en-US')).toBe('3:05 PM');
    });

    it('adds the day when the row was logged on a different date', () => {
        // 2026-09-13T07:20Z is 12:20am on 2026-09-13 — a chore dated the 12th
        // but checked off after midnight. Time alone would read as the 12th.
        expect(formatLoggedAt('2026-09-13T07:20:00.000Z', '2026-09-12', 'en-US')).toBe('Sep 13, 12:20 AM');
    });

    it('compares dates in the server zone, not UTC', () => {
        // 2026-09-13T04:50Z is still 9:50pm on the 12th in Los Angeles. Judged
        // in UTC this would look like a different day and wrongly gain a label.
        expect(formatLoggedAt('2026-09-13T04:50:00.000Z', '2026-09-12', 'en-US')).toBe('9:50 PM');
    });

    it('shows the bare time when the row carries no date to compare against', () => {
        expect(formatLoggedAt('2026-09-12T22:05:00.000Z', null, 'en-US')).toBe('3:05 PM');
    });

    it('returns empty for values it cannot render, rather than a wrong time', () => {
        for (const bad of [null, undefined, '', 'garbage', '2026-99-99T04:50:32Z']) {
            expect(formatLoggedAt(bad, '2026-09-12', 'en-US')).toBe('');
        }
    });
});
