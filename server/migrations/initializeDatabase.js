async function initializeDatabase(db) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS chores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                title TEXT,
                description TEXT,
                time_period TEXT,
                assigned_day_of_week TEXT,
                repeat_type TEXT,
                completed BOOLEAN,
                clam_value INTEGER DEFAULT 0,
                expiration_date TEXT
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                email TEXT,
                profile_picture TEXT
            );
            INSERT OR IGNORE INTO users (id, username, email, profile_picture) VALUES (0, 'bonus', 'bonus@example.com', '');
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                summary TEXT,
                start TEXT,
                end TEXT,
                description TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS prizes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                clam_cost INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS calendar_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                url TEXT NOT NULL,
                username TEXT,
                password TEXT,
                color TEXT NOT NULL DEFAULT '#6e44ff',
                enabled INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_calendar_sources_enabled ON calendar_sources(enabled);
            CREATE INDEX IF NOT EXISTS idx_calendar_sources_sort_order ON calendar_sources(sort_order);
            CREATE TABLE IF NOT EXISTS photo_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                url TEXT,
                api_key TEXT,
                username TEXT,
                password TEXT,
                album_id TEXT,
                refresh_token TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_photo_sources_enabled ON photo_sources(enabled);
            CREATE INDEX IF NOT EXISTS idx_photo_sources_sort_order ON photo_sources(sort_order);
            CREATE TABLE IF NOT EXISTS admin_pin (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                pin_hash TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tabs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                icon TEXT NOT NULL,
                show_label INTEGER DEFAULT 1,
                order_position INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS widget_tab_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                widget_name TEXT NOT NULL,
                tab_id INTEGER NOT NULL,
                layout_x INTEGER,
                layout_y INTEGER,
                layout_w INTEGER,
                layout_h INTEGER,
                FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
            );
        `);
    } catch (error) {
        console.error('Failed to initialize base database schema:', error);
        throw error;
    }
}

module.exports = initializeDatabase;
