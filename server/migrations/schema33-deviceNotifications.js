const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting device notifications schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Push notifications to a device (a phone, usually). One row per
        // device that has them turned on: where its browser's push service
        // takes messages (endpoint, with the keys that encrypt them), what it
        // wants to hear about, and how the last sends went. Kept apart from
        // device_settings_json, which every page load of that device reads,
        // so the push keys never travel with it. Deleting a device deletes
        // its row.
        db.exec(`
            CREATE TABLE IF NOT EXISTS device_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                events_json TEXT NOT NULL DEFAULT '[]',
                members_json TEXT,
                language TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_success_at TEXT,
                last_failure_at TEXT,
                last_failure TEXT
            )
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Device notifications schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Device notifications schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
