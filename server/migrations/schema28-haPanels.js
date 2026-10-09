const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting Home Assistant panels schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Home Assistant panels (issue #252). A panel is a recipe drawn by
        // one built-in template; its plugin row (source 'builder') is what
        // puts it on the dashboard like any plugin. Deleting the plugin from
        // the Plugins list deletes the recipe with it.
        db.exec(`
            CREATE TABLE IF NOT EXISTS ha_panels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plugin_row_id INTEGER NOT NULL UNIQUE REFERENCES plugins(id) ON DELETE CASCADE,
                recipe_json TEXT NOT NULL,
                template_ver INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // What panels did, for the builder's history: which display, which
        // entity, what, and whether it worked. Kept short (pruned to the
        // newest 1000 on write).
        db.exec(`
            CREATE TABLE IF NOT EXISTS ha_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                plugin_id TEXT NOT NULL,
                device_name TEXT,
                entity_id TEXT NOT NULL,
                action TEXT NOT NULL,
                ok INTEGER NOT NULL,
                error TEXT
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_ha_actions_at ON ha_actions(at)');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Home Assistant panels schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Home Assistant panels schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
