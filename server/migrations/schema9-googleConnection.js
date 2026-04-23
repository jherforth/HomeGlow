const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting Google connection schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS google_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub TEXT UNIQUE,
                email TEXT,
                name TEXT,
                picture TEXT,
                access_token_enc TEXT,
                refresh_token_enc TEXT,
                token_expiry TEXT,
                scopes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS google_oauth_states (
                state TEXT PRIMARY KEY,
                redirect_uri TEXT NOT NULL,
                return_url TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_google_oauth_states_created ON google_oauth_states(created_at);
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );
        db.exec('COMMIT');
        console.log(`=== Google connection schema migration completed successfully (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Google connection schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
