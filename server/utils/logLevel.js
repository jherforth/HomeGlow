// Log level, resolved once from the environment.
//
// Fastify's logger is pino, so the level vocabulary is already standard and is
// reused verbatim rather than invented here. `silent` is pino's own name for
// "log nothing"; it is accepted so an operator can turn the logger off without
// reaching for a sentinel value.
//
// The default is `warn`, not pino's `info`. HomeGlow runs unattended on a wall
// display whose kiosk polls continuously, and `info` means every HTTP request
// is journaled forever. `warn` keeps the log to things that describe a problem,
// which is what a log nobody reads daily is actually for. Turning it up is one
// environment variable.

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

const DEFAULT_LEVEL = 'warn';

/**
 * The pino level named by `raw`, or the default when it names nothing valid.
 *
 * Returns the reason alongside the level so the caller can say out loud that a
 * value was ignored. A misspelled LOG_LEVEL that silently becomes the default
 * is indistinguishable from one that worked, which is how someone ends up
 * debugging production with the logging they thought they had turned on.
 */
function resolveLogLevel(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return { level: DEFAULT_LEVEL, source: 'default' };
    }

    const normalized = String(raw).trim().toLowerCase();

    if (LEVELS.includes(normalized)) {
        return { level: normalized, source: 'env' };
    }

    return { level: DEFAULT_LEVEL, source: 'invalid', rejected: String(raw).trim() };
}

/**
 * Whether SQL statement tracing should be wired up at this level.
 *
 * Deliberately a separate decision from "would pino print a debug line". The
 * trace is better-sqlite3's `verbose` hook, and passing that hook at all makes
 * the driver expand every statement's bound parameters into a string —
 * unconditionally, before any level check could discard it. So the hook is
 * attached only when the level would actually emit it; at `warn` the work is
 * never done rather than done and thrown away.
 */
function isSqlTraceEnabled(level) {
    return level === 'trace' || level === 'debug';
}

module.exports = { LEVELS, DEFAULT_LEVEL, resolveLogLevel, isSqlTraceEnabled };
