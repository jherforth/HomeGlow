// Log output format, resolved once from the environment.
//
// `pretty` is the default, which is the opposite of pino's own default and is
// deliberate. HomeGlow runs on a Pi under journald, and the person reading its
// log is usually an operator with `journalctl` open, not a pipeline. journald
// already stamps every line with time, host and pid, so pino's JSON fields are
// redundant there; what is wanted is a level and a message a human can scan.
//
// `json` is for anyone who does feed a pipeline (Loki, Datadog, `journalctl -o
// json`), where each field being machine-parseable is the whole point.

const FORMATS = ['pretty', 'json'];

const DEFAULT_FORMAT = 'pretty';

/** The format named by `raw`, or the default, with the reason alongside. */
function resolveLogFormat(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return { format: DEFAULT_FORMAT, source: 'default' };
    }

    const normalized = String(raw).trim().toLowerCase();

    if (FORMATS.includes(normalized)) {
        return { format: normalized, source: 'env' };
    }

    return { format: DEFAULT_FORMAT, source: 'invalid', rejected: String(raw).trim() };
}

/**
 * pino transport options for a format, or undefined for pino's native JSON.
 *
 * `ignore: 'pid,hostname'` because journald supplies both; `translateTime`
 * because an epoch-millisecond integer is not something a person reads.
 */
function transportFor(format) {
    if (format !== 'pretty') return undefined;

    return {
        target: 'pino-pretty',
        options: {
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
            colorize: false,
            // One journal entry per event. Without this, pino-pretty renders
            // each object field on its own indented line, and a single request
            // log becomes seven journal rows.
            singleLine: true,
        },
    };
}

module.exports = { FORMATS, DEFAULT_FORMAT, resolveLogFormat, transportFor };
