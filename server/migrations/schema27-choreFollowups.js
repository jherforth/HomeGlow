const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore follow-ups schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Follow-up chores (issue #241): "when Run the dishwasher is done,
        // give Unload the dishwasher to Liam". A rule belongs to the chore,
        // not a schedule, so a chore with several schedules is set up once.
        //
        // Both chore references cascade: deleting either chore removes the
        // rule, so a chore used as a follow-up can still be deleted (with
        // foreign keys enforced, a plain reference would block it).
        db.exec(`
            CREATE TABLE IF NOT EXISTS chore_followups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
                followup_chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
                user_ids TEXT NOT NULL DEFAULT '[]',
                delay_minutes INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_chore_followups_chore ON chore_followups(chore_id)');

        // A follow-up arrives as an ordinary one-time schedule. These say
        // where it came from:
        //  - followup_rule_id: the rule that made it;
        //  - triggered_by_schedule_id + triggered_on: the completion that
        //    made it, so undoing that completion can remove it. Not a foreign
        //    key: a completed one-time trigger is pruned nightly, and undo
        //    must still find its follow-ups by these values.
        // triggered_on is also what keeps a follow-up out of the daily bonus
        // on the day it appeared.
        const scheduleColumns = db.prepare('PRAGMA table_info(chore_schedules)').all().map((c) => c.name);
        if (!scheduleColumns.includes('followup_rule_id')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN followup_rule_id INTEGER REFERENCES chore_followups(id) ON DELETE SET NULL');
        }
        if (!scheduleColumns.includes('triggered_by_schedule_id')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN triggered_by_schedule_id INTEGER');
        }
        if (!scheduleColumns.includes('triggered_on')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN triggered_on TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore follow-ups schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore follow-ups schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
