const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting routines schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Routines, moved into the core from the Routines plugin. A routine
        // owns ONE ordinary chore (clam_value 0) and its schedules: one
        // weekday schedule, or one pinned to each matching calendar event's
        // day. The ledger, the daily bonus, missed-chore logging and vacation
        // mode all work on that chore unchanged; the steps, their progress and
        // the streak rewards live here. Deleting the chore deletes the routine.

        // The step library: build a step once, use it in any routine.
        db.exec(`
            CREATE TABLE IF NOT EXISTS routine_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                icon TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS routines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                icon TEXT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                chore_id INTEGER NOT NULL UNIQUE REFERENCES chores(id) ON DELETE CASCADE,
                trigger TEXT NOT NULL DEFAULT 'days',
                days TEXT,
                schedule_id INTEGER REFERENCES chore_schedules(id) ON DELETE SET NULL,
                match_text TEXT,
                whole_word INTEGER NOT NULL DEFAULT 1,
                calendar_source_ids TEXT,
                lead_minutes INTEGER NOT NULL DEFAULT 0,
                start_time TEXT,
                end_time TEXT,
                milestone_every INTEGER NOT NULL DEFAULT 0,
                milestone_clams INTEGER NOT NULL DEFAULT 0,
                last_award_streak INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // A routine's steps, in order.
        db.exec(`
            CREATE TABLE IF NOT EXISTS routine_step_links (
                routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                step_id INTEGER NOT NULL REFERENCES routine_steps(id) ON DELETE CASCADE,
                PRIMARY KEY (routine_id, position)
            )
        `);

        // One row per step ticked on a day, so a tick is an insert or a
        // delete on its own, and two screens ticking at once never overwrite
        // each other.
        db.exec(`
            CREATE TABLE IF NOT EXISTS routine_progress (
                routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                step_id INTEGER NOT NULL,
                done_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (routine_id, date, step_id)
            )
        `);

        // A calendar routine's schedule pinned to each matching event's day.
        db.exec(`
            CREATE TABLE IF NOT EXISTS routine_dates (
                routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                schedule_id INTEGER NOT NULL REFERENCES chore_schedules(id) ON DELETE CASCADE,
                due_time TEXT,
                PRIMARY KEY (routine_id, date)
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_routine_dates_schedule ON routine_dates(schedule_id)');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Routines schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Routines schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
