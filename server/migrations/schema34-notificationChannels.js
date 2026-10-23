const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting notification channels schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Two more ways to deliver the notifications browser push sends
        // (services/notifications.js composes them all), set up in Admin →
        // System → Notifications. Each recipient chooses, as a device does,
        // which events (chore ones and "plugin:<id>"), about whom, and in
        // which language, and keeps a record of its last send.
        //
        // ntfy topics: HomeGlow publishes to a topic on an ntfy server and the
        // ntfy app shows it. The connection (on/off, server, token) is in
        // settings: NTFY_ENABLED, NTFY_SERVER, NTFY_TOKEN_ENC.
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

        // Home Assistant phones: the Companion app's notify.mobile_app_<name>
        // actions, through the existing Home Assistant connection. A phone is
        // listed here once it is turned on.
        db.exec(`
            CREATE TABLE IF NOT EXISTS ha_notify_phones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone_id TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                platform TEXT,
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
        console.log(`=== Notification channels schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Notification channels schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
