import { describe, it, expect } from 'vitest';
import { buildMobileWidgetList, needsFixedMobileHeight } from './mobileWidgets.js';

const widget = (id) => ({ id, content: `content-${id}` });

describe('buildMobileWidgetList', () => {
    it('orders chores → calendar → weather → plugins regardless of input order', () => {
        const input = [
            widget('calendar-widget'),
            widget('weather-widget'),
            widget('plugin-clock.html'),
            widget('chores-widget'),
        ];
        expect(buildMobileWidgetList(input).map((w) => w.id)).toEqual([
            'chores-widget',
            'calendar-widget',
            'weather-widget',
            'plugin-clock.html',
        ]);
    });

    it('excludes the photo widget even when enabled', () => {
        const input = [widget('photos-widget'), widget('chores-widget')];
        expect(buildMobileWidgetList(input).map((w) => w.id)).toEqual(['chores-widget']);
    });

    it('keeps the relative order of multiple plugins', () => {
        const input = [
            widget('plugin-b.html'),
            widget('chores-widget'),
            widget('plugin-a.html'),
        ];
        expect(buildMobileWidgetList(input).map((w) => w.id)).toEqual([
            'chores-widget',
            'plugin-b.html',
            'plugin-a.html',
        ]);
    });

    it('does not mutate the input array', () => {
        const input = [widget('weather-widget'), widget('chores-widget')];
        const snapshot = input.map((w) => w.id);
        buildMobileWidgetList(input);
        expect(input.map((w) => w.id)).toEqual(snapshot);
    });

    it('handles empty and non-array input', () => {
        expect(buildMobileWidgetList([])).toEqual([]);
        expect(buildMobileWidgetList(undefined)).toEqual([]);
        expect(buildMobileWidgetList(null)).toEqual([]);
    });

    it('places unknown widget ids last', () => {
        const input = [widget('mystery-widget'), widget('weather-widget')];
        expect(buildMobileWidgetList(input).map((w) => w.id)).toEqual([
            'weather-widget',
            'mystery-widget',
        ]);
    });
});

describe('needsFixedMobileHeight', () => {
    it('is true for calendar and plugins, false for natural-height widgets', () => {
        expect(needsFixedMobileHeight(widget('calendar-widget'))).toBe(true);
        expect(needsFixedMobileHeight(widget('plugin-clock.html'))).toBe(true);
        expect(needsFixedMobileHeight(widget('chores-widget'))).toBe(false);
        expect(needsFixedMobileHeight(widget('weather-widget'))).toBe(false);
    });
});
