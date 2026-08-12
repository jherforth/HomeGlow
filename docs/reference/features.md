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
- **The prize store** (spending mechanism): `prizes` is the definitions ledger
  in Prize Management; parents stock the store with offers (`prize_offers`).
  Kids browse the 🛍️ Prize Store on the dashboard and **request** an offer;
  a parent **approves or declines** right there (PIN-gated when a PIN is set).
  Approval deducts the cost as a named `spent` ledger row, consumes the offer
  (the definition stays in management), and fires a **full-screen confetti
  celebration + chime** on every display via the `prize.redeemed` event.
  - **Repeatable prizes** (a toggle on the definition, shown as 🔁): approval
    returns the offer to the shelf instead of consuming it, for prizes like
    "movie night" that can be redeemed again and again.
  - **Cost splitting**: kids sharing a prize pick "👥 Split cost" and select
    who's in; each participant pays an even `floor(cost / N)` share (the odd
    remainder is silently discounted) and the celebration names everyone.
- **Avatar quick-spend**: tapping a kid's profile picture opens "Redeem clams" —
  a parent records off-store spending (e.g. a toy bought while out) with an
  optional note that lands in the ledger and metrics.

**Code:** `ChoreWidget.jsx`, `ChoreSchedulesTab.jsx`, `ChoreHistoryTab.jsx`,
`utils/choreHelpers.js`; backend chore routes + `dailyBackgroundProcessing()` in
`server/index.js`.

### Chore due-time sounds

A schedule can carry a **due time** (`HH:MM`) and play a **notification sound** on
the display when that time arrives. Configured per chore in the schedule editor
(due-time picker, "play sound when due" toggle, a previewable sound picker, and an
optional follow-up **reminder interval** that repeats until the chore is completed).

- **Sound bank:** short, self-authored WAV tones ship as defaults and are seeded into
  `uploads/sounds/`; users can **upload their own** sounds (`.mp3/.wav/.ogg/...`) via
  the picker. Managed through `/api/sounds*` and served from `/Uploads/sounds/`.
- **Layered gating** — all three must be on for a chore to ring:
  1. **Global master** (`CHORE_SOUND_ENABLED`) in Admin → Chores + a default sound and volume.
  2. **Per-device mute** — the 🔔/🔕 button on the chore widget (stored in
     `choreWidgetSettings.soundEnabled` in device settings) silences one display.
  3. **Per-schedule** `sound_enabled` + `due_time`.
- **The ringer** runs app-level (`useChoreSoundScheduler`), so it fires regardless of
  which tab is showing. It rings once at the due time if the chore is still incomplete
  (repeating at the reminder interval until done), primes already-past due times on
  load so it doesn't blast missed alerts, and de-dupes via `localStorage`. Browser
  autoplay is unlocked on the first user interaction.

**Code:** `hooks/useChoreSoundScheduler.js`, `utils/choreSound.js`,
`components/SoundPicker.jsx`; the sound fields on `chore_schedules`; `/api/sounds*` +
seeding in `server/index.js`; defaults generated by `server/scripts/generateDefaultSounds.js`.

### Chore due-dates (issue #97)

A schedule can carry a **calendar due date** (`due_date`, `YYYY-MM-DD`) — a deadline,
distinct from the due-*time* chime above. It's aimed at **one-off chores** (which already
persist on the list until completed), e.g. "prep the guest sheets by Friday." The chore row
colors by urgency: **yellow** when due today, **red** (with an "⚠️ Overdue" chip) once past
due, and a plain "Due &lt;date&gt;" chip while upcoming. Completing the chore clears the
coloring. Purely visual — `due_date` does not change which chores appear.

**Code:** `getDueDateStatus`/`formatDueDate` in `utils/choreHelpers.js`; row coloring + chip
in `ChoreWidget.jsx`; the `due_date` field in `ChoreSchedulesTab.jsx`; `due_date` column and
validation in `server/index.js`.

### Reassigning a chore (from the dashboard)

Each chore row has a **swap-arrow** button (when more than one user exists) that opens a
dropdown to move the chore to another person without opening settings. The backend
reassignment (a `PATCH` of the schedule's `user_id`) re-checks the daily "all regular chores
done" bonus for **both** the previous and new owner and never removes points.

**Code:** reassign UI in `ChoreWidget.jsx`; `PATCH /api/chore-schedules/:id` +
`awardDailyRegularBonusIfDue` in `server/index.js`.

### Metrics-ready history (issue #72)

Every `chore_history` row carries a **`kind`** (`completion`, `daily_bonus`,
`transfer_bonus`, `adjustment`, `missed`, `spent`), which makes reporting
computable:

- The nightly job **logs missed chores** (due-but-uncompleted regular chores get
  a zero-value `missed` row, before pruning) → completion/missed rates.
- **Spending is non-destructive**: reducing clams inserts a negative `spent`
  ledger row instead of deleting earned history, so "earned over time" never
  shrinks retroactively. Balances stay `SUM(clam_value)`.
- The metrics UI itself is the **Chore Metrics plugin** — stat tiles, streaks,
  an activity heatmap, top chores, and earned-vs-spent — built on the plugin
  platform rather than core and published via
  [jherforth/HomeGlowPlugins](https://github.com/jherforth/HomeGlowPlugins)
  (installable from the Admin Panel's GitHub tab).

**Code:** `schema20-choreHistoryKind.js`; missed logging in
`dailyBackgroundProcessing`; `kind` handling throughout the chore/clam routes
in `server/index.js`.

## Calendar

- Supports multiple sources simultaneously: **public ICS** links, **CalDAV**
  (with credentials), and **Google Calendar** (OAuth).
- A background **Calendar Sync Service** fetches each source on an interval and
  caches events in `calendar_events_cache`; the widget reads the cache, so the UI
  stays fast and works offline between syncs.
- Handles all-day and multi-day events; month and week views. When the month
  view starts on a fixed weekday, an optional **"Start calendar with current
  week"** mode (issue #127) anchors the grid to the current week and shows a
  configurable 1–8 weeks (default 4) instead of the padded calendar month.
- **Cross-calendar dedup**: the same real-world event synced from several
  sources is merged at read time (fuzzy title + time-tolerance match in
  `server/utils/calendarDedup.js`). In the day view, the merged event's bullet
  becomes a **pie of the calendars' colors** (winning calendar first, up to
  four wedges) with a tooltip naming them (issue #125). The bullet always uses
  calendar colors, so it keeps answering "which calendars is this on?"
- **Per-event Google colors** (PR #133): an event individually recolored in
  Google keeps that color in HomeGlow instead of inheriting its calendar's.
  Sync resolves the event's `colorId` to a hex through Google's `/colors`
  palette (cached 24h) and stores it in the existing `raw_data` column, which
  `getCachedEvents` surfaces as `event_color`. Every view prefers
  `event_color` and falls back to `source_color`, so events left on a
  calendar's default color — and all non-Google sources — look exactly as
  before. No schema migration.
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
- Not mounted on mobile (phones lock themselves; see
  [Mobile Experience](../architecture/mobile-experience.md)).

**Code:** `ScreenSaver.jsx`, `ScreensaverCountdown.jsx`, timer logic in `app.jsx`.

## Vacation mode

- A per-display toggle (Admin Panel → Interface, issue #121) for when the family
  is away: chore due-time chimes are muted and the screensaver becomes a playful
  vacation animation — vacation emoji pop up from behind the dock like popcorn
  and fall back out of view. A subtle 🏖️ badge shows top-right while active.
- Stored in `localStorage` (`vacationModeSettings`) alongside the screensaver
  settings; the mute can be toggled independently of the screensaver swap.
- **Optional date range**: start/end pickers appear when enabled. A bounded
  vacation activates and **auto-expires** on its own (chimes, badge, and the
  vacation screensaver all key off "active today", not just the toggle).
- **Metrics-aware** (issue #72): saving also writes a household-wide
  `vacation_mode` server setting. While active, the nightly job **skips
  missed-chore logging** (days off never count against completion rates) and
  the Chore Metrics plugin treats vacation days as neutral, **bridging
  streaks** across them. Date-bounded vacations bridge past gaps permanently;
  the plain toggle protects streaks while it stays on.

**Code:** `VacationScreensaver.jsx`, settings in `utils/interfaceSettings.js`,
gates in `app.jsx` (sound scheduler + screensaver render), UI in `AdminPanel.jsx`.

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
- **Default avatars** (issue #132): besides uploading a photo, users can pick
  from a built-in bank of flat SVG avatars — mom/dad/girl/boy in five skin
  tones plus fun characters (cat, dog, fish, alpaca, chicken, dino, robot,
  unicorn, frog). Bundled in `server/assets/avatars/` (regenerable via
  `server/scripts/generateDefaultAvatars.js`), seeded into
  `uploads/users/defaults/` at startup, and picked via the "Choose" buttons in
  User Management.

**Code:** `AdminPanel.jsx`, `PinModal.jsx`, backend `/api/admin-pin*` routes.
