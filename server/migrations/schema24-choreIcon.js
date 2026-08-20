const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore icon schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Optional emoji for a chore (issue #141). Stored on the chore rather
        // than the schedule: the icon describes what the chore *is*, so every
        // schedule of "Make your bed" should show the same picture regardless
        // of who it is assigned to or when it recurs.
        //
        // TEXT with no default — NULL means "no icon", and the widget keeps
        // showing its checkmark for those. Emoji are stored as the literal
        // character rather than a name, so adding one to the bank later needs
        // no migration and an unknown value still renders.
        //
        // Guarded so a replayed migration (schema id reset while the column
        // survives) stays idempotent.
        const choreColumns = db.prepare('PRAGMA table_info(chores)').all().map((c) => c.name);
        if (!choreColumns.includes('icon')) {
            db.exec('ALTER TABLE chores ADD COLUMN icon TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore icon schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore icon schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
