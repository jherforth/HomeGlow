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
│   ├── googleConnection.js   # Google OAuth account linking + token storage
│   ├── googleCalendar.js     # Google Calendar API access
│   ├── googlePhotos.js       # Google Photos access
│   ├── googlePhotosPicker.js # Google Photos Picker session flow
│   └── appleCalDAV.js        # Apple/CalDAV calendar access
├── utils/
│   └── encryption.js         # AES key management + status (newer code path)
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
- Prunes completed one-time chore schedules and orphaned chores.
- Resets day-to-day **bonus** chores back to unassigned.
- Generates one-time child instances for `until-completed` / `once-completed`
  "sticky" schedules whose cron fires that day (using `cron-parser`).

### Calendar sync service
[`services/calendarSync.js`](../../server/services/calendarSync.js) maintains a
per-source interval timer, fetches events (ICS via `node-ical`, CalDAV via
`appleCalDAV`, Google via `googleCalendar`), normalizes all-day/multi-day events,
and upserts them into `calendar_events_cache`, updating `calendar_sync_status`.

## REST API surface

All application endpoints are under `/api`. The frontend reaches them through the
Nginx `/api` proxy. Endpoints marked _device-scoped_ take a `:deviceName` path
segment (the browser's `localStorage` UUID).

### System / meta
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/test` | Health check. |
| GET | `/api/stats` | Backend version, git commit, repo, commit URL. |
| GET | `/api/timezone` | Server timezone. |
| GET | `/api/system/backgroundTasks` | Manually trigger nightly processing. |
| GET | `/index.css` | Serves the app CSS for custom widgets (with fallback). |

### Custom widgets / plugins
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/widgets/upload` | Upload an HTML widget. |
| GET | `/api/widgets` | List installed widgets (registry). |
| DELETE | `/api/widgets/:filename` | Delete a widget. |
| GET | `/api/widgets/debug` | Inspect the widgets directory + registry. |
| GET | `/api/widgets/github` | List widgets available in the `HomeGlowPlugins` GitHub repo. |
| POST | `/api/widgets/github/install` | Install a widget from GitHub. |
| GET | `/widgets/:filename` | Serve a widget's HTML (theme-aware, sandboxed). |

### Chore notification sounds
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/sounds` | List available sounds (bundled defaults + uploads); each has `filename`, `url` (`/Uploads/sounds/<file>`), `isDefault`. |
| POST | `/api/sounds/upload` | Upload a custom sound (`.mp3/.wav/.ogg/.m4a/.aac`). |
| DELETE | `/api/sounds/:filename` | Delete an uploaded sound (bundled defaults are protected). |

Default sounds ship in `server/assets/sounds/` and are seeded into
`uploads/sounds/` on startup; all sounds are served via the existing `/Uploads/`
static route.

### Devices, tabs & layout (device-scoped)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/devices` | List devices with widget counts. |
| GET/PUT/PATCH | `/api/devices/:deviceName/settings` | Get/merge device settings JSON. |
| PATCH | `/api/devices/:deviceName` | Rename a device. |
| POST | `/api/devices/:deviceName/copy-from/:sourceDeviceName` | Copy tabs + settings from another device. |
| DELETE | `/api/devices/:deviceName` | Delete a device (cascades tabs). |
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
| GET/POST | `/api/chores` | List / create chore definitions. |
| PATCH/DELETE | `/api/chores/:id` | Update / delete a chore. |
| GET/POST | `/api/chore-schedules` | List (filter by `user_id`, `visible`, `usage`, `chore_id`) / create. Accepts `due_time` (`HH:MM`), `sound`, `sound_enabled`, `reminder_interval_minutes` for due-time sounds, and `due_date` (`YYYY-MM-DD`) for calendar deadlines. PATCH `user_id` reassigns a chore and re-checks the daily bonus for both owners. |
| GET/PATCH/DELETE | `/api/chore-schedules/:id` | Single schedule CRUD. |
| POST | `/api/chore-schedules/bulk` | Bulk create schedules. |
| GET/POST | `/api/chore-history` | Query / add history entries. |
| GET | `/api/chore-history/user/:userId` | History for a user. |
| GET | `/api/chore-history/summary/:userId` | Summary/aggregate for a user. |
| GET | `/api/chore-history/recent` | Recent (last 7 days) completions. |
| DELETE | `/api/chore-history/:id` | Delete a history entry. |
| POST | `/api/chores/complete` | Mark a chore complete (awards clams / daily bonus). |
| POST | `/api/chores/uncomplete` | Undo a completion. |

### Users & clams
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/users` | List / create users. |
| PATCH/DELETE | `/api/users/:id` | Update / delete a user. |
| POST | `/api/users/:id/upload-picture` | Upload an avatar. |
| GET | `/api/users/:id/clams` | Current clam balance. |
| POST | `/api/users/:id/clams/add` | Add clams (admin adjustment). |
| POST | `/api/users/:id/clams/reduce` | Reduce clams (e.g. prize purchase). |

### Prizes
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/prizes` | List / create prizes. |
| PATCH/DELETE | `/api/prizes/:id` | Update / delete a prize. |

### Settings & API keys
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/settings` | Read / write global settings (weather key, ICS URL). |
| POST | `/api/settings/search` | Look up specific settings. |
| POST | `/api/test-api-key` | Validate an OpenWeatherMap key. |
| GET | `/api/proxy` | Generic CORS proxy (used by widgets/integrations). |

### Calendar sources, events & sync
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/calendar` | Legacy calendar settings. |
| GET | `/api/calendar/ics` | Export/serve an ICS feed. |
| GET/POST | `/api/calendar-sources` | List / create calendar sources. |
| PATCH/DELETE | `/api/calendar-sources/:id` | Update / delete a source. |
| POST | `/api/calendar-sources/:id/test` | Test connectivity to a source. |
| POST | `/api/calendar-sources/:id/events` | Add an event to a (writable) source. |
| PATCH/DELETE | `/api/calendar-sources/:id/events/:eventId` | Edit / delete an event. |
| GET | `/api/calendar-events` | Read cached events for the widget. |
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
| GET | `/api/photo-items` | Aggregated photo feed for the widget. |

### Admin PIN
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin-pin/exists` | Whether a PIN is set. |
| POST | `/api/admin-pin/set` | Set/replace the PIN. |
| DELETE | `/api/admin-pin` | Remove the PIN. |
| POST | `/api/admin-pin/verify` | Verify an entered PIN. |

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
