const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

// The proxy used to add this host (the Liturgical Day plugin's calendar API)
// to the whitelist on every request, so it could not be removed. It is now
// written into PROXY_WHITELIST once, where an admin can see and remove it.
const SEEDED_HOST = 'calapi.inadiutorium.cz';

try {
    console.log(`=== Starting proxy whitelist seed migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('PROXY_WHITELIST');
        const hosts = (row && row.value ? row.value.split(',') : []).map((host) => host.trim()).filter(Boolean);
        if (!hosts.includes(SEEDED_HOST)) {
            hosts.push(SEEDED_HOST);
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('PROXY_WHITELIST', hosts.join(','));
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Proxy whitelist seed migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Proxy whitelist seed migration failed ===');
    console.error('Error:', error);
    throw error;
}
