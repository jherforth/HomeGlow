const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting HomeGlow Photos schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS homeglow_photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT,
                mime_type TEXT,
                size INTEGER,
                uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_id) REFERENCES photo_sources(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_homeglow_photos_source ON homeglow_photos(source_id);
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );
        db.exec('COMMIT');
        console.log(`=== HomeGlow Photos schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== HomeGlow Photos schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
