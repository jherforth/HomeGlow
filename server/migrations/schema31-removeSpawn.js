// Migration 31: Remove spawn columns from chore_schedules.
// Adam's spawn child chores feature (PR #233) was superseded by jherforth's
// follow-up chores (upstream #243). This drops the spawn columns.
const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;
if (!context) {
  throw new Error('Migration context is missing');
}

const { db, schemaIdKey, targetSchemaId } = context;

db.transaction(() => {
  const columns = db.prepare('PRAGMA table_info(chore_schedules)').all();
  const hasSpawnChoreId = columns.some((col) => col.name === 'spawn_chore_id');
  const hasSpawnUserIds = columns.some((col) => col.name === 'spawn_user_ids');
  if (hasSpawnChoreId) {
    // SQLite 3.35+ supports DROP COLUMN
    db.prepare('ALTER TABLE chore_schedules DROP COLUMN spawn_chore_id').run();
  }
  if (hasSpawnUserIds) {
    db.prepare('ALTER TABLE chore_schedules DROP COLUMN spawn_user_ids').run();
  }

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    schemaIdKey,
    String(targetSchemaId)
  );
})();
