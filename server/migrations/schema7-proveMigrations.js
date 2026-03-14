const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {

    console.log(`=== Starting device schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {

        // =======================
        // MIGRATION SQL GOES HERE
        // =======================

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );
        db.exec('COMMIT');
        console.log(`=== Device schema migration completed successfully (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Device schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
