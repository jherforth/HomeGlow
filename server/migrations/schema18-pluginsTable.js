const fsSync = require('node:fs');
const path = require('node:path');

const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting plugins table schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // DB-backed plugin store (issue #105, Phase 0). Widget HTML lived on the
        // container's ephemeral image layer (/app/widgets) and was wiped on every
        // image upgrade; tasks.db is bind-mounted, so plugins stored here survive.
        // plugin_id / manifest_json are reserved for manifest plugins (Phase 1)
        // and stay NULL for plain HTML widgets.
        db.exec(`
            CREATE TABLE IF NOT EXISTS plugins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plugin_id TEXT UNIQUE,
                filename TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                manifest_json TEXT,
                source TEXT NOT NULL DEFAULT 'upload',
                original_url TEXT,
                installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // One-time import of any widgets still on disk (pre-upgrade installs on
        // this container, or local dev). Registry entries whose file is gone
        // cannot be recovered — the HTML only ever lived on the image layer.
        const widgetsDir = path.join(__dirname, '..', 'widgets');
        const registryPath = path.join(__dirname, '..', 'widgets_registry.json');

        let registry = [];
        try {
            registry = JSON.parse(fsSync.readFileSync(registryPath, 'utf-8'));
            if (!Array.isArray(registry)) registry = [];
        } catch {
            registry = [];
        }
        const registryByFilename = new Map(registry.map((entry) => [entry.filename, entry]));

        let diskFiles = [];
        try {
            diskFiles = fsSync.readdirSync(widgetsDir).filter((file) => file.endsWith('.html'));
        } catch {
            diskFiles = [];
        }

        const insertPlugin = db.prepare(`
            INSERT OR IGNORE INTO plugins (filename, name, content, source, original_url, installed_at)
            VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `);

        let imported = 0;
        for (const filename of diskFiles) {
            try {
                const content = fsSync.readFileSync(path.join(widgetsDir, filename), 'utf-8');
                const entry = registryByFilename.get(filename);
                const result = insertPlugin.run(
                    filename,
                    entry?.name || filename.replace('.html', ''),
                    content,
                    entry?.source === 'github' ? 'github' : 'upload',
                    entry?.originalUrl || null,
                    entry?.uploadedAt || null
                );
                imported += result.changes;
            } catch (fileError) {
                console.warn(`Could not import widget ${filename}:`, fileError.message);
            }
        }

        const orphaned = registry.filter((entry) => !diskFiles.includes(entry.filename));
        if (orphaned.length > 0) {
            console.warn(
                `${orphaned.length} registry entr(ies) had no HTML file on disk and could not be imported: ` +
                orphaned.map((entry) => entry.filename).join(', ')
            );
        }
        console.log(`Imported ${imported} widget(s) from disk into the plugins table.`);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Plugins table schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Plugins table schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
