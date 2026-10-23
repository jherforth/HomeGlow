// Numbered schema migrations, run by applySchemaMigrations in index.js. Each
// runs once, in ascending order, on any database whose SYSTEM_SCHEMA_ID is
// below its schemaId. Paths resolve from server/.
//
// tests/migrationRegistry.test.js checks this list against the files in this
// folder: two migrations with one number would leave a database that already
// ran either of them without the other.
module.exports = [
  { schemaId: 6, migrationPath: './migrations/migrateDeviceSchemaV6', },
  { schemaId: 7, migrationPath: './migrations/schema7-proveMigrations', },
  { schemaId: 8, migrationPath: './migrations/schema8-calendarCacheTables', },
  { schemaId: 9, migrationPath: './migrations/schema9-googleConnection', },
  { schemaId: 10, migrationPath: './migrations/schema10-googlePhotosPicker', },
  { schemaId: 11, migrationPath: './migrations/schema11-homeglowPhotos', },
  { schemaId: 12, migrationPath: './migrations/schema12-onceCompletedScheduling', },
  { schemaId: 13, migrationPath: './migrations/schema13-tabsByDefaultBackfill', },
  { schemaId: 14, migrationPath: './migrations/schema14-deviceAndTabJsonStorage', },
  { schemaId: 15, migrationPath: './migrations/schema15-choreDueTimeSound', },
  { schemaId: 16, migrationPath: './migrations/schema16-choreDueDate', },
  { schemaId: 17, migrationPath: './migrations/schema17-choreTransferSnooze', },
  { schemaId: 18, migrationPath: './migrations/schema18-pluginsTable', },
  { schemaId: 19, migrationPath: './migrations/schema19-pluginStorage', },
  { schemaId: 20, migrationPath: './migrations/schema20-choreHistoryKind', },
  { schemaId: 21, migrationPath: './migrations/schema21-prizeOffers', },
  { schemaId: 22, migrationPath: './migrations/schema22-prizeRepeatSplit', },
  { schemaId: 23, migrationPath: './migrations/schema23-userSortOrder', },
  { schemaId: 24, migrationPath: './migrations/schema24-choreIcon', },
  { schemaId: 25, migrationPath: './migrations/schema25-unifyCredentialEncryption', },
  { schemaId: 26, migrationPath: './migrations/schema26-keepLegacyTimezone', },
  { schemaId: 27, migrationPath: './migrations/schema27-choreFollowups', },
  { schemaId: 28, migrationPath: './migrations/schema28-haPanels', },
  { schemaId: 29, migrationPath: './migrations/schema29-routines', },
  { schemaId: 30, migrationPath: './migrations/schema30-importRoutinesPlugin', },
  { schemaId: 31, migrationPath: './migrations/schema31-routineStreakBase', },
  { schemaId: 32, migrationPath: './migrations/schema32-choreExpiry', },
  { schemaId: 33, migrationPath: './migrations/schema33-deviceNotifications', },
  { schemaId: 34, migrationPath: './migrations/schema34-notificationChannels', },
  { schemaId: 35, migrationPath: './migrations/schema35-proxyWhitelistSeed', },
  { schemaId: 36, migrationPath: './migrations/schema36-prizeDescription', },
];
