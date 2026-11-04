// Remote-control mirror mode: hash form and viewport reporter.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    buildMirrorHash,
    parseMirrorHash,
    isMirrorHash,
    createViewportReporter,
    viewportSizesEqual,
} from './mirrorMode.js';

describe('mirror hash', () => {
    it('round-trips device names, including spaces and punctuation', () => {
        for (const name of ['Kitchen Wall Display', "Nan's iPad", 'Playroom (up)', 'a']) {
            expect(parseMirrorHash(buildMirrorHash(name))).toBe(name);
        }
    });

    it('accepts a trailing slash, rejects everything else', () => {
        expect(parseMirrorHash('#/mirror/Wall/')).toBe('Wall');
        expect(parseMirrorHash('#/mirror/')).toBe(null);
        expect(parseMirrorHash('#/mirror')).toBe(null);
        expect(parseMirrorHash('#/mirror/Wall/extra')).toBe(null);
        expect(parseMirrorHash('#/admin/displays')).toBe(null);
        expect(parseMirrorHash('')).toBe(null);
        expect(parseMirrorHash(null)).toBe(null);
        expect(parseMirrorHash('#/mirror/%E0%A4%A')).toBe(null, 'malformed encoding decodes to nothing');
        expect(isMirrorHash('#/mirror/Wall')).toBe(true);
        expect(isMirrorHash('#/admin')).toBe(false);
    });
});

describe('viewport reporter', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('debounces rapid resizes into one report', () => {
        const send = vi.fn();
        const reporter = createViewportReporter(send, 500);

        reporter.report({ width: 1000, height: 800, devicePixelRatio: 1 });
        reporter.report({ width: 1200, height: 800, devicePixelRatio: 1 });
        reporter.report({ width: 1280, height: 800, devicePixelRatio: 1 });
        expect(send).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith({ width: 1280, height: 800, devicePixelRatio: 1 });
    });

    it('never reports a size identical to the last one sent', () => {
        const send = vi.fn();
        const reporter = createViewportReporter(send, 500);

        reporter.report({ width: 1280, height: 800, devicePixelRatio: 1 });
        vi.advanceTimersByTime(500);
        expect(send).toHaveBeenCalledTimes(1);

        // Same size again — including across a resize event storm — sends nothing.
        reporter.report({ width: 1280, height: 800, devicePixelRatio: 1 });
        vi.advanceTimersByTime(1000);
        expect(send).toHaveBeenCalledTimes(1);

        // A real change sends again.
        reporter.report({ width: 1920, height: 1080, devicePixelRatio: 2 });
        vi.advanceTimersByTime(500);
        expect(send).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenLastCalledWith({ width: 1920, height: 1080, devicePixelRatio: 2 });
    });

    it('ignores invalid sizes and defaults devicePixelRatio to 1', () => {
        const send = vi.fn();
        const reporter = createViewportReporter(send, 500);

        reporter.report({ width: 0, height: 800 });
        reporter.report({ width: 1920.5, height: 1080 });
        reporter.report({ width: 1920 });
        reporter.report(null);
        vi.advanceTimersByTime(1000);
        expect(send).not.toHaveBeenCalled();

        reporter.report({ width: 1280, height: 800 });
        vi.advanceTimersByTime(500);
        expect(send).toHaveBeenCalledWith({ width: 1280, height: 800, devicePixelRatio: 1 });
    });

    it('cancel drops a pending report', () => {
        const send = vi.fn();
        const reporter = createViewportReporter(send, 500);

        reporter.report({ width: 1280, height: 800, devicePixelRatio: 1 });
        reporter.cancel();
        vi.advanceTimersByTime(1000);
        expect(send).not.toHaveBeenCalled();
    });

    it('viewportSizesEqual compares all three fields', () => {
        expect(viewportSizesEqual({ width: 1, height: 2 }, { width: 1, height: 2 })).toBe(true);
        expect(viewportSizesEqual({ width: 1, height: 2 }, { width: 1, height: 3 })).toBe(false);
        expect(viewportSizesEqual({ width: 1, height: 2, devicePixelRatio: 2 }, { width: 1, height: 2 })).toBe(false);
        expect(viewportSizesEqual(null, { width: 1, height: 2 })).toBe(false);
    });
});
