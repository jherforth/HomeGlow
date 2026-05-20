const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting once-completed scheduling schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
        const hasInterval = columns.some(col => col.name === 'interval');
        const hasParentScheduleId = columns.some(col => col.name === 'parent_schedule_id');

        if (!hasInterval) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN interval TEXT');
        }

        if (!hasParentScheduleId) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN parent_schedule_id INTEGER REFERENCES chore_schedules(id) ON DELETE SET NULL');
        }

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_chore_schedules_parent_schedule_id ON chore_schedules(parent_schedule_id);
            CREATE INDEX IF NOT EXISTS idx_chore_schedules_duration ON chore_schedules(duration);
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Once-completed scheduling schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Once-completed scheduling schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
