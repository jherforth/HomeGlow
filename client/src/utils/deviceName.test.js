import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDeviceName, setDeviceName, getDeviceApiBase } from './deviceName.js';

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
