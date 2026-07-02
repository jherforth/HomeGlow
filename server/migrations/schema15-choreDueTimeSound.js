const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore due-time/sound schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
        const hasColumn = (name) => columns.some((col) => col.name === name);

        if (!hasColumn('due_time')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN due_time TEXT');
        }
        if (!hasColumn('sound_enabled')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN sound_enabled INTEGER DEFAULT 0');
        }
        if (!hasColumn('sound')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN sound TEXT');
        }
        if (!hasColumn('reminder_interval_minutes')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN reminder_interval_minutes INTEGER');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore due-time/sound schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore due-time/sound schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
