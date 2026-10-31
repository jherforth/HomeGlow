const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting any-day chores schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // "Once a week, any day" (duration 'weekly', #362) becomes one of the
        // any-day chores, whose period is the schedule's interval
        // (services/anyDayChores.js): 'weekly' is 'any-day' every '1w'. Its
        // cards keep their dates. Replaying this changes nothing.
        db.prepare("UPDATE chore_schedules SET duration = 'any-day', interval = '1w' WHERE duration = 'weekly'").run();

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Any-day chores schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Any-day chores schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
