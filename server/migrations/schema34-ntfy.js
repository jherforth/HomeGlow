const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting ntfy schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // ntfy topics (issue #288): a second way, beside browser push, to tell
        // a phone that a chore or a day is done. HomeGlow publishes to a topic
        // on an ntfy server and the ntfy app on the phone shows it, so it needs
        // neither HTTPS nor an installed web app. The household keeps a list
        // of topics (Family → Notifications), each with what it hears and about
        // whom, like a device's browser push (device_notifications). The ntfy
        // connection itself (on/off, server, token, the address a tap opens)
        // is in settings: NTFY_ENABLED, NTFY_SERVER, NTFY_TOKEN_ENC, NTFY_OPEN_URL.
        db.exec(`
            CREATE TABLE IF NOT EXISTS ntfy_topics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                topic TEXT NOT NULL UNIQUE,
                events_json TEXT NOT NULL DEFAULT '[]',
                members_json TEXT,
                language TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_success_at TEXT,
                last_failure_at TEXT,
                last_failure TEXT
            )
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== ntfy schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== ntfy schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
