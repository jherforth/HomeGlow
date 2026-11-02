const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting device viewport schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Mirror mode (remote control) needs the true CSS viewport of the
        // display being controlled. The dashboard reports it, and the report
        // lives in its own column — not inside device_settings_json — so a
        // settings PUT that replaces the whole settings object can never
        // wipe it, and so it never participates in the household-changes
        // bump (a resize must not make every display refetch).
        const columns = db.prepare('PRAGMA table_info(devices)').all().map((c) => c.name);
        if (!columns.includes('viewport_json')) {
            db.exec('ALTER TABLE devices ADD COLUMN viewport_json TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Device viewport schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Device viewport schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
