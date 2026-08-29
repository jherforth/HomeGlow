// Mirrors server/tests/deviceName.test.js. Both suites cover the same
// cases so the two implementations cannot silently drift — a rule
// change on one side that isn't ported to the other will show up as a
// failing case in the mirror suite.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    getDeviceName,
    setDeviceName,
    getDeviceApiBase,
    isValidDeviceName,
    normalizeDeviceName,
} from './deviceName.js';

function createLocalStorageMock() {
    const store = new Map();
    return {
        getItem: (key) => store.has(key) ? store.get(key) : null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
    };
}

describe('deviceName utilities', () => {
    const originalLocalStorage = globalThis.localStorage;

    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: createLocalStorageMock(),
            configurable: true,
            writable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: originalLocalStorage,
            configurable: true,
            writable: true,
        });
        vi.restoreAllMocks();
    });

    it('generates and stores a device name when missing', () => {
        const randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('fixed-uuid-123');

        const name = getDeviceName();

        expect(name).toBe('fixed-uuid-123');
        expect(randomUuidSpy).toHaveBeenCalledTimes(1);
        expect(globalThis.localStorage.getItem('homeglow_device_name')).toBe('fixed-uuid-123');
    });

    it('returns stored device name without generating a new value', () => {
        globalThis.localStorage.setItem('homeglow_device_name', 'existing-device');
        const randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('new-uuid-should-not-be-used');

        const name = getDeviceName();

        expect(name).toBe('existing-device');
        expect(randomUuidSpy).not.toHaveBeenCalled();
    });

    it('getDeviceName returns exactly what is stored, without rewriting', () => {
        // The stored value may pre-date the current validation rule (e.g. a
        // legacy name with '/' in it). getDeviceName must not mutate it —
        // the client's identity is that string, whatever it is.
        globalThis.localStorage.setItem('homeglow_device_name', 'Kitchen/Display');
        expect(getDeviceName()).toBe('Kitchen/Display');
        expect(globalThis.localStorage.getItem('homeglow_device_name')).toBe('Kitchen/Display');
    });

    it('setDeviceName updates localStorage key', () => {
        setDeviceName('kitchen-hub');

        expect(globalThis.localStorage.getItem('homeglow_device_name')).toBe('kitchen-hub');
    });

    it('getDeviceApiBase encodes device name in URL path', () => {
        setDeviceName('Kitchen Display/West');

        const apiBase = getDeviceApiBase('http://localhost:5001');

        expect(apiBase).toBe('http://localhost:5001/api/devices/Kitchen%20Display%2FWest');
    });
});

describe('isValidDeviceName', () => {
    it('accepts common human-picked names', () => {
        expect(isValidDeviceName('Kitchen Display')).toBe(true);
        expect(isValidDeviceName("Nan's iPad")).toBe(true);
        expect(isValidDeviceName('Playroom (up)')).toBe(true);
        expect(isValidDeviceName('José')).toBe(true);
        expect(isValidDeviceName('Kitchen_Hub-2')).toBe(true);
    });

    it('accepts a name that is exactly 64 characters long', () => {
        expect(isValidDeviceName('a'.repeat(64))).toBe(true);
    });

    it('rejects URL-meaningful characters', () => {
        expect(isValidDeviceName('a/b')).toBe(false);
        expect(isValidDeviceName('a\\b')).toBe(false);
        expect(isValidDeviceName('a?b')).toBe(false);
        expect(isValidDeviceName('a#b')).toBe(false);
        expect(isValidDeviceName('a%b')).toBe(false);
        expect(isValidDeviceName('a&b')).toBe(false);
        expect(isValidDeviceName('a+b')).toBe(false);
        expect(isValidDeviceName('a:b')).toBe(false);
        expect(isValidDeviceName('a@b')).toBe(false);
    });

    it('rejects path-traversal-shaped inputs', () => {
        expect(isValidDeviceName('../etc')).toBe(false);
        expect(isValidDeviceName('a..b')).toBe(false);
        expect(isValidDeviceName('..')).toBe(false);
    });

    it('rejects empty, whitespace-only, and oversized inputs', () => {
        expect(isValidDeviceName('')).toBe(false);
        expect(isValidDeviceName('   ')).toBe(false);
        expect(isValidDeviceName('a'.repeat(65))).toBe(false);
    });

    it('rejects names with no letter or digit', () => {
        expect(isValidDeviceName('...')).toBe(false);
        expect(isValidDeviceName('---')).toBe(false);
        expect(isValidDeviceName("()'")).toBe(false);
    });

    it('rejects undefined (matches server typeof guard)', () => {
        expect(isValidDeviceName(undefined)).toBe(false);
    });

    it('rejects null (matches server typeof guard)', () => {
        expect(isValidDeviceName(null)).toBe(false);
    });

    it('rejects a number (matches server typeof guard)', () => {
        expect(isValidDeviceName(12345)).toBe(false);
    });

    it('trims leading and trailing whitespace before validating', () => {
        expect(isValidDeviceName('  Kitchen  ')).toBe(true);
    });
});

describe('normalizeDeviceName', () => {
    it('collapses NFD and NFC forms of the same accented name', () => {
        const composed = 'café';           // é as a single precomposed code point (NFC)
        const decomposed = 'café';  // e + combining acute (NFD)
        expect(composed).not.toBe(decomposed);
        expect(normalizeDeviceName(composed)).toBe(normalizeDeviceName(decomposed));
        expect(normalizeDeviceName(decomposed)).toBe(composed);
    });

    it('trims whitespace', () => {
        expect(normalizeDeviceName('  Kitchen Display  ')).toBe('Kitchen Display');
    });

    it('returns empty string for non-strings', () => {
        expect(normalizeDeviceName(null)).toBe('');
        expect(normalizeDeviceName(undefined)).toBe('');
        expect(normalizeDeviceName(12345)).toBe('');
    });
});
