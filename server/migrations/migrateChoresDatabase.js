function convertRepeatTypeToCrontab(repeat_type, assigned_day_of_week) {
    const dayMap = {
        sunday: '0',
        monday: '1',
        tuesday: '2',
        wednesday: '3',
        thursday: '4',
        friday: '5',
        saturday: '6',
    };

    switch (repeat_type) {
        case 'daily':
            return '0 0 * * *';
        case 'weekly': {
            const day = (assigned_day_of_week || 'monday').toLowerCase();
            const dayNum = dayMap[day] || '1';
            return `0 0 * * ${dayNum}`;
        }
        case 'until-completed':
            return '0 0 * * *';
        case 'no-repeat':
            return null;
        default:
            return '0 0 * * *';
    }
}

async function migrateChoresDatabase(db, getTodayLocalDateString) {
    try {
        console.log('=== Checking for database migration ===');

        const migrationVersionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('chores_migration_version');
        const currentVersion = migrationVersionRow ? parseInt(migrationVersionRow.value, 10) : 0;

        if (currentVersion >= 1) {
            console.log('Migration already completed (version:', currentVersion, ')');
            return;
        }

        console.log('=== Starting chores database migration ===');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('migration_in_progress', '1');

        db.exec(`
      CREATE TABLE IF NOT EXISTS chore_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chore_id INTEGER NOT NULL,
        user_id INTEGER NULL,
        crontab TEXT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chore_schedules_chore_id ON chore_schedules(chore_id);
      CREATE INDEX IF NOT EXISTS idx_chore_schedules_user_id ON chore_schedules(user_id);
      CREATE INDEX IF NOT EXISTS idx_chore_schedules_visible ON chore_schedules(visible);

      CREATE TABLE IF NOT EXISTS chore_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        chore_schedule_id INTEGER NULL,
        date TEXT NOT NULL,
        clam_value INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chore_schedule_id) REFERENCES chore_schedules(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chore_history_user_id ON chore_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_chore_history_date ON chore_history(date);
      CREATE INDEX IF NOT EXISTS idx_chore_history_user_date ON chore_history(user_id, date);
    `);

        const existingChores = db.prepare('SELECT * FROM chores').all();

        db.exec('CREATE TABLE IF NOT EXISTS chores_backup AS SELECT * FROM chores;');

        db.exec(`
      CREATE TABLE chores_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        clam_value INTEGER DEFAULT 0
      );
    `);

        const today = getTodayLocalDateString();
        const processedChores = new Map();

        for (const oldChore of existingChores) {
            let choreId;
            const key = `${oldChore.title}-${oldChore.description || ''}-${oldChore.clam_value}`;

            if (processedChores.has(key)) {
                choreId = processedChores.get(key);
            } else {
                const insertResult = db.prepare(
                    'INSERT INTO chores_new (title, description, clam_value) VALUES (?, ?, ?)'
                ).run(oldChore.title, oldChore.description, oldChore.clam_value || 0);

                choreId = insertResult.lastInsertRowid;
                processedChores.set(key, choreId);
            }

            const crontab = convertRepeatTypeToCrontab(
                oldChore.repeat_type || 'weekly',
                oldChore.assigned_day_of_week || 'monday'
            );

            const visible = oldChore.repeat_type === 'no-repeat' && oldChore.completed ? 0 : 1;

            const scheduleResult = db.prepare(
                'INSERT INTO chore_schedules (chore_id, user_id, crontab, visible) VALUES (?, ?, ?, ?)'
            ).run(choreId, oldChore.user_id, crontab, visible);

            if (oldChore.completed && oldChore.completed === 1) {
                db.prepare(
                    'INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value) VALUES (?, ?, ?, ?)'
                ).run(oldChore.user_id, scheduleResult.lastInsertRowid, today, oldChore.clam_value || 0);
            }
        }

        db.exec('DROP TABLE chores; ALTER TABLE chores_new RENAME TO chores;');

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('chores_migration_version', '1');
        db.prepare('DELETE FROM settings WHERE key = ?').run('migration_in_progress');

        console.log('=== Migration completed successfully ===');
    } catch (error) {
        console.error('=== Migration failed ===');
        console.error('Error:', error);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('migration_error', error.message);
        throw error;
    }
}

module.exports = migrateChoresDatabase;
