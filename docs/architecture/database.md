# Database & Migrations

HomeGlow stores everything in a single **SQLite** database accessed synchronously
through **better-sqlite3**. This page documents the schema as it exists today and
the migration system that produces it.

- **File location:** `server/data/tasks.db` (override with `DB_PATH`).
- **Access layer:** all queries are prepared statements in
  [`server/index.js`](../../server/index.js) and the `services/` modules.
- **Foreign keys:** enabled at connection time (`PRAGMA foreign_keys = ON`).

## Migration system

There are **two tiers** of migrations, both run at server startup in
[`server/index.js`](../../server/index.js) (`start()` → `runLegacyMigrations()` /
`applySchemaMigrations()`).

### 1. Legacy bootstrap migrations (idempotent)
Run only on a fresh database (detected by the absence of the `settings` table).
They create the original tables and perform one-off data reshaping:

| Module | Purpose |
| --- | --- |
| [`initializeDatabase.js`](../../server/migrations/initializeDatabase.js) | Creates the base tables (`chores`, `users`, `events`, `settings`, `prizes`, `calendar_sources`, `photo_sources`, `admin_pin`, and the original `tabs`/`widget_tab_assignments`). Seeds the `bonus` user (id 0). |
| [`migrateChoresDatabase.js`](../../server/migrations/migrateChoresDatabase.js) | Introduces the three-table chore model (`chore_schedules`, `chore_history`) and converts old repeat types to cron expressions. |
| [`migrateClamsToHistory.js`](../../server/migrations/migrateClamsToHistory.js) | Moves the denormalized clam total off `users` into `chore_history` rows. |
| [`migrateChoreHistoryTitle.js`](../../server/migrations/migrateChoreHistoryTitle.js) | Backfills chore title info on history rows. |
| [`migrateToDurationField.js`](../../server/migrations/migrateToDurationField.js) | Adds the `duration` concept to schedules. |

### 2. Numbered schema migrations (versioned)
The current version is stored in `settings` under the key `SYSTEM_SCHEMA_ID`.
On startup, every migration whose `schemaId` is greater than the stored value is
run in ascending order. The registry lives in `schemaMigrations` in
[`server/index.js`](../../server/index.js):

| schemaId | Module | What it does |
| --- | --- | --- |
| 6 | `migrateDeviceSchemaV6.js` | Rebuilds `devices`, `tabs`, `widget_tab_assignments` around a **device-name** model (per-display config). |
| 7 | `schema7-proveMigrations.js` | No-op/marker to prove the versioned migration runner works. |
| 8 | `schema8-calendarCacheTables.js` | Adds `calendar_events_cache` and `calendar_sync_status`. |
| 9 | `schema9-googleConnection.js` | Adds `google_accounts` and `google_oauth_states` (OAuth). |
| 10 | `schema10-googlePhotosPicker.js` | Adds `google_picked_media` and picker-session columns on `photo_sources`. |
| 11 | `schema11-homeglowPhotos.js` | Adds `homeglow_photos` (locally uploaded photos). |
| 12 | `schema12-onceCompletedScheduling.js` | Adds `interval` and `parent_schedule_id` columns to `chore_schedules`. |
| 13 | `schema13-tabsByDefaultBackfill.js` | Backfills default tabs. |
| 14 | `schema14-deviceAndTabJsonStorage.js` | Moves widget layout into `tabs.config_json` and device settings into `devices.device_settings_json`; **drops** `widget_tab_assignments`. |
| 15 | `schema15-choreDueTimeSound.js` | Adds `due_time`, `sound`, `sound_enabled`, `reminder_interval_minutes` to `chore_schedules` (chore due-time notification sounds). |

Each versioned migration runs inside a transaction, reads its context from
`globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT`, and writes the new
`SYSTEM_SCHEMA_ID` before committing. Use
[`migrationTemplate.js`](../../server/migrations/migrationTemplate.js) as a
starting point — see [Contributing → adding a migration](../guides/contributing.md#adding-a-database-migration).

## Current schema (post-migration state)

> Note: because of migration 14, **`widget_tab_assignments` no longer exists** in
> new databases — widget layout is stored as JSON inside `tabs.config_json`. The
> API still exposes "widget-assignments" endpoints, but they read/write that JSON.

### Chores domain

**`chores`** — the definition of a task.
```
id, user_id, title, description, time_period, assigned_day_of_week,
repeat_type, completed, clam_value (default 0), expiration_date
```

**`chore_schedules`** — when/for whom a chore recurs.
```
id, chore_id ─▶ chores(id) ON DELETE CASCADE,
user_id (nullable = unassigned / bonus pool),
crontab (NULL = one-time instance),
duration ('day-of' | 'until-completed' | 'once-completed'),
interval (e.g. '3m', '1w' for recurring sticky chores),
parent_schedule_id ─▶ chore_schedules(id),   -- links generated instances to their recurring parent
due_time,                     -- 'HH:MM' 24h local time the chore is due (nullable)
sound_enabled,                -- 0/1: play a notification sound at due_time
sound,                        -- chosen sound filename; null = use global default
reminder_interval_minutes,    -- null/0 = ring once; N = repeat every N min until completed
visible, created_at
```

**`chore_history`** — completion / clam ledger (source of truth for balances).
```
id, user_id, chore_schedule_id ─▶ chore_schedules(id) ON DELETE SET NULL,
date, clam_value, created_at
```

### Users, prizes, settings

**`users`** — family members. Row `id = 0` is the seeded `bonus` pseudo-user.
```
id, username, email, profile_picture
```

**`prizes`** — rewards purchasable with clams.
```
id, name, clam_cost
```

**`settings`** — global key/value store (API keys, `SYSTEM_SCHEMA_ID`, migration flags).
```
key (PK), value
```

**`admin_pin`** — single-row optional PIN hash for the Admin Panel.
```
id (=1), pin_hash, created_at, updated_at
```

### Devices, tabs & layout (per-display config)

**`devices`** — one row per browser/display (name is the `localStorage` UUID).
```
id, name (UNIQUE), updateTime, device_settings_json  -- JSON blob of widget/plugin/theme settings
```

**`tabs`** — dashboard tabs for a device.
```
id, device_name ─▶ devices(name) CASCADE, number, label, icon, show_label,
created_at, config_json  -- JSON: { widgetName: {layout_x, layout_y, layout_w, layout_h} }
```

### Calendar

**`calendar_sources`** — configured calendars (ICS, CalDAV, Google).
```
id, name, type, url, username, password (encrypted), color, enabled, sort_order, created_at
```

**`calendar_events_cache`** — synced events (populated by the sync service).
```
id, source_id ─▶ calendar_sources(id) CASCADE, event_uid, title,
start_time, end_time, description, location, all_day, raw_data, created_at
UNIQUE(source_id, event_uid, start_time)
```

**`calendar_sync_status`** — per-source sync bookkeeping.
```
source_id (PK) ─▶ calendar_sources(id) CASCADE, last_sync_at, last_sync_status,
last_sync_message, event_count, sync_interval_minutes (default 15)
```

### Photos

**`photo_sources`** — configured photo providers (Immich, Google Photos, HomeGlow upload).
```
id, name, type, url, api_key, username, password, album_id, refresh_token,
enabled, sort_order, created_at, picker_session_id, picker_session_expire
```

**`google_picked_media`** — media chosen via the Google Photos Picker and downloaded locally.
```
id, source_id ─▶ photo_sources(id) CASCADE, google_media_id, filename,
mime_type, local_path, width, height, created_time, downloaded_at
UNIQUE(source_id, google_media_id)
```

**`homeglow_photos`** — photos uploaded directly to HomeGlow.
```
id, source_id ─▶ photo_sources(id) CASCADE, filename, original_name,
mime_type, size, uploaded_at
```

### Google integration

**`google_accounts`** — linked Google account with encrypted OAuth tokens.
```
id, google_sub (UNIQUE), email, name, picture,
access_token_enc, refresh_token_enc, token_expiry, scopes, created_at, updated_at
```

**`google_oauth_states`** — short-lived OAuth CSRF/state records.
```
state (PK), redirect_uri, return_url, created_at
```

### Legacy / misc

**`events`** — original events table from the very first schema; retained but
superseded by the calendar cache.

## Encryption of stored credentials

Sensitive fields (CalDAV passwords, Google tokens) are encrypted with
**AES-256-CBC** before being written to SQLite:

- Helpers `encryptPassword` / `decryptPassword` live in
  [`server/index.js`](../../server/index.js); newer connection code uses
  [`server/utils/encryption.js`](../../server/utils/encryption.js).
- The key comes from `ENCRYPTION_KEY` (must be a stable 32-byte key). If it is
  missing/invalid, third-party connections (Google, etc.) are disabled and the
  server logs a warning at startup. See [Configuration](../reference/configuration.md).

## Backups

To back up, copy the two bind-mounted directories while the container is stopped
(or accept a live copy):

- `./homeglow/data/` — the SQLite database.
- `./homeglow/uploads/` — user avatars, uploaded photos, and widget files.
