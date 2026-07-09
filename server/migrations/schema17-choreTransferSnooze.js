const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore transfer/snooze schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
        const hasColumn = (name) => columns.some((col) => col.name === name);

        // Per-schedule gates for the dashboard long-press actions (issue #122).
        // Default 1 keeps every existing schedule transferable/snoozable.
        if (!hasColumn('transferable')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN transferable INTEGER DEFAULT 1');
        }
        if (!hasColumn('can_snooze')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN can_snooze INTEGER DEFAULT 1');
        }

        // ISO UTC datetime; while in the future the chore is hidden from the
        // dashboard and excluded from the daily-completion bonus set.
        if (!hasColumn('snoozed_until')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN snoozed_until TEXT');
        }

        // Pending completion bonus set by the "keep current reward" transfer
        // path; paid out (and cleared) when the chore is completed.
        if (!hasColumn('transfer_bonus_clams')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN transfer_bonus_clams INTEGER DEFAULT 0');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore transfer/snooze schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore transfer/snooze schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
