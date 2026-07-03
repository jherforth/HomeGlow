const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore due-date schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
        const hasColumn = (name) => columns.some((col) => col.name === name);

        if (!hasColumn('due_date')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN due_date TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore due-date schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore due-date schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
