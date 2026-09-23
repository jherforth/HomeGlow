import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('./timezone.js', () => ({
    getServerTimezoneSync: () => 'UTC',
}));

import { shouldShowChoreToday, convertDaysToCrontab, getDueDateStatus, formatDueDate, hasOutstandingBonusChore, compareByKey } from './choreHelpers.js';

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

    describe('snoozed_until', () => {
        // System time is frozen at 2026-05-01T12:00:00Z in beforeAll.
        it('hides a schedule snoozed into the future, even one-time schedules', () => {
            expect(shouldShowChoreToday({ visible: true, crontab: '0 0 * * *', snoozed_until: '2026-05-02T00:00:00.000Z' })).toBe(false);
            expect(shouldShowChoreToday({ visible: true, crontab: null, snoozed_until: '2026-05-02T00:00:00.000Z' })).toBe(false);
        });

        it('shows a schedule whose snooze has passed', () => {
            expect(shouldShowChoreToday({ visible: true, crontab: '0 0 * * *', snoozed_until: '2026-05-01T08:00:00.000Z' })).toBe(true);
        });

        it('ignores null/absent snoozed_until', () => {
            expect(shouldShowChoreToday({ visible: true, crontab: '0 0 * * *', snoozed_until: null })).toBe(true);
            expect(shouldShowChoreToday({ visible: true, crontab: '0 0 * * *' })).toBe(true);
        });
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

    describe('getDueDateStatus', () => {
        const today = '2026-05-01';

        it('returns none when there is no due date', () => {
            expect(getDueDateStatus(null, today, false)).toBe('none');
            expect(getDueDateStatus('', today, false)).toBe('none');
        });

        it('returns none when the chore is already completed', () => {
            expect(getDueDateStatus('2026-05-01', today, true)).toBe('none');
        });

        it('returns due when the due date is today', () => {
            expect(getDueDateStatus('2026-05-01', today, false)).toBe('due');
        });

        it('returns overdue when the due date is in the past', () => {
            expect(getDueDateStatus('2026-04-30', today, false)).toBe('overdue');
        });

        it('returns upcoming when the due date is in the future', () => {
            expect(getDueDateStatus('2026-05-09', today, false)).toBe('upcoming');
        });
    });

    describe('formatDueDate', () => {
        it('formats a valid date as a short label', () => {
            expect(formatDueDate('2026-07-03')).toBe('Jul 3');
        });

        it('passes through malformed input', () => {
            expect(formatDueDate('not-a-date')).toBe('not-a-date');
            expect(formatDueDate(null)).toBe('');
        });
    });
});

describe('hasOutstandingBonusChore', () => {
    let consoleErrorSpy;

    beforeAll(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.useFakeTimers();
        // 2026-09-06 is a Sunday (cron day-of-week 0).
        vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
    });

    afterAll(() => {
        vi.useRealTimers();
        consoleErrorSpy.mockRestore();
    });

    const TODAY = '2026-09-06';
    const bonus = (id, crontab) => ({ id, user_id: 4, visible: 1, clam_value: 1, crontab });
    const done = (id) => ({ chore_schedule_id: id, user_id: 4, date: TODAY });

    it('does not block on a bonus chore that is not due today', () => {
        // Thursday-only chore, uncompleted, on a Sunday: nothing is outstanding.
        // Avoid the day immediately after TODAY here: shouldShowChoreToday
        // compares a cron occurrence resolved in the SERVER zone against local
        // midnight, so with the mocked server zone (UTC) ahead of the runner's,
        // tomorrow-00:00 lands on today's local date. That skew is issue #21,
        // not this helper.
        const schedules = [bonus(24, '0 0 * * 4')];
        expect(hasOutstandingBonusChore(schedules, [], 4, TODAY)).toBe(false);
    });

    it('blocks on a bonus chore that is due today and uncompleted', () => {
        const schedules = [bonus(13, '0 0 * * 0,1,3,4')];
        expect(hasOutstandingBonusChore(schedules, [], 4, TODAY)).toBe(true);
    });

    it('does not block once every bonus chore due today is complete', () => {
        // The reported case: due-today chores done, other weekdays' chores not.
        const schedules = [
            bonus(13, '0 0 * * 0,1,3,4'),
            bonus(36, '0 0 * * *'),
            bonus(24, '0 0 * * 4'),
            bonus(20, '0 0 * * 5'),
        ];
        expect(hasOutstandingBonusChore(schedules, [done(13), done(36)], 4, TODAY)).toBe(false);
    });

    it('ignores regular chores, which award no clams', () => {
        const regular = { id: 2, user_id: 4, visible: 1, clam_value: 0, crontab: '0 0 * * *' };
        expect(hasOutstandingBonusChore([regular], [], 4, TODAY)).toBe(false);
    });

    it('ignores another user\'s outstanding bonus chore', () => {
        const other = { id: 9, user_id: 3, visible: 1, clam_value: 1, crontab: '0 0 * * *' };
        expect(hasOutstandingBonusChore([other], [], 4, TODAY)).toBe(false);
    });

    it('ignores hidden schedules', () => {
        expect(hasOutstandingBonusChore([{ ...bonus(8, '0 0 * * *'), visible: 0 }], [], 4, TODAY)).toBe(false);
    });

    it('treats a one-off schedule with no crontab as due today', () => {
        expect(hasOutstandingBonusChore([bonus(41, null)], [], 4, TODAY)).toBe(true);
    });
});

describe('compareByKey', () => {
    // The title column's key, which is what both tables sort by default.
    const byTitle = r => String(r?.title ?? '');
    const sorted = (rows, keyOf = byTitle, direction = 'asc') =>
        [...rows].sort((a, b) => compareByKey(a, b, keyOf, direction)).map(r => r.title);

    it('orders rows alphabetically regardless of the order they arrive in', () => {
        expect(sorted([
            { id: 3, title: 'Walk the dog' },
            { id: 1, title: 'Dishes' },
            { id: 2, title: 'Make bed' },
        ])).toEqual(['Dishes', 'Make bed', 'Walk the dog']);
    });

    it('folds case so one chore does not sort into a second alphabet', () => {
        expect(sorted([
            { id: 1, title: 'banana' },
            { id: 2, title: 'Apple' },
            { id: 3, title: 'Cherry' },
        ])).toEqual(['Apple', 'banana', 'Cherry']);
    });

    it('folds accents', () => {
        expect(sorted([
            { id: 1, title: 'Zebra' },
            { id: 2, title: 'Émile' },
            { id: 3, title: 'Edward' },
        ])).toEqual(['Edward', 'Émile', 'Zebra']);
    });

    it('breaks ties on id so equal titles keep a deterministic order', () => {
        const rows = [
            { id: 9, title: 'Dishes' },
            { id: 2, title: 'dishes' },
            { id: 5, title: 'DISHES' },
        ];
        const ids = (rs, direction) =>
            [...rs].sort((a, b) => compareByKey(a, b, byTitle, direction)).map(r => r.id);
        expect(ids(rows, 'asc')).toEqual([2, 5, 9]);
        // Same set, different arrival order, same result.
        expect(ids([...rows].reverse(), 'asc')).toEqual([2, 5, 9]);
        // The tie-break is not reversed, so flipping the column does not
        // reshuffle rows whose keys are equal.
        expect(ids(rows, 'desc')).toEqual([2, 5, 9]);
    });

    it('does not throw on a missing or null title', () => {
        expect(sorted([
            { id: 2, title: null },
            { id: 1, title: 'Dishes' },
            { id: 3 },
        ])).toEqual([null, undefined, 'Dishes']);
    });

    it('sorts numeric-leading titles as text, not as numbers', () => {
        expect(sorted([
            { id: 1, title: '10 minutes of reading' },
            { id: 2, title: '2 loads of laundry' },
        ])).toEqual(['10 minutes of reading', '2 loads of laundry']);
    });

    it('reverses on desc', () => {
        expect(sorted([
            { id: 1, title: 'Dishes' },
            { id: 2, title: 'Make bed' },
            { id: 3, title: 'Walk the dog' },
        ], byTitle, 'desc')).toEqual(['Walk the dog', 'Make bed', 'Dishes']);
    });

    it('compares numeric keys by value, not as text', () => {
        // '10' sorts before '9' as a string; the clams column must not.
        const byClams = r => Number(r?.clam_value ?? 0);
        expect(sorted([
            { id: 1, title: 'ten', clam_value: 10 },
            { id: 2, title: 'nine', clam_value: 9 },
            { id: 3, title: 'zero', clam_value: 0 },
        ], byClams)).toEqual(['zero', 'nine', 'ten']);
    });

    it('treats a zero count as a real value rather than a missing one', () => {
        // Ascending by the schedules column is how you find chores nobody is
        // scheduled for, so 0 has to lead rather than be swept to the end.
        const byCount = r => Number(r?.count ?? 0);
        expect(sorted([
            { id: 1, title: 'two', count: 2 },
            { id: 2, title: 'none', count: 0 },
        ], byCount)).toEqual(['none', 'two']);
    });

    it('sorts rows with no value last in both directions', () => {
        // Next Occurrence: a one-time task and an unparseable crontab have no
        // occurrence at all, and must not lead when you ask for the soonest.
        const byNext = r => r?.next ?? null;
        const rows = [
            { id: 1, title: 'later', next: 200 },
            { id: 2, title: 'one-time', next: null },
            { id: 3, title: 'soonest', next: 100 },
        ];
        expect(sorted(rows, byNext, 'asc')).toEqual(['soonest', 'later', 'one-time']);
        expect(sorted(rows, byNext, 'desc')).toEqual(['later', 'soonest', 'one-time']);
    });

    it('orders rows that are all missing a value by id', () => {
        const byNext = r => r?.next ?? null;
        expect(sorted([
            { id: 7, title: 'seven' },
            { id: 3, title: 'three' },
        ], byNext)).toEqual(['three', 'seven']);
    });
});
