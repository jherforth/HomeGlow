const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting pool claim marker schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // A bonus chore claimed from the pool needs to be distinguishable
        // from one a parent assigned on purpose: the nightly cleanup
        // returns only claimed schedules to the pool, and a parent's card
        // stays theirs overnight, clams or not (issue #386 review). The
        // marker is the local date the claim was made (YYYY-MM-DD, like
        // due_date); the nightly job clears it when it returns the chore.
        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all().map((c) => c.name);
        if (!columns.includes('pool_claimed_on')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN pool_claimed_on TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Pool claim marker schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Pool claim marker schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
