const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId, freshInstall, envTimezone } = context;
const { SETTING_KEY, DEFAULT_TIMEZONE, canonicalTimeZone } = require('../utils/appTimezone');

// Until now, an install that never set TZ ran on America/New_York: the image,
// both compose files and the server all supplied it as a default. Those
// defaults are gone, so such an install would now follow the host's zone —
// often UTC on a server — and every chore day would shift on upgrade.
//
// Keep it where it was by saving New York as its chosen zone, once. The Admin
// Panel shows it and can change it, or reset to the host's zone. Installs that
// set TZ keep following it, and new installs get the host's zone.
try {
    db.transaction(() => {
        if (freshInstall) {
            console.log('Time zone: new install, nothing to keep.');
        } else if (canonicalTimeZone(envTimezone)) {
            console.log(`Time zone: TZ is set (${envTimezone}); nothing to keep.`);
        } else if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(SETTING_KEY)) {
            console.log('Time zone: already chosen in the Admin Panel; nothing to keep.');
        } else {
            db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(SETTING_KEY, DEFAULT_TIMEZONE);
            console.log(`Time zone: this install has been running on ${DEFAULT_TIMEZONE}; keeping it (change it in Admin Panel -> Interface -> Time Zone).`);
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(schemaIdKey, String(targetSchemaId));
    })();
} catch (error) {
    console.error('Error during legacy time zone migration:', error);
    throw error;
}
