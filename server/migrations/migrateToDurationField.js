async function migrateToDurationField(db) {
    try {
        console.log('=== Checking for duration field migration ===');

        const migrationVersionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('duration_migration_version');
        const currentVersion = migrationVersionRow ? parseInt(migrationVersionRow.value, 10) : 0;

        if (currentVersion >= 1) {
            console.log('Duration migration already completed (version:', currentVersion, ')');
            return;
        }

        const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
        const hasDuration = columns.some(col => col.name === 'duration');

        if (!hasDuration) {
            db.exec('ALTER TABLE chore_schedules ADD COLUMN duration TEXT DEFAULT "day-of"');
            console.log('Duration column added successfully');
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('duration_migration_version', '1');

        console.log('=== Duration migration completed successfully ===');
    } catch (error) {
        console.error('=== Duration migration failed ===');
        console.error('Error:', error);
        throw error;
    }
}

module.exports = migrateToDurationField;
