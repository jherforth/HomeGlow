import { describe, it, expect } from 'vitest';
import {
    buildMergedDotColors,
    buildMergedDotBackground,
    describeMergedCalendars,
} from './calendarMergeColors.js';

const FALLBACK = '#6e44ff';

describe('buildMergedDotColors', () => {
    it('returns just the winning color when nothing was merged', () => {
        expect(buildMergedDotColors({ source_color: '#111111' }, FALLBACK)).toEqual(['#111111']);
    });

    it('puts the winner first, then merged sources in order', () => {
        const event = {
            source_color: '#111111',
            merged_from: [
                { source_id: 2, source_name: 'Mom', source_color: '#222222' },
                { source_id: 3, source_name: 'Dad', source_color: '#333333' },
            ],
        };
        expect(buildMergedDotColors(event, FALLBACK)).toEqual(['#111111', '#222222', '#333333']);
    });

    it('caps at four colors', () => {
        const event = {
            source_color: '#111111',
            merged_from: [
                { source_color: '#222222' },
                { source_color: '#333333' },
                { source_color: '#444444' },
                { source_color: '#555555' },
            ],
        };
        expect(buildMergedDotColors(event, FALLBACK)).toHaveLength(4);
    });

    it('falls back for missing colors', () => {
        const event = { merged_from: [{ source_name: 'Mom' }] };
        expect(buildMergedDotColors(event, FALLBACK)).toEqual([FALLBACK, FALLBACK]);
    });
});

describe('buildMergedDotBackground', () => {
    it('is the plain color for a single calendar', () => {
        expect(buildMergedDotBackground(['#111111'])).toBe('#111111');
    });

    it('builds equal wedges for two calendars', () => {
        expect(buildMergedDotBackground(['#111111', '#222222'])).toBe(
            'conic-gradient(#111111 0deg 180deg, #222222 180deg 360deg)'
        );
    });

    it('builds equal wedges for four calendars', () => {
        const css = buildMergedDotBackground(['#1', '#2', '#3', '#4']);
        expect(css).toContain('#1 0deg 90deg');
        expect(css).toContain('#4 270deg 360deg');
    });

    it('handles empty input', () => {
        expect(buildMergedDotBackground([])).toBe('transparent');
        expect(buildMergedDotBackground(undefined)).toBe('transparent');
    });
});

describe('describeMergedCalendars', () => {
    it('is null when nothing was merged', () => {
        expect(describeMergedCalendars({ source_name: 'Family' })).toBeNull();
    });

    it('counts all calendars including the winner and lists names', () => {
        const event = {
            source_name: 'Family',
            merged_from: [{ source_name: 'Mom' }, { source_name: 'Dad' }],
        };
        expect(describeMergedCalendars(event)).toBe('On 3 calendars: Family, Mom, Dad');
    });
});
