// Migration 30: Remove calendar_match column from chore_schedules.
// Adam's calendar-match feature (PR #235) was closed in favor of jherforth's
// Routines plugin approach (HomeGlowPlugins #28). This drops the column.
const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
if (!context) {
  throw new Error('Migration context is missing');
}

const { db, schemaIdKey, targetSchemaId } = context;

db.transaction(() => {
  const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
  const hasCalendarMatch = columns.some((col) => col.name === 'calendar_match');
  if (hasCalendarMatch) {
    // SQLite 3.35+ supports DROP COLUMN
    db.prepare('ALTER TABLE chore_schedules DROP COLUMN calendar_match').run();
  }

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    schemaIdKey,
    String(targetSchemaId)
  );
})();
