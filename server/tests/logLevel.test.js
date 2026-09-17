const test = require('node:test');
const assert = require('node:assert');

const {
    LEVELS,
    DEFAULT_LEVEL,
    resolveLogLevel,
    isSqlTraceEnabled,
} = require('../utils/logLevel');

test('the default is warn, so an unattended install is quiet without configuration', () => {
    assert.strictEqual(DEFAULT_LEVEL, 'warn');

    for (const unset of [undefined, null, '', '   ']) {
        const { level, source } = resolveLogLevel(unset);
        assert.strictEqual(level, 'warn');
        assert.strictEqual(source, 'default');
    }
});

test('every pino level is accepted, case and whitespace insensitively', () => {
    for (const name of LEVELS) {
        assert.strictEqual(resolveLogLevel(name).level, name);
        assert.strictEqual(resolveLogLevel(name.toUpperCase()).level, name);
        assert.strictEqual(resolveLogLevel(`  ${name}  `).level, name);
        assert.strictEqual(resolveLogLevel(name).source, 'env');
    }
});

test('the vocabulary is pino\'s, not one invented here', () => {
    assert.deepStrictEqual(LEVELS, ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']);
});

test('a value that names no level falls back, and says which value it rejected', () => {
    // The reason matters more than the fallback: a misspelling that silently
    // becomes the default looks identical to one that worked.
    const { level, source, rejected } = resolveLogLevel('verbose');
    assert.strictEqual(level, 'warn');
    assert.strictEqual(source, 'invalid');
    assert.strictEqual(rejected, 'verbose');

    for (const bad of ['DEBUGGING', '1', 'true', 'off', 'none']) {
        assert.strictEqual(resolveLogLevel(bad).source, 'invalid', `${bad} should not be a level`);
    }
});

test('an invalid value is distinguishable from an absent one', () => {
    // Both land on warn. Only `source` tells the operator whether their
    // LOG_LEVEL did anything, which is the whole point of reporting it.
    assert.strictEqual(resolveLogLevel(undefined).level, resolveLogLevel('nonsense').level);
    assert.notStrictEqual(resolveLogLevel(undefined).source, resolveLogLevel('nonsense').source);
});

test('SQL tracing is enabled only at debug and trace', () => {
    assert.strictEqual(isSqlTraceEnabled('debug'), true);
    assert.strictEqual(isSqlTraceEnabled('trace'), true);

    for (const quiet of ['info', 'warn', 'error', 'fatal', 'silent']) {
        assert.strictEqual(isSqlTraceEnabled(quiet), false, `${quiet} must not trace SQL`);
    }
});

test('the shipped default does not trace SQL', () => {
    // The regression this whole change exists to prevent: an install that sets
    // nothing must not echo statements. 32MB per 12h on a Pi, with calendar
    // contents inlined, came from this being unconditional.
    assert.strictEqual(isSqlTraceEnabled(resolveLogLevel(undefined).level), false);
});

// --- the behaviour the level controls, exercised against the real driver ---

const Database = require('better-sqlite3');

function captureStatements(level) {
    const seen = [];
    const db = isSqlTraceEnabled(level)
        ? new Database(':memory:', { verbose: (sql) => seen.push(sql) })
        : new Database(':memory:');

    db.exec('CREATE TABLE calendar_events_cache (id TEXT PRIMARY KEY, title TEXT, location TEXT)');
    db.prepare('INSERT OR REPLACE INTO calendar_events_cache (id, title, location) VALUES (?, ?, ?)')
        .run('evt1', "Dentist - Emma's cleaning", '123 Elm St, Springfield');
    db.close();
    return seen;
}

test('at debug, the driver echoes statements with bound values expanded', () => {
    // This is the positive control. Without it, the assertions below pass
    // against a probe that never captured anything, which is not evidence.
    const seen = captureStatements('debug');
    assert.ok(seen.length > 0, 'debug must capture statements');
    assert.ok(
        seen.some((sql) => sql.includes('Emma') && sql.includes('Elm St')),
        'better-sqlite3 inlines bound parameters, so the trace carries event contents'
    );
});

test('at the shipped default, no statement reaches the log at all', () => {
    const seen = captureStatements(resolveLogLevel(undefined).level);
    assert.deepStrictEqual(seen, [], 'default level must attach no verbose hook');
});

test('no quiet level leaks calendar contents', () => {
    for (const quiet of ['info', 'warn', 'error', 'fatal', 'silent']) {
        assert.deepStrictEqual(captureStatements(quiet), [], `${quiet} must not trace`);
    }
});
