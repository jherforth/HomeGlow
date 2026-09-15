const test = require('node:test');
const assert = require('node:assert');

const { FORMATS, DEFAULT_FORMAT, resolveLogFormat, transportFor } = require('../utils/logFormat');

test('pretty is the default, because the reader is usually a person with journalctl open', () => {
    assert.strictEqual(DEFAULT_FORMAT, 'pretty');
    for (const unset of [undefined, null, '', '  ']) {
        assert.deepStrictEqual(resolveLogFormat(unset), { format: 'pretty', source: 'default' });
    }
});

test('both formats are accepted, case and whitespace insensitively', () => {
    assert.deepStrictEqual(FORMATS, ['pretty', 'json']);
    for (const f of FORMATS) {
        assert.strictEqual(resolveLogFormat(f).format, f);
        assert.strictEqual(resolveLogFormat(` ${f.toUpperCase()} `).format, f);
        assert.strictEqual(resolveLogFormat(f).source, 'env');
    }
});

test('an unknown format falls back and names what it rejected', () => {
    const r = resolveLogFormat('yaml');
    assert.strictEqual(r.format, 'pretty');
    assert.strictEqual(r.source, 'invalid');
    assert.strictEqual(r.rejected, 'yaml');
});

test('json means pino native output: no transport at all', () => {
    assert.strictEqual(transportFor('json'), undefined);
});

test('pretty configures pino-pretty and drops the fields journald already supplies', () => {
    const t = transportFor('pretty');
    assert.strictEqual(t.target, 'pino-pretty');
    assert.strictEqual(t.options.ignore, 'pid,hostname');
    assert.ok(t.options.translateTime, 'a human-readable timestamp, not epoch ms');
    assert.strictEqual(t.options.colorize, false, 'no ANSI escapes into journald');
    assert.strictEqual(t.options.singleLine, true, 'one journal entry per event');
});

test('the pretty transport target is actually installed', () => {
    // A transport that names a missing module fails at logger construction,
    // i.e. at server boot, which is the worst place to find out.
    assert.doesNotThrow(() => require.resolve(transportFor('pretty').target));
});
