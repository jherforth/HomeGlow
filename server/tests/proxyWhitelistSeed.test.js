// Schema 35 writes the Liturgical Day host into PROXY_WHITELIST once, where
// the proxy used to add it on every request.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');

const MIGRATION = path.resolve(__dirname, '../migrations/schema35-proxyWhitelistSeed.js');

function migrate(whitelist) {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
    if (whitelist !== undefined) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('PROXY_WHITELIST', whitelist);
    globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT = { db, schemaIdKey: 'schema_id', targetSchemaId: 35 };
    delete require.cache[MIGRATION];
    require(MIGRATION);
    delete globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
    const value = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
    return { whitelist: value('PROXY_WHITELIST'), schemaId: value('schema_id') };
}

test('adds the host to a whitelist that lacks it, keeping the others', () => {
    assert.deepEqual(migrate('example.com, news.example'), {
        whitelist: 'example.com,news.example,calapi.inadiutorium.cz',
        schemaId: '35',
    });
});

test('writes it when there is no whitelist, or an empty one', () => {
    assert.equal(migrate().whitelist, 'calapi.inadiutorium.cz');
    assert.equal(migrate('').whitelist, 'calapi.inadiutorium.cz');
});

test('leaves a whitelist that already has it as it was', () => {
    assert.equal(migrate('calapi.inadiutorium.cz , example.com').whitelist, 'calapi.inadiutorium.cz , example.com');
});
