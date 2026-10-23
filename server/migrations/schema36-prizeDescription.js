const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting prize description schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // A prize can say what it is beyond its name ("Movie night: you pick
        // the film and the snacks"). Shown under the name in the Admin list
        // and the kiosk's prize store. NULL is no description.
        const prizeColumns = db.prepare('PRAGMA table_info(prizes)').all().map((c) => c.name);
        if (!prizeColumns.includes('description')) {
            db.exec('ALTER TABLE prizes ADD COLUMN description TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Prize description schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Prize description schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
