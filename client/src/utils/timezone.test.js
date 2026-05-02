import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('timezone utilities', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('getServerTimezone fetches once and then serves cached value', async () => {
        const fetchMock = vi.fn(async () => ({
            json: async () => ({ timezone: 'Europe/Berlin' }),
        }));
        globalThis.fetch = fetchMock;

        const timezone = await import('./timezone.js');

        const first = await timezone.getServerTimezone();
        const second = await timezone.getServerTimezone();

        expect(first).toBe('Europe/Berlin');
        expect(second).toBe('Europe/Berlin');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to America/New_York when fetch fails', async () => {
        globalThis.fetch = vi.fn(async () => {
            throw new Error('network down');
        });

        const timezone = await import('./timezone.js');
        const value = await timezone.getServerTimezone();

        expect(value).toBe('America/New_York');
    });

    it('getServerTimezoneSync defaults before initialization', async () => {
        const timezone = await import('./timezone.js');

        expect(timezone.getServerTimezoneSync()).toBe('America/New_York');
    });

    it('initTimezone primes the cache', async () => {
        globalThis.fetch = vi.fn(async () => ({
            json: async () => ({ timezone: 'UTC' }),
        }));

        const timezone = await import('./timezone.js');
        await timezone.initTimezone();

        expect(timezone.getServerTimezoneSync()).toBe('UTC');
    });
});
