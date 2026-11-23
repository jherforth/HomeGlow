const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting plugin permission grants schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // The permissions an admin switched on for a plugin (issue #402): a
        // JSON list such as ["microphone"], or NULL for none, which is how
        // every installed plugin starts. A plugin gets only what its
        // manifest asks for and this list grants (utils/pluginPermissions.js),
        // so an update that asks for something new starts with it off. Kept
        // across updates, gone with the row when the plugin is deleted.
        const columns = db.prepare('PRAGMA table_info(plugins)').all().map((c) => c.name);
        if (!columns.includes('permission_grants')) {
            db.exec('ALTER TABLE plugins ADD COLUMN permission_grants TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Plugin permission grants schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Plugin permission grants schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
