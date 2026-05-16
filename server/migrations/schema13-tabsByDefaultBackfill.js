const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;
const CORE_WIDGET_NAMES = ['calendar', 'weather', 'chores', 'photos'];

try {
    console.log(`=== Starting tabs-by-default backfill migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const ensureDeviceStmt = db.prepare('INSERT OR IGNORE INTO devices (name, updateTime) VALUES (?, CURRENT_TIMESTAMP)');
        const ensureHomeTabStmt = db.prepare(
            'INSERT OR IGNORE INTO tabs (device_name, label, icon, show_label, number) VALUES (?, ?, ?, ?, ?)'
        );
        const hasAssignmentStmt = db.prepare(
            'SELECT id FROM widget_tab_assignments WHERE widget_name = ? AND device_name = ? LIMIT 1'
        );
        const insertAssignmentStmt = db.prepare(
            'INSERT INTO widget_tab_assignments (widget_name, tab_number, device_name) VALUES (?, ?, ?)'
        );

        const deviceNames = new Set();

        db.prepare('SELECT name FROM devices').all().forEach((row) => {
            if (row?.name) {
                deviceNames.add(row.name);
            }
        });

        db.prepare('SELECT DISTINCT device_name AS name FROM tabs').all().forEach((row) => {
            if (row?.name) {
                deviceNames.add(row.name);
            }
        });

        db.prepare('SELECT DISTINCT device_name AS name FROM widget_tab_assignments').all().forEach((row) => {
            if (row?.name) {
                deviceNames.add(row.name);
            }
        });

        let createdDevices = 0;
        let createdHomeTabs = 0;
        let createdAssignments = 0;

        deviceNames.forEach((deviceName) => {
            const deviceResult = ensureDeviceStmt.run(deviceName);
            createdDevices += deviceResult.changes;

            const homeTabResult = ensureHomeTabStmt.run(deviceName, 'Home', 'home', 1, 1);
            createdHomeTabs += homeTabResult.changes;

            CORE_WIDGET_NAMES.forEach((widgetName) => {
                const existing = hasAssignmentStmt.get(widgetName, deviceName);
                if (!existing) {
                    insertAssignmentStmt.run(widgetName, 1, deviceName);
                    createdAssignments += 1;
                }
            });
        });

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Tabs-by-default backfill migration completed (version ${targetSchemaId}) ===`);
        console.log(`Created devices: ${createdDevices}, home tabs: ${createdHomeTabs}, core assignments: ${createdAssignments}`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Tabs-by-default backfill migration failed ===');
    console.error('Error:', error);
    throw error;
}
