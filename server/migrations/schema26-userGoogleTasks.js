// Migration 26: Add user_google_tasks_accounts and google_task_id column to chore_schedules
const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
if (!context) {
  throw new Error('Migration context is missing');
}

const { db, schemaIdKey, targetSchemaId } = context;

db.transaction(() => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_google_tasks_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      google_email TEXT,
      refresh_token_enc TEXT NOT NULL,
      access_token_enc TEXT,
      token_expiry TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
  const hasGoogleTaskId = columns.some((col) => col.name === 'google_task_id');
  if (!hasGoogleTaskId) {
    db.prepare('ALTER TABLE chore_schedules ADD COLUMN google_task_id TEXT').run();
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_chore_schedules_google_task_id ON chore_schedules(google_task_id) WHERE google_task_id IS NOT NULL').run();
  }

  // Single-use OAuth state store (CSRF protection for the per-user Tasks
  // connect flow). Mirrors the google_oauth_states pattern: states are
  // opaque, pruned after 15 minutes, and consumed on callback.
  db.prepare(`
    CREATE TABLE IF NOT EXISTS google_tasks_oauth_states (
      state TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redirect_uri TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_google_tasks_oauth_states_created ON google_tasks_oauth_states(created_at)').run();

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    schemaIdKey,
    String(targetSchemaId)
  );
})();
