const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting device schema migration to version ${targetSchemaId} ===`);

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');

    try {
        db.exec(`
            DROP TABLE IF EXISTS devices;
            CREATE TABLE devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                updateTime TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_devices_device_name ON devices(name);

            DROP TABLE IF EXISTS tabs;
            CREATE TABLE tabs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_name TEXT NOT NULL,
                number INTEGER NOT NULL,
                label TEXT NOT NULL,
                icon TEXT NOT NULL,
                show_label INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_name) REFERENCES devices(name) ON DELETE CASCADE ON UPDATE CASCADE,
                UNIQUE(device_name, number)
            );
            CREATE INDEX IF NOT EXISTS idx_tabs_device_name ON tabs(device_name);

            DROP TABLE IF EXISTS widget_tab_assignments;
            CREATE TABLE widget_tab_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_name TEXT NOT NULL,
                tab_number INTEGER NOT NULL,
                widget_name TEXT NOT NULL,
                layout_x INTEGER,
                layout_y INTEGER,
                layout_w INTEGER,
                layout_h INTEGER,
                FOREIGN KEY (device_name) REFERENCES devices(name) ON DELETE CASCADE ON UPDATE CASCADE,
                FOREIGN KEY (device_name, tab_number) REFERENCES tabs(device_name, number) ON DELETE CASCADE ON UPDATE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_widget_tab_assignments_widget ON widget_tab_assignments(widget_name);
            CREATE INDEX IF NOT EXISTS idx_widget_tab_assignments_tab_number ON widget_tab_assignments(tab_number);
            CREATE INDEX IF NOT EXISTS idx_widget_tab_assignments_device_name_tab_number ON widget_tab_assignments(device_name, tab_number);
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
    } finally {
        db.exec('PRAGMA foreign_keys = ON');
    }
} catch (error) {
    console.error('=== Device schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
