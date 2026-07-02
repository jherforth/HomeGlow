# Features & Domains

This page explains HomeGlow's user-facing feature areas and how each maps onto the
code, so you know where to look when working on a given domain.

## Dashboard, tabs & layout

- Each **device** (browser) has its own set of **tabs** and, per tab, a widget
  **layout** (which widgets, and their x/y/w/h in a 12-column grid).
- Layout editing is toggled by the **lock** control in the `TabBar`. Unlocked, you
  can drag widgets and resize them with edge +/- buttons.
- Layout is persisted to the backend via the `widget-assignments/layout` endpoints,
  which store it inside `tabs.config_json` (see [Database](../architecture/database.md)).
- **Copy a device**: `POST /api/devices/:deviceName/copy-from/:sourceDeviceName`
  duplicates tabs + settings — handy for provisioning a new display like an existing one.

**Code:** `WidgetContainer.jsx`, `DraggableWidget.jsx`, `TabBar.jsx`,
`TabIconModal.jsx`, and the `widgets` memo in `app.jsx`.

## Theming (light / dark / auto)

- Three modes: **light**, **dark**, and **auto** (follows local sunrise/sunset via
  OpenWeatherMap for a configured location).
- Implemented with CSS variables in `index.css` and a `data-theme` attribute on
  `<html>`. Gradients and interface colors are configurable in the Admin Panel and
  pushed to CSS variables at runtime.
- Preferences persist in `localStorage` (`theme`, `themeMode`, `interfaceColors`).

**Code:** theme logic in `app.jsx`, colors in `index.css`,
`ColorPickerPopover.jsx`, `colorContrast.js`.

## Chores & the clam reward system

The chore system uses a **three-table model** (see [Database](../architecture/database.md)):
`chores` (definitions) → `chore_schedules` (recurrence + assignment) →
`chore_history` (completion/clam ledger).

- **Recurrence** is expressed as cron (`crontab`). A `NULL` crontab means a
  one-time instance.
- **Duration** controls persistence:
  - `day-of` — shows only on the scheduled day.
  - `until-completed` — a "sticky" chore that stays until done.
  - `once-completed` — sticky, and recurs again after an `interval` (e.g. `3m`).
- **Sticky chores** are materialized nightly: the background job creates one-time
  child schedules (`parent_schedule_id`) when a recurring sticky schedule fires.
- **Clams** are a reward currency earned by completing chores; balances are derived
  by summing `chore_history` (no denormalized total). Completing *all* of a user's
  daily chores awards a bonus. **Bonus chores** carry a custom clam value and reset
  to unassigned each night; only one uncompleted bonus chore per user at a time.
- **Prizes** can be "bought" with clams (`/api/prizes`, `clams/reduce`).

**Code:** `ChoreWidget.jsx`, `ChoreSchedulesTab.jsx`, `ChoreHistoryTab.jsx`,
`utils/choreHelpers.js`; backend chore routes + `dailyBackgroundProcessing()` in
`server/index.js`.

## Calendar

- Supports multiple sources simultaneously: **public ICS** links, **CalDAV**
  (with credentials), and **Google Calendar** (OAuth).
- A background **Calendar Sync Service** fetches each source on an interval and
  caches events in `calendar_events_cache`; the widget reads the cache, so the UI
  stays fast and works offline between syncs.
- Handles all-day and multi-day events; month and week views.
- Credentials are encrypted at rest.

**Code:** `CalendarWidget.jsx`, `MonthDayCell.jsx`; backend
`services/calendarSync.js`, `services/appleCalDAV.js`, `services/googleCalendar.js`,
and the `calendar-sources` / `calendar-sync` / `calendar-events` routes.

## Photos

Three source types feed one photo widget:

- **Immich** — self-hosted photo server (API key + album); images streamed via
  `/api/photo-proxy`.
- **Google Photos** — via OAuth + the Photos **Picker** flow; picked media is
  downloaded locally (`google_picked_media`).
- **HomeGlow uploads** — images uploaded directly (including from a phone via the
  `/photos` page), stored in `homeglow_photos` + `server/uploads/`.

**Code:** `PhotoWidget.jsx`, `pages/PhotosUpload.jsx`; backend `services/googlePhotos*.js`
and the `photo-sources` / `photo-items` routes.

## Weather

- Current conditions + 3-day forecast with interactive temperature and
  precipitation graphs.
- Uses OpenWeatherMap (needs an API key; location by zip/coords).
- Also powers **auto dark mode** (sunrise/sunset).

**Code:** `WeatherWidget.jsx`; OpenWeatherMap is called from the client, with the
API key stored via `/api/settings`.

## Screensaver (burn-in prevention)

- After a configurable idle timeout, an overlay activates in one of two modes:
  cycling through tabs, or a photo slideshow. Optionally goes full-screen.

**Code:** `ScreenSaver.jsx`, `ScreensaverCountdown.jsx`, timer logic in `app.jsx`.

## Custom widgets (plugins)

- Upload self-contained HTML widgets through the Admin Panel, or install from the
  `HomeGlowPlugins` GitHub repo. They render in sandboxed iframes, receive the
  theme via URL params, and can share the app stylesheet.
- See the dedicated [Custom Widget Development](../guides/custom-widgets.md) guide.

**Code:** `PluginWidgetWrapper.jsx`, backend `/api/widgets*` routes, and
[`server/widgets/README.md`](../../server/widgets/README.md).

## Admin Panel & PIN

- The gear icon opens `AdminPanel.jsx`, the single place to configure everything
  above.
- Access can be gated by an optional **PIN** (on-screen pad or keyboard entry),
  hashed in the `admin_pin` table.

**Code:** `AdminPanel.jsx`, `PinModal.jsx`, backend `/api/admin-pin*` routes.
