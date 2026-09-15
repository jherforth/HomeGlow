// Route the global console through a leveled logger.
//
// This is an adoption shim, not an architecture. The server has several hundred
// console.* calls written by many hands over a year, and at every one of them
// the author already chose a severity by picking .error, .warn or .log. That
// decision is honoured here rather than re-made: each console method maps to
// the logger level of the same name, so LOG_LEVEL governs all of it at once
// and no call site has to change.
//
// Two details matter:
//
// 1. Arguments are flattened with util.format BEFORE reaching the logger.
//    pino treats trailing arguments as printf interpolation values and drops
//    them when the message has no placeholders, so a bare
//    `logger.info(msg, obj)` would silently lose `obj`. util.format is exactly
//    what console itself does, so output is byte-identical to what console
//    would have printed, only now with a level attached.
//
// 2. It patches the global. Anything that logs through console after this
//    runs -- dependencies included -- goes through the logger and obeys the
//    level. That is mostly the point. It also means a reader who sees
//    `console.error` in this codebase should know it is not writing to stderr.
//
// Migration to explicit logger calls can happen file by file, or never; the
// shim covers whatever has not been converted.

const util = require('util');

const MAPPING = Object.freeze({
    log: 'info',
    info: 'info',
    debug: 'debug',
    warn: 'warn',
    error: 'error',
});

/**
 * Redirect console.{log,info,debug,warn,error} into `logger`.
 *
 * Returns a function that restores the original methods, so tests can install
 * and remove the shim without leaking it into other tests.
 */
function installConsoleShim(logger, target = console) {
    const originals = {};

    for (const [method, level] of Object.entries(MAPPING)) {
        originals[method] = target[method];
        target[method] = (...args) => {
            logger[level](util.format(...args));
        };
    }

    return function uninstallConsoleShim() {
        for (const method of Object.keys(originals)) {
            target[method] = originals[method];
        }
    };
}

module.exports = { MAPPING, installConsoleShim };
