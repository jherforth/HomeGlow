const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting prize pause schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // A paused prize stays in the ledger and on the shelf, but kids can't
        // see or request it until it's resumed.
        const prizeColumns = db.prepare('PRAGMA table_info(prizes)').all().map((c) => c.name);
        if (!prizeColumns.includes('paused')) {
            db.exec('ALTER TABLE prizes ADD COLUMN paused INTEGER NOT NULL DEFAULT 0');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Prize pause schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Prize pause schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
