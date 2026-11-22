const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting chore claim users schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Who may claim a bonus chore from the pool (issue #403): a JSON
        // list of user ids on the schedule, or NULL for everyone, which is
        // how every schedule behaved before. A sticky chore's card has none
        // of its own and follows its parent schedule's
        // (utils/choreClaimers.js).
        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all().map((c) => c.name);
        if (!columns.includes('claim_user_ids')) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN claim_user_ids TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Chore claim users schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Chore claim users schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
