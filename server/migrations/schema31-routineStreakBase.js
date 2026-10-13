const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting routine streak schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // A routine's streak is counted against when it runs. Changing that
        // (its days, or weekdays to calendar events) keeps the run it had:
        // `streak_base` days in a row up to the day before `streak_base_date`,
        // and the new days count on from that date. NULL date: never changed.
        //
        // Guarded so a replayed migration stays idempotent.
        const columns = db.prepare('PRAGMA table_info(routines)').all().map((c) => c.name);
        if (!columns.includes('streak_base')) {
            db.exec('ALTER TABLE routines ADD COLUMN streak_base INTEGER NOT NULL DEFAULT 0');
        }
        if (!columns.includes('streak_base_date')) {
            db.exec('ALTER TABLE routines ADD COLUMN streak_base_date TEXT');
        }

        // Streak rewards have a kind of their own, apart from a parent's
        // corrections ('adjustment'). Rewards already paid by the core were
        // written as adjustments titled "<routine>: N in a row".
        db.exec(`
            UPDATE chore_history SET kind = 'streak'
            WHERE kind = 'adjustment' AND chore_schedule_id IS NULL AND title LIKE '%: % in a row'
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Routine streak schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Routine streak schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
