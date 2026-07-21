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
