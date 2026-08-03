const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting prize repeat/split schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Guard each ALTER so a replayed migration run (schema id reset while
        // the columns survive, as the migration tests do) stays idempotent.
        const prizeColumns = db.prepare('PRAGMA table_info(prizes)').all().map((c) => c.name);
        const offerColumns = db.prepare('PRAGMA table_info(prize_offers)').all().map((c) => c.name);

        // Repeatable prizes: a definition-level toggle. Approving an offer of a
        // repeatable prize returns it to the shelf instead of consuming it —
        // no restocking needed. Default 0 keeps the one-time behavior.
        if (!prizeColumns.includes('repeatable')) {
            db.exec('ALTER TABLE prizes ADD COLUMN repeatable INTEGER NOT NULL DEFAULT 0');
        }

        // Cost splitting: a request may name co-spenders. JSON array of user
        // ids (the requester is always a participant and is NOT in this list).
        // At approval each participant pays floor(cost / participants) — the
        // remainder of an uneven split is silently discounted so every kid
        // pays the same share.
        if (!offerColumns.includes('split_user_ids')) {
            db.exec('ALTER TABLE prize_offers ADD COLUMN split_user_ids TEXT');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Prize repeat/split schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Prize repeat/split schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
