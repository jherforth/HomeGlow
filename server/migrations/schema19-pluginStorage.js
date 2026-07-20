const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting plugin storage schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Namespaced key/value store for manifest plugins (issue #105 Phase 1,
        // capability c). Values are JSON documents; plugin_id matches
        // plugins.plugin_id. Server-side state here survives devices, reloads,
        // and image upgrades (tasks.db is bind-mounted).
        db.exec(`
            CREATE TABLE IF NOT EXISTS plugin_storage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plugin_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value_json TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(plugin_id, key)
            )
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Plugin storage schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Plugin storage schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
