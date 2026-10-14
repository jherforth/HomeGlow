const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore expiry schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Chores that expire (issue #279). A schedule with a due time can
        // expire `expire_minutes` after it (0 = at the due time; NULL = never).
        // An expired chore is completed only with a parent's approval, and
        // that completion is marked `approved_late`. A routine's own setting
        // runs from its end time; it writes its schedules' expire_minutes.
        //
        // Guarded so a replayed migration stays idempotent.
        const addColumn = (table, column, definition) => {
            const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
            if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        };
        addColumn('chore_schedules', 'expire_minutes', 'INTEGER');
        addColumn('chore_history', 'approved_late', 'INTEGER NOT NULL DEFAULT 0');
        addColumn('routines', 'expire_minutes', 'INTEGER');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore expiry schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore expiry schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
