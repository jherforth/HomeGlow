const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting user sort order schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Display order for users (issue #134). Named sort_order to match the
        // existing convention on calendar_sources / photo_sources, which are
        // read with the same `ORDER BY sort_order, id` idiom.
        //
        // Guarded so a replayed migration (schema id reset while the column
        // survives) stays idempotent.
        const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
        if (!userColumns.includes('sort_order')) {
            db.exec('ALTER TABLE users ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');

            // Backfill with the id so existing households keep the exact order
            // they see today (users previously rendered in insertion order).
            // The reorder endpoint renumbers to a dense 1..n on first use; the
            // `, id` tiebreak keeps ties stable until then.
            db.exec('UPDATE users SET sort_order = id');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== User sort order schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== User sort order schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
