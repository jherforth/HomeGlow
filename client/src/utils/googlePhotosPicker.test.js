import { describe, it, expect } from 'vitest';
import {
    REQUIRED_GOOGLE_PHOTOS_SCOPE,
    parseDurationMs,
    parseDurationSeconds,
    hasGooglePhotosPickerScope,
    summarizePickerIngest,
} from './googlePhotosPicker.js';

describe('parseDurationSeconds', () => {
    it('parses an integer-second duration string', () => {
        expect(parseDurationSeconds('5s')).toBe(5);
    });

    it('parses a fractional-second duration string', () => {
        expect(parseDurationSeconds('1799.969983s')).toBeCloseTo(1799.969983, 6);
    });

    it('accepts a value with no unit', () => {
        expect(parseDurationSeconds('12')).toBe(12);
    });

    it('accepts a bare finite number', () => {
        expect(parseDurationSeconds(7)).toBe(7);
    });

    it('rejects non-finite numbers', () => {
        expect(parseDurationSeconds(NaN)).toBeNull();
        expect(parseDurationSeconds(Infinity)).toBeNull();
    });

    it('returns null for missing, empty, or malformed input', () => {
        expect(parseDurationSeconds(undefined)).toBeNull();
        expect(parseDurationSeconds(null)).toBeNull();
        expect(parseDurationSeconds('')).toBeNull();
        expect(parseDurationSeconds('abc')).toBeNull();
        expect(parseDurationSeconds('5m')).toBeNull();
        expect(parseDurationSeconds({})).toBeNull();
    });
});

describe('parseDurationMs', () => {
    it('converts an integer-second string to milliseconds', () => {
        expect(parseDurationMs('5s', 1)).toBe(5000);
    });

    it('converts a fractional-second string to milliseconds', () => {
        // 1799.969983 * 1000 rounds to 1799970 rather than losing the fraction.
        expect(parseDurationMs('1799.969983s', 1)).toBe(1799970);
    });

    it('treats a bare number of seconds correctly', () => {
        expect(parseDurationMs(2, 1)).toBe(2000);
    });

    it('returns the fallback for a missing value rather than NaN', () => {
        // NaN passed to setTimeout is silently coerced to 1ms — the fallback
        // exists specifically to keep that from happening.
        expect(parseDurationMs(undefined, 5000)).toBe(5000);
        expect(parseDurationMs(null, 5000)).toBe(5000);
    });

    it('returns the fallback for malformed input rather than NaN', () => {
        expect(parseDurationMs('not-a-duration', 1800000)).toBe(1800000);
        expect(parseDurationMs('5m', 1800000)).toBe(1800000);
        expect(parseDurationMs('', 42)).toBe(42);
    });

    it('returns the fallback for negative durations', () => {
        expect(parseDurationMs('-5s', 5000)).toBe(5000);
        expect(parseDurationMs(-2, 5000)).toBe(5000);
    });

    it('never returns NaN even when the fallback is not supplied', () => {
        expect(Number.isNaN(parseDurationMs(undefined))).toBe(false);
        expect(parseDurationMs('bogus')).toBeUndefined();
    });
});

describe('hasGooglePhotosPickerScope', () => {
    const fullScopeUrl = `https://www.googleapis.com/auth/${REQUIRED_GOOGLE_PHOTOS_SCOPE}`;

    it('returns true for the full URL-form scope Google actually returns', () => {
        const scopes = `openid email ${fullScopeUrl}`;
        expect(hasGooglePhotosPickerScope(scopes)).toBe(true);
    });

    it('returns true for the bare scope name on its own', () => {
        expect(hasGooglePhotosPickerScope(REQUIRED_GOOGLE_PHOTOS_SCOPE)).toBe(true);
    });

    it('returns false when only the deprecated broader scope is present', () => {
        // The 2025-03-31 replacement scope has to be granted specifically —
        // the old `photoslibrary.readonly` on its own is not sufficient.
        const scopes = 'openid https://www.googleapis.com/auth/photoslibrary.readonly';
        expect(hasGooglePhotosPickerScope(scopes)).toBe(false);
    });

    it('rejects a scope that merely contains the required name as a substring', () => {
        // Guards against a naive `.includes(name)` check being fooled by a
        // scope whose name happens to end in a longer suffix.
        const scopes = 'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata.extended';
        expect(hasGooglePhotosPickerScope(scopes)).toBe(false);
    });

    it('rejects a scope with the required name as a prefix segment', () => {
        const scopes = 'photoslibrary.readonly.appcreateddataX';
        expect(hasGooglePhotosPickerScope(scopes)).toBe(false);
    });

    it('handles missing, empty, or non-string inputs', () => {
        expect(hasGooglePhotosPickerScope(undefined)).toBe(false);
        expect(hasGooglePhotosPickerScope(null)).toBe(false);
        expect(hasGooglePhotosPickerScope('')).toBe(false);
        expect(hasGooglePhotosPickerScope([REQUIRED_GOOGLE_PHOTOS_SCOPE])).toBe(false);
    });

    it('tolerates any whitespace between scopes', () => {
        const scopes = `openid\t${fullScopeUrl}\nemail`;
        expect(hasGooglePhotosPickerScope(scopes)).toBe(true);
    });
});

describe('summarizePickerIngest', () => {
    it('marks a clean run as success', () => {
        const summary = summarizePickerIngest({ added: 4, skipped: 0, failed: 0, total: 4 });
        expect(summary).toEqual({ added: 4, skipped: 0, failed: 0, total: 4, severity: 'success' });
    });

    it('marks any run with a failure as warning, even when items were added', () => {
        // A partial success must not be rendered as a clean success — a red
        // photo the user picked and expected to see is a real failure.
        const summary = summarizePickerIngest({ added: 3, skipped: 1, failed: 2, total: 6 });
        expect(summary.severity).toBe('warning');
    });

    it('marks an all-skipped run as success', () => {
        const summary = summarizePickerIngest({ added: 0, skipped: 5, failed: 0, total: 5 });
        expect(summary.severity).toBe('success');
    });

    it('coerces missing fields to zero so the template never renders undefined', () => {
        const summary = summarizePickerIngest({});
        expect(summary).toEqual({ added: 0, skipped: 0, failed: 0, total: 0, severity: 'success' });
    });

    it('coerces negative or non-numeric counts to zero', () => {
        const summary = summarizePickerIngest({
            added: -1,
            skipped: 'two',
            failed: null,
            total: NaN,
        });
        expect(summary).toEqual({ added: 0, skipped: 0, failed: 0, total: 0, severity: 'success' });
    });

    it('truncates fractional counts rather than passing floats to the UI', () => {
        const summary = summarizePickerIngest({ added: 3.9, skipped: 0, failed: 0, total: 3.9 });
        expect(summary.added).toBe(3);
        expect(summary.total).toBe(3);
    });

    it('is safe on a null/undefined result', () => {
        expect(summarizePickerIngest(null).severity).toBe('success');
        expect(summarizePickerIngest(undefined).added).toBe(0);
    });
});
