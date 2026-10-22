// The schema migration registry against the files in server/migrations.
// applySchemaMigrations runs every entry above a database's SYSTEM_SCHEMA_ID,
// so two branches that each take "the next number" both pass alone, and after
// the merge a database that already ran one of them never runs the other.
// Git only notices when both edit the same lines of the registry.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const registry = require('../migrations/registry');

const SERVER_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(SERVER_DIR, 'migrations');
const NUMBERED_FILE = /^schema(\d+)-.+\.js$/;

const resolveEntry = (entry) => require.resolve(path.join(SERVER_DIR, entry.migrationPath));
// A missing file is the second test's failure; the others skip it.
const tryResolve = (entry) => {
  try { return resolveEntry(entry); } catch { return null; }
};

test('no schemaId is registered twice', () => {
  const seen = new Map();
  for (const entry of registry) {
    assert.ok(Number.isInteger(entry.schemaId) && entry.schemaId > 0, `bad schemaId ${entry.schemaId}`);
    assert.ok(
      !seen.has(entry.schemaId),
      `schemaId ${entry.schemaId} is used by both ${seen.get(entry.schemaId)} and ${entry.migrationPath}; renumber the newer one`
    );
    seen.set(entry.schemaId, entry.migrationPath);
  }
});

test('every registered migration file exists', () => {
  for (const entry of registry) {
    assert.doesNotThrow(() => resolveEntry(entry), `${entry.migrationPath} (schemaId ${entry.schemaId}) not found`);
  }
});

test("a schemaN- file's number matches its schemaId", () => {
  for (const entry of registry) {
    const file = tryResolve(entry);
    const match = file && path.basename(file).match(NUMBERED_FILE);
    if (!match) continue;
    assert.equal(Number(match[1]), entry.schemaId, `${entry.migrationPath} is registered as schemaId ${entry.schemaId}`);
  }
});

test('every schemaN- file is registered', () => {
  const registered = new Set(registry.map(tryResolve));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => NUMBERED_FILE.test(name));
  assert.ok(files.length > 0, 'no schemaN- files found');
  for (const name of files) {
    assert.ok(registered.has(path.join(MIGRATIONS_DIR, name)), `${name} is not in migrations/registry.js`);
  }
});
