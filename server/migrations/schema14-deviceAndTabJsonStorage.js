const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

function parseConfigJson(configJson) {
    if (!configJson) return {};
    try {
        const parsed = JSON.parse(configJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        // Ignore malformed JSON and fallback to empty object.
    }
    return {};
}

try {
    console.log(`=== Starting device/tab JSON storage migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const deviceColumns = db.prepare('PRAGMA table_info(devices)').all();
        const hasDeviceSettingsJson = deviceColumns.some((col) => col.name === 'device_settings_json');
        if (!hasDeviceSettingsJson) {
            db.exec('ALTER TABLE devices ADD COLUMN device_settings_json TEXT');
        }

        const tabColumns = db.prepare('PRAGMA table_info(tabs)').all();
        const hasConfigJson = tabColumns.some((col) => col.name === 'config_json');
        if (!hasConfigJson) {
            db.exec('ALTER TABLE tabs ADD COLUMN config_json TEXT');
        }

        const hasAssignmentTable = !!db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widget_tab_assignments'")
            .get();

        if (hasAssignmentTable) {
            const orphanedAssignments = db.prepare(`
                SELECT wta.id, wta.device_name, wta.tab_number, wta.widget_name
                FROM widget_tab_assignments wta
                LEFT JOIN tabs t
                  ON t.device_name = wta.device_name
                 AND t.number = wta.tab_number
                WHERE t.id IS NULL
            `).all();

            if (orphanedAssignments.length > 0) {
                throw new Error(`Cannot migrate widget assignments: found ${orphanedAssignments.length} orphaned rows`);
            }

            const tabs = db.prepare('SELECT id, device_name, number, config_json FROM tabs').all();
            const tabsByKey = new Map();
            tabs.forEach((tab) => {
                tabsByKey.set(`${tab.device_name}::${tab.number}`, {
                    id: tab.id,
                    layout: parseConfigJson(tab.config_json),
                });
            });

            const assignments = db.prepare(`
                SELECT device_name, tab_number, widget_name, layout_x, layout_y, layout_w, layout_h
                FROM widget_tab_assignments
            `).all();

            assignments.forEach((row) => {
                const key = `${row.device_name}::${row.tab_number}`;
                const tab = tabsByKey.get(key);
                if (!tab) {
                    throw new Error(`Missing tab for assignment: ${row.device_name} tab ${row.tab_number}`);
                }

                tab.layout[row.widget_name] = {
                    layout_x: Number.isFinite(Number(row.layout_x)) ? Number(row.layout_x) : null,
                    layout_y: Number.isFinite(Number(row.layout_y)) ? Number(row.layout_y) : null,
                    layout_w: Number.isFinite(Number(row.layout_w)) ? Number(row.layout_w) : null,
                    layout_h: Number.isFinite(Number(row.layout_h)) ? Number(row.layout_h) : null,
                };
            });

            const updateTabConfig = db.prepare('UPDATE tabs SET config_json = ? WHERE id = ?');
            tabsByKey.forEach((tab) => {
                updateTabConfig.run(JSON.stringify(tab.layout), tab.id);
            });

            db.exec('DROP TABLE widget_tab_assignments');
        }

        db.exec("UPDATE tabs SET config_json = '{}' WHERE config_json IS NULL OR TRIM(config_json) = ''");
        db.exec("UPDATE devices SET device_settings_json = '{}' WHERE device_settings_json IS NULL OR TRIM(device_settings_json) = ''");

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Device/tab JSON storage migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Device/tab JSON storage migration failed ===');
    console.error('Error:', error);
    throw error;
}
