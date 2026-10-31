# Backend Reference

The backend is a **Fastify 5** server whose routes all live in a single file,
[`server/index.js`](../../server/index.js) (~4,200 lines). Supporting logic is
factored into `services/` and `utils/`. This page maps out the structure and the
full REST surface so you can navigate quickly.

## Structure of `server/`

```
server/
├── index.js              # All routes, DB bootstrap, cron jobs, static serving, encryption helpers
├── migrations/           # See docs/architecture/database.md
├── services/
│   ├── calendarSync.js       # Periodic ICS/CalDAV/Google sync into calendar_events_cache
│   ├── googleConnection.js   # Google OAuth account linking, token storage, and createGoogleFetch factory
│   ├── googleCalendar.js     # Google Calendar API access (uses shared googleFetch from googleConnection)
│   ├── googlePhotos.js       # Google Photos Library API access (uses shared googleFetch)
│   ├── googlePhotosPicker.js # Google Photos Picker session + download (uses shared googleFetch)
│   └── appleCalDAV.js        # Apple/CalDAV calendar access
├── utils/
│   └── encryption.js         # AES key management + status
├── widgets/              # Uploaded custom widget HTML + widgets_registry.json + authoring README
├── tests/                # node:test suites + runner
└── data/tasks.db         # SQLite database (created at runtime)
```

## Server lifecycle (`start()` in `index.js`)

1. Connect to / create the SQLite database (`ConnectOrCreateDb`).
2. Run legacy bootstrap migrations if the DB is fresh, then apply any pending
   numbered schema migrations.
3. Start the **nightly cron job** (midnight, local `TZ`) unless
   `HOMEGLOW_DISABLE_BACKGROUND_JOBS=1`.
4. Ensure `uploads/` and `uploads/users/` directories exist.
5. Start the **Calendar Sync Service** unless `HOMEGLOW_DISABLE_CALENDAR_SYNC=1`.
6. Warn if the encryption key is unavailable (disables third-party connections).
7. Listen on `PORT` (default 5000), host `0.0.0.0`.

## Cross-cutting behavior

- **CORS**: wide open (`origin: '*'`) — intended for LAN/kiosk use. Methods
  include `PATCH`. Tighten this if you expose the backend.
- **Multipart uploads**: 25 MB/file, up to 50 files (`@fastify/multipart`).
- **Request logging**: a `preHandler` hook logs every incoming request.
- **Conditional caching**: several device endpoints use ETag-based `304` handling
  via `sendJsonWithConditionalCache`.
- **Static serving**: `/Uploads/`, `/Uploads/users/`, and `/widgets/` are served
  from disk. `/widgets/:filename` additionally rewrites hardcoded ports and injects
  an overflow-fix `<style>` before serving widget HTML.

## Background jobs

### Nightly chore processing (`dailyBackgroundProcessing`)
Runs at local midnight and also exposed manually via
`GET /api/system/backgroundTasks`. It:
- **Logs missed chores first** (issue #72): for each user, yesterday's
  due-but-uncompleted regular chores get an idempotent
  `chore_history` row with `kind='missed'` — before any pruning below can
  delete their schedules. Retroactively completing a chore deletes its
  missed row. **Paused entirely while household vacation mode is active**
  (the `vacation_mode` settings key, written by the Admin Panel's vacation
  save — days off never count as missed).
- Prunes completed one-time chore schedules (completion = a
  `kind='completion'` row; a missed row never counts) and orphaned chores.
- Resets day-to-day **bonus** chores back to unassigned.
- Generates one-time child instances for `until-completed` / `once-completed`
  "sticky" schedules whose cron fires that day (using `cron-parser`).

### Calendar sync service
[`services/calendarSync.js`](../../server/services/calendarSync.js) maintains a
per-source interval timer, fetches events (ICS via `node-ical`, CalDAV via
`appleCalDAV`, Google via `googleCalendar`), normalizes all-day/multi-day events,
and upserts them into `calendar_events_cache`, updating `calendar_sync_status`.

### Google API client pattern
All three Google service files (`googleCalendar.js`, `googlePhotos.js`,
`googlePhotosPicker.js`) share a common authenticated fetch pattern provided by
`googleConnection.createGoogleFetch(apiBase, serviceLabel)`. This factory returns
a configured `googleFetch(db, accountId, method, pathAndQuery, body)` that handles:
access token retrieval, URL construction, Bearer auth, JSON parsing, 204 responses,
and structured error objects (`{ message, status, details }`). Each service
file instantiates its own copy with the appropriate API base URL and label.

## REST API surface

All application endpoints are under `/api`. The frontend reaches them through the
Nginx `/api` proxy. Endpoints marked _device-scoped_ take a `:deviceName` path
segment (the browser's `localStorage` UUID).

### System / meta
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/test` | Health check. |
| GET | `/api/stats` | Backend version, git commit, repo, commit URL. |
| GET | `/api/update-status` | Running version vs the latest GitHub release, checked at most every 6 hours. `HOMEGLOW_DISABLE_UPDATE_CHECK=1` turns it off. |
| GET | `/api/timezone` | Server timezone. |
| GET | `/api/system/backgroundTasks` | Manually trigger nightly processing. |
| GET | `/api/changes` | A revision counter for each kind of household data, `{ chores, users, prizes, settings, calendar }`, with an `ETag`; `304` for a matching `If-None-Match`. Displays check it to reload what changed (issue #325). Every successful write under the household routes moves its counters (`utils/householdChanges.js`); a chore or prize write also moves `users`, for clam totals. The nightly job, calendar sync and calendar routines move them too. The counters start from a random base on each start, so a restart reads as everything changed. |
| GET | `/index.css` | Serves the app CSS for custom widgets (with fallback). |

### Custom widgets / plugins
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/widgets/upload` | Upload an HTML widget. |
| GET | `/api/widgets` | List installed widgets (registry), each with its manifest `version` (or null) and `contentSha`, the git blob sha of its content, to compare with the repository's. |
| DELETE | `/api/widgets/:filename` | Delete a widget. |
| GET | `/api/widgets/debug` | Inspect the widgets directory + registry. |
| GET | `/api/widgets/github` | List widgets available in the `HomeGlowPlugins` GitHub repo, each with its `sha` (git blob sha), manifest `version`, `path` and `folder`. Every `.html` file at any depth is listed (`household/Vacuum/Vacuum.html`), read as one git tree, so a listing costs two GitHub calls. A file whose manifest says `"storeNotice": true` is left out. Kept for 10 minutes (GitHub allows an unsigned server 60 calls an hour); `?refresh=1` reads it afresh. When GitHub can't be read, the last list is returned. |
| POST | `/api/widgets/github/install` | Install a widget from GitHub. |
| GET | `/widgets/:filename` | Serve a widget's HTML (theme-aware, sandboxed). |
| GET | `/plugin-sdk/v1.js` | Serve the plugin SDK (`window.HomeGlow`) loaded by manifest plugins. |

### Themes
Installed themes live under `uploads/themes/<id>/`, one folder per theme, laid
out as in `client/src/themes/` (`services/themeStore.js`). The server checks
structure: allowed paths, each file's type by its bytes, sizes, no script in
SVGs, and a usable `id`. Every display runs the full `validateThemePackage`
before it uses an installed theme.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/themes` | List installed themes: `{ id, manifest, files, source, ref, installedAt }`. |
| POST | `/api/themes/upload` | Install a theme folder. Multipart, one field per file, named by its path (`theme.json`, `assets/x.svg`, `fonts/y.woff2`). Replaces an installed theme with the same id. |
| GET | `/api/themes/store` | List the themes in the themes repository (`HOMEGLOW_THEMES_REPOSITORY`, default `jherforth/HomeGlowThemes`): `{ themes, unsupported }`, where `unsupported` lists themes whose `manifestVersion` is newer than this HomeGlow understands. |
| POST | `/api/themes/store/install` | Install `{ id }` from the themes repository. |
| GET | `/api/themes/:id/:dir/:file` | Serve an installed theme's asset or font, with a sandboxing CSP. URLs carry `?v=<installedAt>` and are cached as immutable. |
| DELETE | `/api/themes/:id` | Remove an installed theme. |

### Plugin platform API (`/api/plugin/v1`)
The **stable, versioned contract** that manifest plugins may rely on (issue #105).
Unlike the rest of this surface, these routes are frozen — a breaking change means
a new `vN`. Storage/settings mutations are namespaced per plugin and are *not*
blocked in demo mode. See the [Plugin Development guide](../guides/plugin-development.md)
for the developer-facing detail and the `HomeGlow.*` SDK wrappers.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/plugin/v1/storage/:pluginId` | All key/value docs for the plugin. |
| GET | `/api/plugin/v1/storage/:pluginId/:key` | One stored value (404 if absent). |
| PUT | `/api/plugin/v1/storage/:pluginId/:key` | Upsert a JSON value (64 KB / 500-key caps). |
| DELETE | `/api/plugin/v1/storage/:pluginId/:key` | Delete a key. |
| POST | `/api/plugin/v1/storage/:pluginId/:key/increment` | Atomic `{ path, delta }` numeric increment. |
| GET | `/api/plugin/v1/settings/:pluginId` | Effective declared settings (`?device=` for device scope). |
| PUT | `/api/plugin/v1/settings/:pluginId` | Write declared settings (validated against the manifest). |
| GET | `/api/plugin/v1/events/stream` | SSE stream of core events (`clam.*`, `chore.*`, `ha.state`, `household.changed`). |
| GET | `/api/plugin/v1/ha/:pluginId/state` | A Home Assistant panel's (or a plugin's declared) entities, filtered attributes, which it may operate, where each comes from (`sources`: its integration and a device tag, from Home Assistant's entity registry), and whether the live link is up. A domain grant leaves out entities hidden or disabled in Home Assistant. Answered from memory. |
| POST | `/api/plugin/v1/ha/:pluginId/action` | `{ entity` or `entities, action, value, pin, device }`, checked against the panel's recipe or the plugin's manifest and turned into one service call each. Media actions: `play_media` (a key from browse or search), `play_url` (an address on the media server the plugin's `playUrlsFrom` setting names), `seek`, `shuffle`, `join` (other speakers the panel may operate, up to 8) and `unjoin`; slow ones answer `pending: true` after 1.5 seconds. 401 `needsPin` for unlocking, disarming or opening a garage door under PIN protection (not from a display that remembers the PIN); 429 over 10 a second. |
| GET | `/api/plugin/v1/ha/:pluginId/camera/:entityId` | A camera snapshot, only for a camera on the panel. |
| GET | `/api/plugin/v1/ha/:pluginId/media/:entityId/browse?item=` | A media player's library, a level at a time (`media_player/browse_media`). Items carry keys, never content ids. Needs control of the player. |
| GET | `/api/plugin/v1/ha/:pluginId/media/:entityId/search?q=` | Search the player's library (`media_player/search_media`) and remember the query. |
| GET/DELETE | `/api/plugin/v1/ha/:pluginId/media/:entityId/recent` | The plugin's last eight searches; DELETE forgets them. |
| GET | `/api/plugin/v1/ha/:pluginId/media/:entityId/art` | The playing item's picture, fetched through HomeGlow: from Home Assistant's media player proxy for one on the web (Music Assistant's server, which a display may not reach), with a redirect to the address only if that fails; directly for one Home Assistant signs. |
| GET | `/api/plugin/v1/ha/:pluginId/media/:entityId/image/:key` | A picture from the library, by the key browse or search gave. |

### Chore notification sounds
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/sounds` | List available sounds (bundled defaults + uploads); each has `filename`, `url` (`/Uploads/sounds/<file>`), `isDefault`. |
| POST | `/api/sounds/upload` | Upload a custom sound (`.mp3/.wav/.ogg/.m4a/.aac`). |
| DELETE | `/api/sounds/:filename` | Delete an uploaded sound (bundled defaults are protected). |

Default sounds ship in `server/assets/sounds/` and are seeded into
`uploads/sounds/` on startup; all sounds are served via the existing `/Uploads/`
static route.

### Notifications (Admin → System → Notifications)
Every recipient (a device's browser push, an ntfy topic, a Home Assistant phone) chooses `events` (`chore.completed`, `chore.allCompleted`, `plugin:<id>`), `members` (`'all'` or user ids) and `language` the same way.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/PUT | `/api/notifications/settings` | `{ openUrl }`: the HomeGlow address a tap on an ntfy or Home Assistant notification opens (`NOTIFY_OPEN_URL`; `''` clears it). Reading also lists the installed plugins that may notify as `plugins`. |
| GET | `/api/notifications/devices` | Every device with browser push on, with what it hears and its last send. |
| GET/PUT | `/api/notifications/ntfy` | The ntfy connection: `{ enabled, server, token? }`. The token is write-only (`hasToken` on read); `''` removes it. Saving is demo-blocked. |
| POST | `/api/notifications/ntfy/test` | Publish to a throwaway topic, to check the server and token. Demo-blocked. |
| GET/POST | `/api/notifications/ntfy/topics` | List the topics (with `enabled`) / add one: `{ label, topic, events, members, language }`. |
| PATCH/DELETE | `/api/notifications/ntfy/topics/:id` | Change / remove a topic. |
| POST | `/api/notifications/ntfy/topics/:id/test` | Send the topic a test. Demo-blocked. |
| GET | `/api/notifications/ha/phones` | `{ connected, phones, error? }`: every Companion app phone Home Assistant lists (`notify.mobile_app_*`), each with its settings when turned on, plus turned-on phones Home Assistant no longer lists (`missing`). Cached for a minute; `?fresh=1` asks again. |
| PUT/DELETE | `/api/notifications/ha/phones/:phoneId` | Turn a phone on or change it (`{ label?, events, members, language }`) / turn it off. |
| POST | `/api/notifications/ha/phones/:phoneId/test` | Send the phone a test. Demo-blocked. |

### Devices, tabs & layout (device-scoped)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/devices` | List devices with widget counts. |
| GET/PUT/PATCH | `/api/devices/:deviceName/settings` | Get/merge device settings JSON. |
| PATCH | `/api/devices/:deviceName` | Rename a device. |
| POST | `/api/devices/:deviceName/copy-from/:sourceDeviceName` | Copy tabs + settings from another device. |
| DELETE | `/api/devices/:deviceName` | Delete a device (cascades tabs and its notifications). |
| GET/PUT/DELETE | `/api/devices/:deviceName/notifications` | A device's push notifications: read, turn on or change (`subscription`, `events`, `members`, `language`), turn off. `events` may include `plugin:<id>` for an installed plugin that declares `notify`; reading lists those as `plugins`. |
| POST | `/api/devices/:deviceName/notifications/test` | Send the device a test notification. |
| GET | `/api/notifications/key` | The server's public push key (VAPID), for a browser to subscribe with. |
| POST | `/api/plugin/v1/notify/:pluginId` | A plugin that declares `"notify": true` sends `{ message, title?, tag?, about?, urgent? }` to every recipient (device, ntfy topic, Home Assistant phone) that ticked that plugin. `urgent: true` rings through silent mode where the way of delivering allows. |
| GET/POST | `/api/devices/:deviceName/tabs` | List / create tabs. |
| PATCH | `/api/devices/:deviceName/tabs/:tabNumber` | Update a tab. |
| PATCH | `/api/devices/:deviceName/tabs/reorder` | Reorder tabs. |
| DELETE | `/api/devices/:deviceName/tabs/:tabNumber` | Delete a tab (widgets fall back to Home). |
| GET/POST | `/api/devices/:deviceName/widget-assignments` | List / assign widgets to tabs (backed by `tabs.config_json`). |
| DELETE | `/api/devices/:deviceName/widget-assignments/:id` | Remove an assignment. |
| DELETE | `/api/devices/:deviceName/widget-assignments/widget/:widgetName` | Remove all assignments for a widget. |
| PATCH | `/api/devices/:deviceName/widget-assignments/layout` | Update one widget's grid layout. |
| PATCH | `/api/devices/:deviceName/widget-assignments/layout/bulk` | Bulk layout update (drag/resize save). |

### Chores, schedules & history
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/chores` | List / create chore definitions. Each listed chore carries `followups: [{ id, followup_chore_id, title }]`. |
| PATCH/DELETE | `/api/chores/:id` | Update / delete a chore. Deleting removes its follow-up rules and any rule that names it. |
| GET/PUT | `/api/chores/:id/followups` | A chore's follow-ups (issue #241). PUT replaces them with `{ followups: [{ followup_chore_id, user_ids, delay_minutes }] }`: at most 3, not the chore itself, no loops, at least one person, delay 0–10080 minutes. |
| GET/POST | `/api/chore-schedules` | List (filter by `user_id`, `visible`, `usage`, `chore_id`) / create. `duration` is `day-of` (default), `until-completed`, `once-completed` (with an `interval` such as `3d`) or `any-day` (once in a period, any day: `interval` is its period, one of `1w`, `2w`, `1m`, `3m`, `6m`, `1y`, default `1w`; its crontab is set to `0 0 * * *` whatever is sent). `weekly` is accepted as `any-day` every `1w`. Each row carries `parent_duration`, the duration of the schedule a sticky chore's card came from (an `any-day` card is due on its `due_date`, its period's last day). Accepts `due_time` (`HH:MM`), `sound`, `sound_enabled`, `reminder_interval_minutes` for due-time sounds, and `due_date` (`YYYY-MM-DD`) for calendar deadlines. `expire_minutes` (one of 0, 15, 30, 60, 120, 180, 240, 360, 480, 720, or null) makes it expire that long after its due time; it needs a `due_time` (400 otherwise), and clearing the due time clears it. PATCH `user_id` reassigns a chore and re-checks the daily bonus for both owners. Taking a chore off someone's day (deleting its schedule or chore, hiding it, moving it to other days, snoozing it, giving the chore clams, or deleting a routine) re-checks their bonus too, and pays it if the rest of the day is done; it never takes a bonus back (issue #298). |
| GET/PATCH/DELETE | `/api/chore-schedules/:id` | Single schedule CRUD. |
| POST | `/api/chore-schedules/bulk` | Bulk create schedules. |
| GET/POST | `/api/chore-history` | Query / add history entries. |
| GET | `/api/chore-history/user/:userId` | History for a user. |
| GET | `/api/chore-history/summary/:userId` | Summary/aggregate for a user. |
| GET | `/api/chore-history/recent` | Recent (last 7 days) completions. |
| DELETE | `/api/chore-history/:id` | Delete a history entry. |
| POST | `/api/chores/complete` | Mark a chore complete (awards clams / daily bonus). A completion dated today hands out the chore's follow-ups; the response lists them in `followups_created`. Past its expiry it answers **403** `{ code: 'CHORE_EXPIRED' }` unless the body has `parent_approved: true`; that completion is marked `approved_late` in the history. |
| POST | `/api/chores/uncomplete` | Undo a completion, and remove the follow-ups it handed out that nobody has done (`followups_removed`). |
| GET | `/api/routines` | Routines (`{ routines, steps, imported }`): each with its `steps` (step ids, in order), `days`, `trigger` ('days' or 'calendar') and its `chore_id` / `schedule_id`. `imported` is the one-time import from the Routines plugin, if any. The chores and schedules lists carry `routine_id` on a routine's own. Those are changed through the routine: `PATCH /api/chores/:id`, a new schedule for its chore (`POST /api/chore-schedules`, `/bulk`), and a `PATCH /api/chore-schedules/:id` touching its chore, person, days, time, duration, due date or expiry answer 409 with `routine_id`. |
| POST/PATCH/DELETE | `/api/routines`, `/api/routines/:id` | Create (makes the routine's chore and schedule), edit in place (the chore and schedules are updated, not replaced), delete (deletes its chore; history stays). Body: `name, icon, user_id, trigger, days, match_text, whole_word, calendar_source_ids, lead_minutes, steps, start_time, end_time, milestone_every, milestone_clams`. Creating with `user_ids: [...]` instead of `user_id` makes the routine for each person, one each (all or none), and answers `{ routines }`. |
| DELETE | `/api/routines/bulk` | `{ ids }` (1–100): delete several routines and their chores at once; answers `{ deleted }`. |
| GET/POST/PATCH/DELETE | `/api/routine-steps`, `/api/routine-steps/:id` | The step library (`label`, `icon`). Deleting a step in use answers 409 with `usedBy`. |
| GET | `/api/routines/today?date=` | The routines on a date, keyed by the schedule each is done against: `{ routineId, scheduleId, name, steps, done, completed, streak, startTime, endTime, onTime }`. The chore widget draws them in those cards. |
| POST | `/api/routines/:id/steps/:stepId` | Tick or untick one step: `{ date, done }`. The last tick completes the routine's chore; an untick on a completed day uncompletes it. Answers the day as `/today` does. On an expired day a tick answers 403 `CHORE_EXPIRED` unless `parent_approved: true`, which completes the whole routine. Routines also take `expire_minutes` (after the end time). |

### Users & clams
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/users` | List / create users. Listed in admin-chosen display order (`sort_order`, then `id`); new users append at the end. |
| PATCH | `/api/users/reorder` | Set the display order: `{ orderedUserIds: [id, …] }` must list every reorderable user exactly once (the `bonus` pseudo-user is pinned and excluded). |
| PATCH/DELETE | `/api/users/:id` | Update / delete a user. |
| POST | `/api/users/:id/upload-picture` | Upload an avatar. |
| GET | `/api/avatars/defaults` | List the built-in default avatar bank (people in five skin tones + fun characters). |
| POST | `/api/users/:id/avatar` | Set a built-in avatar as the profile picture (`{ filename: 'defaults/<name>.svg' }`). |
| GET | `/api/users/:id/clams` | Current clam balance. |
| POST | `/api/users/:id/clams/add` | Add clams (admin adjustment). |
| POST | `/api/users/:id/clams/reduce` | Reduce clams (e.g. prize purchase) — inserts a negative `kind='spent'` ledger row (non-destructive; optional body `kind: 'adjustment'` for corrections). |

### Prizes & the prize store
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/prizes` | List / create prize definitions (the ledger). Optional `repeatable: true` — the offer returns to the shelf after each redemption. Optional `description` (text, up to 500 characters). |
| PATCH/DELETE | `/api/prizes/:id` | Update / delete a prize definition (PATCH accepts optional `repeatable` and `description`; `""` or `null` clears the description). |
| GET/POST | `/api/prize-offers` | List store offers (with the prize's `description`) / place a ledger prize in the store. |
| DELETE | `/api/prize-offers/:id` | Remove an unredeemed offer from the store. |
| POST | `/api/prize-offers/:id/request` | Kid requests an available offer (`{ user_id }`). Optional `split_user_ids: [id, …]` names co-spenders sharing the cost. |
| POST | `/api/prize-offers/:id/cancel-request` | Withdraw a pending request (clears any split). |
| POST | `/api/prize-offers/:id/decline` | Parent declines; offer returns to the shelf. |
| POST | `/api/prize-offers/:id/approve` | Parent approves: each participant pays `floor(cost / participants)` as a `spent` ledger row (an uneven remainder is silently discounted), the offer is consumed (or returned to the shelf if repeatable), emits `clam.withdrawn` per participant + one `prize.redeemed`. |

### Settings & API keys
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/settings` | Read / write global settings (ICS URL, chore sounds, …). `GET ?keys=KEY,PREFIX_*` narrows the read; omit `keys` for the whole table. |
| POST | `/api/settings/search` | Look up specific settings. Equivalent to `GET /api/settings?keys=…`; kept because plugins are documented against it. |
| POST | `/api/test-api-key` | Validate an OpenWeatherMap key. |
| GET | `/api/proxy` | Generic CORS proxy (used by widgets/integrations). |

> **Secrets are redacted from both read routes.** `GET /api/settings` and
> `POST /api/settings/search` are unauthenticated and return the whole settings
> table, so `WEATHER_API_KEY`, `HOME_ASSISTANT_TOKEN_ENC`, and
> `GOOGLE_CLIENT_SECRET_ENC` are filtered out server-side
> (`REDACTED_SETTING_KEYS` in `index.js`). The Admin Panel edits them blind —
> writing an **empty value** to a redacted key is treated as "leave unchanged"
> so saving an untouched form cannot wipe a stored credential. Whether one is
> stored is reported by the `/api/connections/*/status` routes.

### Weather
Weather is fetched **server-side** so provider credentials never reach a browser
(issue #57). The active provider is the `WEATHER_PROVIDER` setting
(`openweathermap` | `homeassistant`); demo mode always uses the bundled snapshot.
Every provider returns the same payload — see
`server/services/weather/payload.js`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/weather` | Current conditions, 3-day forecast, hourly series, air quality. Params: `location` or `lat`+`lon`, `units` (`imperial`\|`metric`), `lang`, `refresh=1`. |
| GET | `/api/weather/condition` | `{condition, checkedAt, maxAgeMs}` for a theme's weather scenes: the current condition token at `lat`/`lon` (Home Assistant needs neither). Answered from any reading of the place under 10 minutes old, whatever its units or language, else one ordinary fetch. 400 when OpenWeatherMap has no location. |
| GET | `/api/weather/geocode` | Resolve a free-text location to `{lat, lon, resolvedName}`. With **no** `q`, returns Home Assistant's own configured location when that is the provider. |
| GET | `/api/sun` | `{sunrise, sunset, alwaysUp, alwaysDown}` (unix seconds) computed from `lat`/`lon`. No provider or API key involved — auto dark mode works with nothing configured. |

Responses are cached for 10 minutes per (provider, location, units, language),
so one upstream call serves every display in the house rather than one per tab
per device. Provider failures map to `401` (bad credentials), `404` (unknown
location), `503`/`504` (unreachable), and `502` (provider returned a payload
that failed contract validation).

### Calendar sources, events & sync
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/calendar` | Legacy calendar settings. |
| GET | `/api/calendar/ics` | Export/serve an ICS feed. |
| GET/POST | `/api/calendar-sources` | List / create calendar sources. |
| PATCH/DELETE | `/api/calendar-sources/:id` | Update / delete a source. |
| POST | `/api/calendar-sources/:id/test` | Test connectivity to a source. |
| POST | `/api/calendar-sources/:id/events` | Add an event to a (writable) source. Optional `color_id`: a Google event color `'1'`–`'11'`. |
| PATCH/DELETE | `/api/calendar-sources/:id/events/:eventId` | Edit / delete an event. `color_id` as above, or `null` for the calendar's color; left out, the color is unchanged. Any other value is a 400. |
| GET | `/api/calendar-events` | Read cached events for the widget. Google events carry `event_color` (hex) and `color_id`. All-day events carry `start_date` and `end_date` (`YYYY-MM-DD`, end inclusive): the household's dates, the same on every display. Their `start` and `end` are the household's midnights, which a display in another zone reads as a different day. |
| GET | `/api/calendar-sync/status` | Overall sync status. |
| GET | `/api/calendar-sync/status/:sourceId` | Per-source status. |
| POST | `/api/calendar-sync/:sourceId` | Force sync one source. |
| POST | `/api/calendar-sync/all` | Force sync all sources. |
| GET/PATCH | `/api/calendar-sync/:sourceId/interval` | Get / set sync interval. |

### Google & Apple connections
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/connections/google/status` | Linked-account status. |
| POST | `/api/connections/google/config` | Store OAuth client config. |
| GET | `/api/connections/google/authorize` | Begin OAuth. |
| GET | `/api/connections/google/callback` | OAuth redirect handler. |
| GET | `/api/connections/google/albums` | List Google Photos albums. |
| GET | `/api/connections/google/calendars` | List Google calendars. |
| DELETE | `/api/connections/google/account` | Unlink Google account. |
| POST | `/api/connections/apple/calendars` | List Apple/CalDAV calendars. |

### Home Assistant connection
Home Assistant's long-lived access token controls the whole house, so it is
encrypted at rest, redacted from the settings routes, and only ever used
server-side.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/connections/homeassistant/status` | `{has_url, has_token, url, weather_entity, encryption}` — never the token. |
| POST | `/api/backup/local/export` | Download a full backup (`.tar.gz`: database, the encryption key in use, uploads, `manifest.json`). Body `{ pin }` when an admin PIN is set (403 otherwise, 429 after too many wrong PINs). Not in the demo. |
| POST | `/api/backup/local/import` | Multipart: a `pin` field when an admin PIN is set (before the file; 403 otherwise), then one backup file (up to 4 GB): checked and staged for the next start, the current data saved for rollback → `{ staged }`. 400 for a file that isn't a backup, or one made under a different `ENCRYPTION_KEY`; 409 while another restore is staged. Not in the demo. |
| GET | `/api/backup/drive/status` | Drive backup settings, and `restore: { staged, lastRestore, rollbackAvailable }`, which a backup file's restore shares. |
| POST | `/api/backup/drive/restore/stage`, `/backup-key` | Stage a restore from a Drive backup `{ fileId }`, or download that backup's encryption key. Both take `{ pin }` when an admin PIN is set. |
| POST | `/api/backup/drive/restore/cancel`, `/restore/rollback`, `/restart` | Cancel a staged restore, stage a rollback of the last one (`{ pin }` when an admin PIN is set), or exit so a staged restore is applied on start-up. Shared by Drive and file restores. |
| PUT | `/api/connections/homeassistant` | Save URL / token / weather entity. An omitted or empty `token` keeps the stored one. Rejects non-http(s) URLs with 400. |
| POST | `/api/connections/homeassistant/test` | `{ok, message, version}` — health check against `GET /api/`. |
| GET | `/api/connections/homeassistant/weather-entities` | List `weather.*` entities for the Admin Panel picker. |
| DELETE | `/api/connections/homeassistant` | Clear the stored connection. |
| GET | `/api/connections/weather/status` | Active provider, whether it is usable, and why not if it isn't. |

### Home Assistant panels (issue #252)
Panels are recipes the builder saves (`ha_panels`) and one built-in template
draws (`server/ha-panels/template.html`); each is also a plugin row
(`source = 'builder'`), so it is placed like any plugin. Rules:
`services/haPanels.js`; live link: `services/haLive.js`; routes:
`routes/haPanels.js`. Saving the Home Assistant connection restarts the link.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ha-panels?device=` | Panels, whether Home Assistant is connected, PIN protection, the live link's state, the icon names. Each panel's `placed` is its size on `device`'s tabs (else on any display's), or null. |
| GET | `/api/ha-panels/entities` | What the picker offers: supported entities (hidden and disabled ones left out), with areas from the registries. |
| GET | `/api/ha-panels/preview-state?entities=` | Filtered states for the builder's live preview (read only). |
| GET | `/api/ha-panels/history?limit=` | What panels did, newest first (the last 1000 are kept). |
| PUT | `/api/ha-panels/settings` | `{ pinProtection }`. |
| POST | `/api/ha-panels` | `{ recipe }` → a new panel and its plugin (`ha-<name>.html`). 400 with `errors` for a recipe it can't accept. |
| PUT | `/api/ha-panels/:id` | `{ recipe, resize }`. The plugin id and file stay the same. With `resize: true` and a `recipe.widget` size, the panel is resized on every tab it is placed on; `resized` in the answer says whether any layout changed, and when one did the household `settings` counter moves so displays reload their layouts. |
| POST | `/api/ha-panels/:id/duplicate` | A copy, named "… copy". |
| POST | `/api/ha-panels/import` | `{ recipe, replacements: { old: new } }` → the panel and the entity ids still `missing`. |
| DELETE | `/api/ha-panels/:id` | Delete the panel and its plugin. Deleting the plugin from the Plugins list does the same. |
| GET | `/ha-panels/preview` | The template on its own, for the builder's preview frame. |

### Photo sources & media
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/photo-sources` | List / create photo sources. |
| PATCH/DELETE | `/api/photo-sources/:id` | Update / delete a source. |
| POST | `/api/photo-sources/:id/test` | Test connectivity. |
| GET | `/api/photo-proxy/:sourceId/:assetId` | Proxy/stream a remote asset (e.g. Immich). |
| GET/POST | `/api/photo-sources/:sourceId/uploaded` | List / upload HomeGlow photos. |
| GET | `/api/photo-sources/:sourceId/uploaded/:photoId/file` | Serve an uploaded photo. |
| DELETE | `/api/photo-sources/:sourceId/uploaded/:photoId` | Delete an uploaded photo. |
| GET | `/api/photo-sources/:sourceId/picked` | List Google-picked media. |
| GET | `/api/photo-sources/:sourceId/picked/:mediaRowId` | Serve one picked media file. |
| DELETE | `/api/photo-sources/:sourceId/picked/:mediaRowId` | Delete picked media. |
| POST/GET/DELETE | `/api/photo-sources/:sourceId/picker-session` | Manage a Google Photos Picker session. |
| POST | `/api/photo-sources/:sourceId/picker-session/ingest` | Download picked items locally. |
| GET | `/api/photo-items` | Aggregated photo feed for the widget and the screensaver. An item may carry `takenOn` (`YYYY-MM-DD`), `people` (names) and `place` (`City, State`) when its source knows them (`utils/photoDetails.js`): Immich all three, asked for with `withExif` and `withPeople` (and without them from an Immich too old to know them), Google Photos only `takenOn`. |

### Admin PIN
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin-pin/exists` | Whether a PIN is set. |
| POST | `/api/admin-pin/set` | Set or replace the PIN (4 to 8 digits), stored as salted scrypt. Replacing one takes the current PIN, `{ pin, currentPin }`: 403 without it or with a wrong one, and 429 after too many wrong PINs. |
| DELETE | `/api/admin-pin` | Remove the PIN. Takes the current PIN, `{ pin }`: 403 or 429 as above. A forgotten PIN is reset on the server instead: `node reset-admin-pin.js` (see the [deployment guide](../guides/deployment.md#resetting-a-forgotten-admin-pin)). |
| POST | `/api/admin-pin/verify` | Verify an entered PIN → `{ valid }`. After five wrong PINs, 429 with `Retry-After` for 30 seconds, doubling to five minutes, even for the right one; the limit is shared with every route that checks the PIN. |

Any write (`POST`, `PUT`, `PATCH`, `DELETE`) whose `Origin` is another website answers 403 (`server/utils/crossSiteWrites.js`). Requests with no `Origin`, plugin frames, `CORS_ORIGINS` and the dev server are unaffected.

> This table is generated from the route registrations in
> [`server/index.js`](../../server/index.js). When you add or change a route,
> update this file (grep the source for `fastify.get/post/put/patch/delete`).

## Tests

The backend uses the built-in Node test runner. Suites live in `server/tests/`
(`apiEndpoints.test.js`, `calendarSync.test.js`, `encryption.test.js`,
`googleCalendar.test.js`) and are driven by
[`runServerTests.js`](../../server/tests/runServerTests.js), which cleans up
temp artifacts before/after. Run with:

```bash
cd server
npm test            # or: npm run test-debug  (keeps artifacts)
npm run test:coverage
```
