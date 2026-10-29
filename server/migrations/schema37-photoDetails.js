const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting photo details schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // What an uploaded photo's camera recorded, for the screensaver's
        // photo details: the day it was taken and where (services/photoExif.js).
        // details_read_at is when the file was read; NULL is not read yet, so
        // every photo uploaded before this version is read once at startup.
        const columns = db.prepare('PRAGMA table_info(homeglow_photos)').all().map((c) => c.name);
        if (!columns.includes('taken_on')) db.exec('ALTER TABLE homeglow_photos ADD COLUMN taken_on TEXT');
        if (!columns.includes('latitude')) db.exec('ALTER TABLE homeglow_photos ADD COLUMN latitude REAL');
        if (!columns.includes('longitude')) db.exec('ALTER TABLE homeglow_photos ADD COLUMN longitude REAL');
        if (!columns.includes('details_read_at')) db.exec('ALTER TABLE homeglow_photos ADD COLUMN details_read_at TEXT');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Photo details schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Photo details schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
