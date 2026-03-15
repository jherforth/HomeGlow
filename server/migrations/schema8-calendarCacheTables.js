const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting device schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS calendar_events_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL,
                event_uid TEXT NOT NULL,
                title TEXT,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                description TEXT,
                location TEXT,
                all_day INTEGER DEFAULT 0,
                raw_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE,
                UNIQUE(source_id, event_uid, start_time)
            );

            CREATE INDEX IF NOT EXISTS idx_cache_source_id ON calendar_events_cache(source_id);
            CREATE INDEX IF NOT EXISTS idx_cache_start_time ON calendar_events_cache(start_time);
            CREATE INDEX IF NOT EXISTS idx_cache_end_time ON calendar_events_cache(end_time);

            CREATE TABLE IF NOT EXISTS calendar_sync_status (
                source_id INTEGER PRIMARY KEY,
                last_sync_at TEXT,
                last_sync_status TEXT,
                last_sync_message TEXT,
                event_count INTEGER DEFAULT 0,
                sync_interval_minutes INTEGER DEFAULT 15,
                FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE
            );
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );
        db.exec('COMMIT');
        console.log(`=== Device schema migration completed successfully (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Device schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
