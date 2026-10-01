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

    it('saveServerTimezone sends the zone and updates the cache', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ timezone: 'America/Denver', source: 'setting', envTimezone: 'UTC' }),
        }));
        globalThis.fetch = fetchMock;

        const timezone = await import('./timezone.js');
        await timezone.saveServerTimezone('America/Denver');

        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body)).toEqual({ timezone: 'America/Denver' });
        expect(timezone.getServerTimezoneSync()).toBe('America/Denver');
    });

    it('saveServerTimezone surfaces the server error and leaves the cache alone', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: false,
            status: 400,
            json: async () => ({ error: 'Unknown time zone: Nope' }),
        }));

        const timezone = await import('./timezone.js');
        await expect(timezone.saveServerTimezone('Nope')).rejects.toThrow('Unknown time zone: Nope');
        expect(timezone.getServerTimezoneSync()).toBe('America/New_York');
    });

    describe('watchServerTimezone', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
        });
        afterEach(() => {
            vi.useRealTimers();
            vi.unstubAllGlobals();
        });

        const respond = (zones) => vi.fn(async () => ({ ok: true, json: async () => ({ timezone: zones.shift() }) }));

        it('reports a change made on another display, once', async () => {
            globalThis.fetch = respond(['America/New_York', 'America/New_York', 'Europe/Paris', 'Europe/Paris']);
            const timezone = await import('./timezone.js');
            await timezone.initTimezone();

            const onChange = vi.fn();
            const stop = timezone.watchServerTimezone({ intervalMs: 1000, onChange });
            await vi.advanceTimersByTimeAsync(1000);
            expect(onChange).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1000);
            expect(onChange).toHaveBeenCalledWith('Europe/Paris');
            await vi.advanceTimersByTimeAsync(1000);
            expect(onChange).toHaveBeenCalledTimes(1);
            stop();
        });

        it('keeps the current zone through a failed check', async () => {
            globalThis.fetch = respond(['UTC']);
            const timezone = await import('./timezone.js');
            await timezone.initTimezone();
            globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });

            const onChange = vi.fn();
            const stop = timezone.watchServerTimezone({ intervalMs: 1000, onChange });
            await vi.advanceTimersByTimeAsync(3000);
            expect(onChange).not.toHaveBeenCalled();
            expect(timezone.getServerTimezoneSync()).toBe('UTC');
            stop();
        });
    });

    it('formats offsets for the date given, daylight saving included', async () => {
        const timezone = await import('./timezone.js');
        expect(timezone.formatUtcOffset('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe('UTC−05:00');
        expect(timezone.formatUtcOffset('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe('UTC−04:00');
        expect(timezone.formatUtcOffset('Asia/Kolkata', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+05:30');
        expect(timezone.formatUtcOffset('UTC')).toBe('UTC+00:00');
        expect(timezone.formatUtcOffset('Not/AZone')).toBe('');
    });

    it('lists zones sorted, always including UTC and the current zone', async () => {
        const timezone = await import('./timezone.js');
        const zones = timezone.listTimeZones('Etc/GMT+5');
        expect(zones).toContain('UTC');
        expect(zones).toContain('Etc/GMT+5');
        expect(zones).toContain('America/Chicago');
        expect([...zones].sort((a, b) => a.localeCompare(b))).toEqual(zones);
    });
});
