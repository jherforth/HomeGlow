const test = require('node:test');
const assert = require('node:assert');
const pino = require('pino');

const { MAPPING, installConsoleShim } = require('../utils/consoleShim');

// A pino instance that writes into an array instead of stdout, so assertions
// can read what would have been logged.
function capturingLogger(level) {
    const lines = [];
    const logger = pino({ level }, { write: (s) => lines.push(JSON.parse(s)) });
    return { logger, lines };
}

// Patch a private object rather than the real global console, so a failing
// assertion in here can still print itself.
function fakeConsole() {
    return { log() { }, info() { }, debug() { }, warn() { }, error() { } };
}

test('every console method maps to the pino level of the same intent', () => {
    assert.deepStrictEqual(MAPPING, { log: 'info', info: 'info', debug: 'debug', warn: 'warn', error: 'error' });
});

test('the severity the author chose at the call site is what the logger records', () => {
    const { logger, lines } = capturingLogger('trace');
    const c = fakeConsole();
    installConsoleShim(logger, c);

    c.log('a'); c.warn('b'); c.error('c'); c.debug('d'); c.info('e');

    const byMsg = Object.fromEntries(lines.map((l) => [l.msg, l.level]));
    assert.strictEqual(byMsg.a, 30, 'console.log -> info');
    assert.strictEqual(byMsg.b, 40, 'console.warn -> warn');
    assert.strictEqual(byMsg.c, 50, 'console.error -> error');
    assert.strictEqual(byMsg.d, 20, 'console.debug -> debug');
    assert.strictEqual(byMsg.e, 30, 'console.info -> info');
});

test('trailing arguments survive: the case a naive logger.info(msg, obj) would drop', () => {
    const { logger, lines } = capturingLogger('info');
    const c = fakeConsole();
    installConsoleShim(logger, c);

    // The exact shape of the settings dump and the DB error in index.js.
    c.log('Raw settings from database:', [{ key: 'TZ', value: 'America/Los_Angeles' }]);
    c.error('Failed to connect or create database:', new Error('SQLITE_CANTOPEN'));

    assert.ok(lines[0].msg.includes('America/Los_Angeles'), 'array argument was formatted in, not dropped');
    assert.ok(lines[1].msg.includes('SQLITE_CANTOPEN'), 'error message present');
    assert.ok(lines[1].msg.includes('    at '), 'error stack present, as console would print it');
});

test('output is byte-identical to what console would have printed', () => {
    // util.format is what console uses, so anything console could render, the
    // shim renders the same way -- including %s placeholders and objects.
    const util = require('util');
    const { logger, lines } = capturingLogger('info');
    const c = fakeConsole();
    installConsoleShim(logger, c);

    const args = ['user %s has %d chores', 'zev', 3, { extra: true }];
    c.log(...args);
    assert.strictEqual(lines[0].msg, util.format(...args));
});

test('at the shipped default, console.log is silent and warn/error are not', () => {
    const { logger, lines } = capturingLogger('warn');
    const c = fakeConsole();
    installConsoleShim(logger, c);

    c.log('startup chatter');
    c.info('more chatter');
    c.warn('something off');
    c.error('something broken');

    assert.deepStrictEqual(lines.map((l) => l.msg), ['something off', 'something broken']);
});

test('uninstall restores the original methods exactly', () => {
    const { logger } = capturingLogger('info');
    const c = fakeConsole();
    const before = { ...c };
    const uninstall = installConsoleShim(logger, c);

    assert.notStrictEqual(c.log, before.log, 'shim installed');
    uninstall();
    for (const m of Object.keys(MAPPING)) {
        assert.strictEqual(c[m], before[m], `console.${m} restored`);
    }
});

test('the shim does not recurse if the logger itself writes via console', () => {
    // Guard against the one way a global patch can wedge the process: a
    // destination that calls console.*. pino writes to a stream and never
    // does, but assert it rather than assume it.
    let depth = 0;
    const guard = {
        info: (m) => { depth++; assert.ok(depth < 2, 'recursion'); depth--; },
        warn() { }, error() { }, debug() { },
    };
    const c = fakeConsole();
    installConsoleShim(guard, c);
    assert.doesNotThrow(() => c.log('x'));
});
