// Migration 27: Add calendar_match column to chore_schedules for calendar-event scheduling
const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
if (!context) {
  throw new Error('Migration context is missing');
}

const { db, schemaIdKey, targetSchemaId } = context;

db.transaction(() => {
  const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
  const hasCalendarMatch = columns.some((col) => col.name === 'calendar_match');
  if (!hasCalendarMatch) {
    db.prepare('ALTER TABLE chore_schedules ADD COLUMN calendar_match TEXT').run();
  }

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    schemaIdKey,
    String(targetSchemaId)
  );
})();
