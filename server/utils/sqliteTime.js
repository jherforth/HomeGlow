// SQLite's CURRENT_TIMESTAMP is always UTC, by specification — it ignores the
// TZ environment variable, so a correctly configured container still writes
// UTC. What it writes is "YYYY-MM-DD HH:MM:SS", which carries no zone marker.
//
// Neither Date.parse nor the browser's new Date() treats that as UTC. V8 reads
// a space-separated, offset-less timestamp as LOCAL time, so the value comes
// back an offset away from the instant that was stored — seven hours in
// US/Pacific. The digits look plausible, which is why this survives review.
//
// Columns written by CURRENT_TIMESTAMP are read through here, so the
// conversion lives in one place rather than at each call site.

const SQLITE_UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/;

// Values that already carry a zone (Z or ±hh:mm) are unambiguous and are left
// to the platform parser.
const HAS_EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Epoch milliseconds for a stored timestamp, or null if it is unusable. */
function sqliteUtcToMs(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (HAS_EXPLICIT_ZONE.test(trimmed)) {
        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    const match = SQLITE_UTC_TIMESTAMP.exec(trimmed);
    if (!match) return null;

    const parsed = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] || ''}Z`);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * ISO-8601 with an explicit Z, for anything crossing the API boundary. Returns
 * null rather than the raw string when the value cannot be read as a UTC
 * instant: a client shows "Unknown" for null, but renders a wrong local time
 * for an ambiguous string, and being wrong is worse than admitting ignorance.
 */
function sqliteUtcToIso(value) {
    const ms = sqliteUtcToMs(value);
    return ms === null ? null : new Date(ms).toISOString();
}

module.exports = {
    sqliteUtcToIso,
    sqliteUtcToMs,
};
