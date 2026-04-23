const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting Google Photos Picker schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS google_picked_media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL,
                google_media_id TEXT NOT NULL,
                filename TEXT,
                mime_type TEXT,
                local_path TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                created_time TEXT,
                downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_id, google_media_id),
                FOREIGN KEY (source_id) REFERENCES photo_sources(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_google_picked_media_source ON google_picked_media(source_id);
        `);

        const columns = db.prepare('PRAGMA table_info(photo_sources)').all();
        const hasPickerSession = columns.some((c) => c.name === 'picker_session_id');
        if (!hasPickerSession) {
            db.exec(`ALTER TABLE photo_sources ADD COLUMN picker_session_id TEXT`);
        }
        const hasPickerExpire = columns.some((c) => c.name === 'picker_session_expire');
        if (!hasPickerExpire) {
            db.exec(`ALTER TABLE photo_sources ADD COLUMN picker_session_expire TEXT`);
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );
        db.exec('COMMIT');
        console.log(`=== Google Photos Picker schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Google Photos Picker schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
