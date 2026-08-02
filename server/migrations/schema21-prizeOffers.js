const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting prize offers schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Prize store instances (prize spending mechanism). Mirrors the
        // chores model: `prizes` is the definitions ledger (kept forever in
        // Prize Management); a prize_offers row is one redeemable instance a
        // parent has placed in the store. Lifecycle:
        //   available -> requested (kid asks) -> redeemed (parent approves;
        //   clams deducted, one-time: gone from the store)
        // Decline/cancel returns requested -> available. Cost is read live
        // from the prize definition at approval; the ledger row snapshots the
        // prize name.
        db.exec(`
            CREATE TABLE IF NOT EXISTS prize_offers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prize_id INTEGER NOT NULL REFERENCES prizes(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'available',
                requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                requested_at TEXT,
                redeemed_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_prize_offers_status ON prize_offers(status)');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Prize offers schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Prize offers schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
