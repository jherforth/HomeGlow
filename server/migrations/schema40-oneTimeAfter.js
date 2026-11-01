const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting one-time-after schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // When a repeating schedule is made one-time, the last chore_history
        // id at that moment (ids only grow: AUTOINCREMENT). It still holds the
        // completions from before, its cards' among them, and the nightly
        // cleanup must not take those to mean the one-time chore is done.
        // Null for a schedule that was one-time from the start.
        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all().map((c) => c.name);
        if (!columns.includes('one_time_after_history_id')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN one_time_after_history_id INTEGER');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== One-time-after schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== One-time-after schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
