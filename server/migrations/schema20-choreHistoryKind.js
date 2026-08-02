const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore history kind schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Issue #72: chore_history rows were distinguishable only by magic
        // strings ('Regular chores', 'Adjustment', ...). A typed `kind` column
        // makes metrics computable and fixes the daily-bonus dedupe/revoke
        // fragility (it matched on clam_value = the *current* reward setting).
        //
        // Vocabulary: completion | daily_bonus | transfer_bonus | adjustment |
        // missed | spent. NOT NULL DEFAULT 'completion' means any writer we
        // missed degrades to the pre-#72 status quo instead of NULL.
        db.exec("ALTER TABLE chore_history ADD COLUMN kind TEXT NOT NULL DEFAULT 'completion'");

        // Backfill, most-specific first; the column default covers real
        // completions (title = chore title, schedule id set).
        db.exec(`
            UPDATE chore_history SET kind = 'daily_bonus'
              WHERE title = 'Regular chores' AND chore_schedule_id IS NULL;
            UPDATE chore_history SET kind = 'transfer_bonus' WHERE title = 'Transfer bonus';
            UPDATE chore_history SET kind = 'adjustment' WHERE title = 'Adjustment';
        `);
        // Legacy migrateClamsToHistory balance imports (NULL title, NULL
        // schedule) are balances, NOT completions — counting them as
        // completions would inflate metrics.
        db.exec(`
            UPDATE chore_history SET kind = 'adjustment'
              WHERE title IS NULL AND chore_schedule_id IS NULL
        `);

        // Partial unique index = hard idempotency for the nightly missed
        // logger (INSERT OR IGNORE target).
        db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_chore_history_missed_unique
              ON chore_history(user_id, chore_schedule_id, date) WHERE kind = 'missed'
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_chore_history_kind ON chore_history(kind)');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore history kind schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore history kind schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
