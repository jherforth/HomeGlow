async function migrateClamsToHistory(db, getTodayLocalDateString) {
    try {
        console.log('=== Checking for clam_total migration ===');

        const migrationVersionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('clam_migration_version');
        const currentVersion = migrationVersionRow ? parseInt(migrationVersionRow.value, 10) : 0;

        if (currentVersion >= 1) {
            console.log('Clam migration already completed (version:', currentVersion, ')');
            return;
        }

        const columns = db.prepare('PRAGMA table_info(users)').all();
        const hasClaimTotal = columns.some(col => col.name === 'clam_total');

        if (!hasClaimTotal) {
            console.log('clam_total column does not exist, skipping migration');
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('clam_migration_version', '1');
            return;
        }

        const today = getTodayLocalDateString();

        const usersWithClams = db.prepare('SELECT id, username, clam_total FROM users WHERE clam_total > 0 AND id != 0').all();

        for (const user of usersWithClams) {
            db.prepare(
                'INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value) VALUES (?, NULL, ?, ?)'
            ).run(user.id, today, user.clam_total);
        }

        db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        email TEXT,
        profile_picture TEXT
      );
      INSERT INTO users_new (id, username, email, profile_picture)
      SELECT id, username, email, profile_picture FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('clam_migration_version', '1');

        console.log('=== Clam migration completed successfully ===');
    } catch (error) {
        console.error('=== Clam migration failed ===');
        console.error('Error:', error);
        throw error;
    }
}

module.exports = migrateClamsToHistory;
