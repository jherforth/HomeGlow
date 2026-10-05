const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore spawn schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Spawn child chores after completion. When a schedule with these set
        // is completed, a new visible one-time schedule is created for each
        // user in spawn_user_ids using the spawn_chore_id chore.
        //
        // spawn_chore_id: the chore to create for each child (NULL = no spawn).
        // spawn_user_ids: JSON array of user IDs to create the child for.
        //
        // Guarded so a replayed migration stays idempotent.
        const scheduleColumns = db.prepare('PRAGMA table_info(chore_schedules)').all().map((c) => c.name);
        if (!scheduleColumns.includes('spawn_chore_id')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN spawn_chore_id INTEGER REFERENCES chores(id)');
        }
        if (!scheduleColumns.includes('spawn_user_ids')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN spawn_user_ids TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore spawn schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore spawn schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
