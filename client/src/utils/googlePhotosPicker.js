// Pure helpers for the Google Photos picker flow in PhotoWidget.
//
// Everything that touches axios, timers, or React state lives in the
// component; anything that can be a plain data-in / data-out decision lives
// here so it can be tested without a browser.

// Google's picker session response returns pollingConfig.pollInterval and
// pollingConfig.timeoutIn as protobuf duration strings ("5s", "1799.969983s"),
// not numbers. Accept a number, a duration string with or without the trailing
// "s", or an already-fractional value; on anything else fall back rather than
// return NaN — a NaN passed to setTimeout is silently coerced to 1ms and would
// hammer the polling endpoint or fire the timeout instantly.
const DURATION_PATTERN = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*s?\s*$/;

export const REQUIRED_GOOGLE_PHOTOS_SCOPE = 'photoslibrary.readonly.appcreateddata';

/**
 * Parse a Google duration string ("5s", "1799.969983s") or bare number of
 * seconds into a millisecond count. Returns `fallbackMs` for anything that
 * cannot be parsed (undefined, null, empty, malformed, negative, non-finite).
 */
export const parseDurationMs = (value, fallbackMs) => {
    const seconds = parseDurationSeconds(value);
    if (seconds === null || seconds < 0) return fallbackMs;
    return Math.round(seconds * 1000);
};

/**
 * Parse a Google duration string into a number of seconds. Returns null when
 * the value is missing or malformed; callers decide what to substitute.
 */
export const parseDurationSeconds = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') return null;
    const match = value.match(DURATION_PATTERN);
    if (!match) return null;
    const parsed = parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Does the space-separated `scopes` string include the picker's required
 * Photos scope? Splits on whitespace so a scope that merely contains the name
 * as a substring (e.g. a hypothetical `photoslibrary.readonly.appcreateddata.extended`)
 * does not produce a false positive; accepts either the bare scope name or
 * the full `https://www.googleapis.com/auth/…` form Google actually returns.
 */
export const hasGooglePhotosPickerScope = (scopes) => {
    if (typeof scopes !== 'string' || scopes.length === 0) return false;
    const suffix = `/${REQUIRED_GOOGLE_PHOTOS_SCOPE}`;
    return scopes.split(/\s+/).some((token) => (
        token === REQUIRED_GOOGLE_PHOTOS_SCOPE || token.endsWith(suffix)
    ));
};

/**
 * Reduce the server's ingest result ({added, skipped, failed, total}) into
 * the pieces the UI needs. `severity` drives the Alert colour — a run with
 * any `failed` count must not be presented as a clean success, even if some
 * items were added.
 */
export const summarizePickerIngest = (result) => {
    const added = toCount(result?.added);
    const skipped = toCount(result?.skipped);
    const failed = toCount(result?.failed);
    const total = toCount(result?.total);
    return {
        added,
        skipped,
        failed,
        total,
        severity: failed > 0 ? 'warning' : 'success',
    };
};

const toCount = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
    return Math.trunc(value);
};
