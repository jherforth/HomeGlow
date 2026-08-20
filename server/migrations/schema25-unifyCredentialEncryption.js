const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

const {
    encrypt,
    isEncryptionConfigured,
    isLegacyCiphertext,
    decryptLegacy,
} = require('../utils/encryption');

// Columns that were encrypted with the old CBC scheme. The icon/photo/calendar
// credential columns are the complete set — Google and Home Assistant secrets
// were always on the current scheme.
const LEGACY_COLUMNS = [
    { table: 'calendar_sources', column: 'password', label: 'calendar source' },
    { table: 'photo_sources', column: 'api_key', label: 'photo source' },
    { table: 'photo_sources', column: 'password', label: 'photo source' },
    { table: 'photo_sources', column: 'refresh_token', label: 'photo source' },
];

try {
    console.log(`=== Starting credential encryption unification to version ${targetSchemaId} ===`);

    // Re-encrypting needs a working key. The realistic way that fails is an
    // operator supplying a malformed ENCRYPTION_KEY, in which case encrypt()
    // would throw on the first row. Skip rather than fail: the legacy read path
    // in utils/encryption keeps every stored credential usable, and the
    // migration runs on a later boot once the key is fixed.
    //
    // The schema id is still advanced, so this is a one-shot attempt rather
    // than a permanent boot-time cost. Re-running it later means resetting the
    // schema id, which the guard below makes safe.
    if (!isEncryptionConfigured()) {
        console.warn('Encryption key is not usable; leaving credentials in the legacy format.');
        console.warn('They remain readable. Fix ENCRYPTION_KEY (or remove it to auto-generate) and reset');
        console.warn(`SYSTEM_SCHEMA_ID to ${targetSchemaId - 1} to retry.`);
    } else {
        db.exec('BEGIN');
        try {
            let migrated = 0;
            let skipped = 0;

            for (const { table, column, label } of LEGACY_COLUMNS) {
                // Tables are created by initializeDatabase, but guard anyway so
                // an unusual install order cannot break the migration.
                const exists = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
                ).get(table);
                if (!exists) continue;

                const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
                if (!columns.includes(column)) continue;

                const rows = db.prepare(
                    `SELECT id, name, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`
                ).all();

                for (const row of rows) {
                    // Anything not legacy-shaped is already on the current
                    // scheme. That is what makes a replay of this migration a
                    // no-op rather than a double-encrypt.
                    if (!isLegacyCiphertext(row.value)) continue;

                    try {
                        const plain = decryptLegacy(row.value);
                        db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`)
                            .run(encrypt(plain), row.id);
                        migrated++;
                    } catch (rowError) {
                        // That value was already unrecoverable — the key it was
                        // written with is gone. Losing the rest of the
                        // migration to it would be worse, so name it for the
                        // operator and move on; they re-enter that one
                        // credential in the Admin Panel.
                        skipped++;
                        console.warn(
                            `Could not re-encrypt ${column} for ${label} "${row.name}" (id ${row.id}): ${rowError.message}`
                        );
                        console.warn('Re-enter that credential in the Admin Panel.');
                    }
                }
            }

            console.log(`Re-encrypted ${migrated} stored credential(s)${skipped ? `, skipped ${skipped}` : ''}.`);

            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
                schemaIdKey,
                String(targetSchemaId)
            );

            db.exec('COMMIT');
            console.log(`=== Credential encryption unification completed (version ${targetSchemaId}) ===`);
        } catch (migrationError) {
            db.exec('ROLLBACK');
            throw migrationError;
        }
    }

    // When the key was unusable the transaction above never ran, so record the
    // version separately to avoid retrying on every boot.
    if (!isEncryptionConfigured()) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );
    }
} catch (error) {
    console.error('=== Credential encryption unification failed ===');
    console.error('Error:', error);
    throw error;
}
