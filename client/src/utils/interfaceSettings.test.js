import { describe, it, expect, beforeEach, vi } from 'vitest';

// The vitest environment is node — provide a minimal localStorage.
const storageBacking = new Map();
vi.stubGlobal('localStorage', {
    getItem: (key) => (storageBacking.has(key) ? storageBacking.get(key) : null),
    setItem: (key, value) => storageBacking.set(key, String(value)),
    removeItem: (key) => storageBacking.delete(key),
    clear: () => storageBacking.clear(),
});
import {
    VACATION_MODE_STORAGE_KEY,
    DEFAULT_VACATION_MODE_SETTINGS,
    normalizeVacationModeSettings,
    readLocalVacationModeSettings,
    isVacationModeActiveToday,
} from './interfaceSettings.js';

describe('normalizeVacationModeSettings', () => {
    it('returns defaults for missing/invalid input', () => {
        expect(normalizeVacationModeSettings(undefined)).toEqual(DEFAULT_VACATION_MODE_SETTINGS);
        expect(normalizeVacationModeSettings(null)).toEqual(DEFAULT_VACATION_MODE_SETTINGS);
        expect(normalizeVacationModeSettings('nope')).toEqual(DEFAULT_VACATION_MODE_SETTINGS);
    });

    it('merges stored values over defaults', () => {
        expect(normalizeVacationModeSettings({ enabled: true })).toEqual({
            ...DEFAULT_VACATION_MODE_SETTINGS,
            enabled: true,
        });
        // muteSounds defaults to true but an explicit false is respected.
        expect(normalizeVacationModeSettings({ enabled: true, muteSounds: false }).muteSounds).toBe(false);
    });
});

describe('readLocalVacationModeSettings', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns defaults when nothing is stored or JSON is malformed', () => {
        expect(readLocalVacationModeSettings()).toEqual(DEFAULT_VACATION_MODE_SETTINGS);
        localStorage.setItem(VACATION_MODE_STORAGE_KEY, '{not json');
        expect(readLocalVacationModeSettings()).toEqual(DEFAULT_VACATION_MODE_SETTINGS);
    });

    it('round-trips stored settings', () => {
        localStorage.setItem(
            VACATION_MODE_STORAGE_KEY,
            JSON.stringify({ enabled: true, muteSounds: false })
        );
        expect(readLocalVacationModeSettings()).toEqual({
            ...DEFAULT_VACATION_MODE_SETTINGS,
            enabled: true,
            muteSounds: false,
        });
    });
});

describe('isVacationModeActiveToday', () => {
    const TODAY = '2026-07-21';

    it('is false when disabled or missing', () => {
        expect(isVacationModeActiveToday(null, TODAY)).toBe(false);
        expect(isVacationModeActiveToday({ enabled: false }, TODAY)).toBe(false);
    });

    it('unbounded toggle is active whenever enabled', () => {
        expect(isVacationModeActiveToday({ enabled: true, startDate: '', endDate: '' }, TODAY)).toBe(true);
    });

    it('respects the date range, inclusive of both ends', () => {
        const range = { enabled: true, startDate: '2026-07-20', endDate: '2026-07-25' };
        expect(isVacationModeActiveToday(range, '2026-07-19')).toBe(false);
        expect(isVacationModeActiveToday(range, '2026-07-20')).toBe(true);
        expect(isVacationModeActiveToday(range, '2026-07-25')).toBe(true);
        expect(isVacationModeActiveToday(range, '2026-07-26')).toBe(false);
    });

    it('auto-expires: enabled with a past endDate is inactive (and a future startDate is not yet active)', () => {
        expect(isVacationModeActiveToday({ enabled: true, startDate: '', endDate: '2026-07-01' }, TODAY)).toBe(false);
        expect(isVacationModeActiveToday({ enabled: true, startDate: '2026-08-01', endDate: '' }, TODAY)).toBe(false);
    });
});

import { hexToRgbTriplet, applyInterfaceColors } from './interfaceSettings.js';

describe('hexToRgbTriplet', () => {
    it('expands 6- and 3-digit hex into the bare triplet rgba() needs', () => {
        expect(hexToRgbTriplet('#f472b6')).toBe('244, 114, 182');
        expect(hexToRgbTriplet('#9E7FFF')).toBe('158, 127, 255');
        expect(hexToRgbTriplet('#fff')).toBe('255, 255, 255');
        expect(hexToRgbTriplet(' #000 ')).toBe('0, 0, 0');
    });

    it('returns null for anything that is not a hex color', () => {
        for (const bad of ['f472b6', '#f472b', '#gggggg', 'rgb(1, 2, 3)', '', null, undefined, 42]) {
            expect(hexToRgbTriplet(bad)).toBeNull();
        }
    });
});

describe('applyInterfaceColors', () => {
    const fakeRoot = () => {
        const vars = new Map();
        return {
            vars,
            style: {
                setProperty: (name, value) => vars.set(name, value),
                removeProperty: (name) => vars.delete(name),
            },
        };
    };

    it('sets --accent-rgb alongside --accent so alpha tints follow the pick', () => {
        const root = fakeRoot();
        applyInterfaceColors(root, { primary: '#f5f5f5', secondary: '#38bdf8', accent: '#f472b6' });
        expect(root.vars.get('--primary')).toBe('#f5f5f5');
        expect(root.vars.get('--secondary')).toBe('#38bdf8');
        expect(root.vars.get('--accent')).toBe('#f472b6');
        expect(root.vars.get('--accent-rgb')).toBe('244, 114, 182');
    });

    it('drops a stale --accent-rgb when the accent is not a hex color', () => {
        const root = fakeRoot();
        applyInterfaceColors(root, { primary: '#f5f5f5', secondary: '#38bdf8', accent: '#f472b6' });
        applyInterfaceColors(root, { primary: '#f5f5f5', secondary: '#38bdf8', accent: 'hotpink' });
        expect(root.vars.get('--accent')).toBe('hotpink');
        expect(root.vars.has('--accent-rgb')).toBe(false);
    });
});
