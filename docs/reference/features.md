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
- **Tab order** is managed in Admin → Dashboard → Tabs: up/down arrows (the only
  control that works on touch, since HTML5 drag events never fire there) plus
  row dragging on desktop. Home is fixed at position 1. Both paths post the
  full desired order to `PATCH /api/devices/:deviceName/tabs/reorder`.
- **Copy a device**: `POST /api/devices/:deviceName/copy-from/:sourceDeviceName`
  duplicates tabs + settings — handy for provisioning a new display like an existing one.

**Code:** `WidgetContainer.jsx`, `DraggableWidget.jsx`, `TabBar.jsx`,
`TabIconModal.jsx`, and the `widgets` memo in `app.jsx`.

## Theming (light / dark / auto)

- Three modes: **light**, **dark**, and **auto** (follows local sunrise/sunset,
  computed from a configured location — no API key or weather provider needed).
- Implemented with CSS variables in `index.css` and a `data-theme` attribute on
  `<html>`. Gradients and interface colors are configurable in the Admin Panel and
  pushed to CSS variables at runtime.
- Preferences persist in `localStorage` (`theme`, `themeMode`, `interfaceColors`).
- **Weather scenes** (issue #247): a theme can list a scene per weather
  condition (manifest version 4, `weather`). The display shows the scene for
  the weather at the appearance location (the one Auto mode uses), checked
  every 10 minutes through `GET /api/weather/condition`, which answers from
  any fresh reading of the place, so it costs no extra provider calls. Night
  is each scene's dark look, so on Auto it follows sunset. A missing scene
  falls back to a related one, then the theme's default. Admin → Look →
  Appearance shows what the theme would show now and can preview each scene
  on the display for 10 minutes. The Weather theme itself ships from
  HomeGlowThemes.

**Code:** theme logic in `app.jsx`, colors in `index.css`,
`ColorPickerPopover.jsx`, `colorContrast.js`; weather scenes in
`utils/weatherScenes.js`, `utils/useWeatherCondition.js`, `resolveTheme` in
`utils/themes.js`, and `getCondition` in `server/services/weather/index.js`.

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
- **Chore icons** (issue #141): a chore can carry an optional emoji, picked from
  a grouped bank when creating or editing it. On the dashboard the icon **takes
  the place of the checkmark** while the chore is pending, and reverts to the
  usual undo arrow once done — so it costs no horizontal space in a per-user
  column that is only 180–250px wide. Chores without an icon keep the checkmark.
  The icon belongs to the chore, so every schedule of it shows the same picture.
- **All-chores-done celebration** (issue #140): when a user finishes their last
  regular chore, **confetti pops up from the bottom of the screen** and a chime
  plays — the same popcorn physics as the vacation screensaver. Deliberately
  wordless and names nobody: the panel turning green and the clam total already
  say who and what. It draws no backdrop and never intercepts a tap, so the
  dashboard stays usable while it plays. Distinct from the prize celebration,
  which is a centred card with falling confetti.
  - **Two triggers, deduplicated.** The display that completed the chore reacts
    to its own local state, so it needs nothing from the network beyond the
    completion request that just succeeded. The `chore.allCompleted` SSE event
    is what lets *other* displays in the house join in. It originally relied on
    the event alone, which made the whole feature hostage to the event stream
    surviving a deployment's reverse proxy — everything else shown on completion
    is computed locally, so a blocked stream made the celebration the one thing
    that silently did nothing.
  - Fires once per user per day, from whichever route emptied the list —
    completing, receiving a transfer, or snoozing the last chore out of today.
    Undoing the last chore revokes the daily bonus, so redoing it celebrates again.
  - Toggle in **Admin Panel → Family → Chores → Settings** (on by default); it is a
    display preference, so the event still reaches plugins when it is off.
  - Skipped entirely under `prefers-reduced-motion` — the effect is nothing but
    motion, so there is no meaningful reduced version.
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
  1. **Global master** (`CHORE_SOUND_ENABLED`) in Admin → Family → Chores → Settings + a default sound and volume.
  2. **Per-device mute** — the 🔔/🔕 button on the chore widget (stored in
     `choreWidgetSettings.soundEnabled` in device settings) silences one display.

- **Per-device user visibility** (`choreWidgetSettings.hiddenUserIds`): the gear on
  the chore widget hides users on that display only. Ordering stays global
  (`users.sort_order`). Stores who is *hidden*, so a user added later shows up
  everywhere by default. Hiding everyone shows an explanatory panel rather than an
  empty widget.
  3. **Per-schedule** `sound_enabled` + `due_time`.
- **The ringer** runs app-level (`useChoreSoundScheduler`), so it fires regardless of
  which tab is showing. It rings once at the due time if the chore is still incomplete
  (repeating at the reminder interval until done, or until it expires), primes already-past due times on
  load so it doesn't blast missed alerts, and de-dupes via `localStorage`. Browser
  autoplay is unlocked on the first user interaction.

**Code:** `hooks/useChoreSoundScheduler.js`, `utils/choreSound.js`,
`components/SoundPicker.jsx`; the sound fields on `chore_schedules`; `/api/sounds*` +
seeding in `server/index.js`; defaults generated by `server/scripts/generateDefaultSounds.js`.

### Chores that expire (issue #279)

A schedule with a due time can also **expire**: *Expires* in the schedule editor picks
*Never*, *At the due time*, or 15 minutes to 12 hours after it (`expire_minutes`). It
needs a due time, and clearing the due time clears it. A one-time chore with a due date
expires on that date; any other on the day it is shown for. The buffer can run past
midnight.

- **Once expired and not done,** the card turns red, the due-time chip reads *Expired*
  and the tick button becomes a red ✕. The day can't be finished, so its daily bonus is
  out of reach. Its chime stops too: reminders end with the expiry.
- **Tapping it** asks the child to go get a parent. *No* closes it and changes nothing.
  *Yes* asks for the admin PIN (unless none is set or the device remembers it), then
  completes the chore for its full clams. It counts toward the day, and the history row
  is marked `approved_late` (*Approved late* in Admin History).
- **The server enforces it:** `POST /api/chores/complete` answers 403 `CHORE_EXPIRED`
  for an expired chore unless the body says `parent_approved: true`, so another screen
  or a plugin can't complete one without a parent.
- **Routines** expire their buffer after the routine's **end time**, set in the routine
  editor (a weekday routine also needs its start time). Steps still to do show a red ✕;
  one parent's yes completes the whole routine.

**Code:** `server/utils/choreExpiry.js` and `client/src/utils/choreExpiry.js` (the same
rule, kept in step); `completeChoreSchedule()` in `server/index.js`;
`components/LateApprovalDialog.jsx`, `components/ExpiresSelect.jsx`; migration
`schema32-choreExpiry`.

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

### Follow-up chores (issue #241)

Some chores can only start once another is finished: the dishwasher has run, so
*Unload the dishwasher*. A chore can have **up to 3 follow-ups**, set in its edit dialog
under **When it's done**: *"Then give **Unload the dishwasher** to **Liam**, **after 2
hours**."*

- **Trigger:** completing the chore **today**, from any schedule, by anyone, including
  a routine's last step. Each person named gets an ordinary one-time schedule of the
  follow-up chore. Back-dated completions in the Admin Panel don't hand work on.
- **Delay:** right away, or after N minutes or hours (up to 7 days). A delay is a snooze,
  so the follow-up stays hidden, and out of the bonus, until it ends. Follow-ups have no
  due date or time.
- **Fairness:** a follow-up doesn't count toward the daily bonus, or get logged as
  missed, on the day it appeared, since it can arrive at 9 pm. From the next day it
  counts like any one-time chore, and it stays until it's done.
- **No stacking:** while a person still has an open follow-up from a rule, finishing the
  chore again doesn't give them a second one.
- **Undo:** unticking the trigger removes the follow-ups it handed out that nobody has
  done. Ones already done are kept.
- **Chains** (A, then B, then C) work. Loops are refused when saving.
- **Deleting** either chore removes the rule. Follow-ups already handed out stay until
  done.
- **Display:**
  - the widget shows "↪ after Run the dishwasher" on a follow-up;
  - the definitions table shows a chip per follow-up;
  - the schedules table marks follow-up schedules.

**Code:** `chore_followups` table and `chore_schedules.followup_rule_id`,
`triggered_by_schedule_id` and `triggered_on` (migration `schema27-choreFollowups`).
`createFollowupsForCompletion`, `removeOpenFollowupsFrom` and the first-day rule in
`getTodaysRegularChoresForUser` are in `server/index.js`. The dialog is in
`ChoreSchedulesTab.jsx`, and `countsTowardDailyBonus` (`utils/choreHelpers.js`) keeps the
widget in step with the server.

### Routines

A routine is a checklist of steps a child ticks off: brush teeth, make bed, get dressed.
It runs on chosen weekdays, or on the days of matching calendar events ("Get ready for
soccer" on practice and game days). Routines used to be a plugin; they're built in now,
and set up in **Admin → Family → Routines**, beside Chores.

- **Each routine is one ordinary chore** (worth 0 clams), with its schedules. It counts
  toward the day once, takes part in the daily bonus, is logged as missed, pauses for
  vacation and appears in the chore history like any chore. The routine owns the chore:
  it's left out of Family → Chores, and deleting the routine deletes it (the history
  stays).
- **For several people at once:** a new routine can be for several people; each gets
  their own copy, with their own ticks and streak. Routines can be selected and deleted
  together, as chores can.
- **Steps** are built once in the Steps tab, with a name and an icon, and used in any
  routine, in the order chosen there. A step in use can't be deleted.
- **Ticked in the Chores widget.** A routine's card shows its steps, an *n/m* chip and a
  progress bar. Ticking the last step completes the chore. Unticking one undoes it and keeps
  the others. The card's own button still completes the whole routine at once (every step
  ticked), and undoing it clears the steps. Finishing a routine, either way, celebrates
  (when celebrations are on). Once done, the card shows only the streak
  (*5 🔥*) and, with an end time, *on time* or *late*.
- **Expiry:** a routine can expire a set time after its end time; then it turns red and
  only a parent can complete it (see *Chores that expire*).
- **Calendar routines:** the event title contains the routine's words (whole words by
  default, so "France" doesn't match "Francesca"), in the chosen calendars, in the next 14
  days. Each matching day gets a schedule pinned to it, due the chosen minutes before the
  event (an all-day event uses the routine's start time). The server keeps them in step
  with the calendar every 10 minutes, after a manual sync and after an edit: a moved or
  cancelled event's day goes (today's stays if it was done), and past days are hidden after
  2 days and deleted after 120. No display needs to be open.
- **Rewards:** steps never pay. *Every N days in a row, M clams* is paid once each time the
  streak reaches a multiple of N, however the routine was finished, as a history row of kind
  `streak` titled "*Morning: 5 in a row*"; a new run earns them again. A streak counts
  scheduled days only, and vacation days are neutral: done, one counts; not done, it
  neither extends nor breaks the run. Changing when a routine runs (its days, or days to
  calendar events) keeps the run it had up to yesterday, and the new days count on from
  today; a routine handed to someone else starts a run of theirs.
- **Upgrading from the plugin** happens once, by itself (migration
  `schema30-importRoutinesPlugin`):
  - The plugin's steps, routines, recent ticks, calendar days and paid rewards move over,
    on the **same** chores and schedules, so history and streaks carry on.
  - Routine chores the plugin had lost come back too, without steps.
  - On each display, the plugin's spot becomes the Chores widget (unless that tab already
    had one), with the plugin's person as its people filter.
  - The plugin is removed. Its storage is kept for one release.

**Code:** `server/routes/routines.js` (routes, the calendar sync, the link to chores through
the chore events and `completeChoreSchedule`), `server/services/routines.js` (the rules,
pure and tested), migrations `schema29-routines` and `schema30-importRoutinesPlugin`;
`RoutinesTab.jsx`, `RoutineEditorDialog.jsx`, and in the Chores widget `RoutineSteps.jsx`
and `utils/useRoutinesToday.js`.

### Metrics-ready history (issue #72)

Every `chore_history` row carries a **`kind`** (`completion`, `daily_bonus`,
`transfer_bonus`, `streak` (a routine's reward), `adjustment`, `missed`, `spent`), which makes reporting
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
  Sync resolves the event's custom label color, else its `colorId` through
  Google's current eleven-color palette (`EVENT_COLORS` in
  `services/googleCalendar.js`; the API's `/colors` endpoint still returns
  pre-2016 hexes, such as near-white for Graphite). It stores both in the
  existing `raw_data` column, which `getCachedEvents` surfaces as
  `event_color` and `color_id`. Every view prefers `event_color` and falls
  back to `source_color`, so events left on a calendar's default color — and
  all non-Google sources — look exactly as before. No schema migration.
- **Event color in the editor** (issue #244): creating or editing a Google
  event offers the calendar's own color plus Google's eleven swatches
  (`EventColorPicker.jsx`), saved as the event's `colorId`. An edit sends the
  color only when it changed, so editing an event never touches a custom
  label it wears.
- **Return to today**: the period label is a button — tap it to jump back.
  Desktop also gets a 📅 button; on a phone the header has no room for one. The
  control stays live even when already on today: whether "today" is still today
  is only knowable at click time, so a label asserting it would go stale on a
  display left running past midnight.
- **Idle auto-return** (`calendarWidgetSettings.idleReturnMinutes`, per device,
  default 20 minutes, 0 disables): returns to today after that long without
  interaction, so a wall display left on last month stops looking current. Resets
  the date only, not the view.
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
- **Two sources** (issue #57), chosen in Admin Panel → System → Connections:
  **OpenWeatherMap** (free API key, location by city/zip/coords) or
  **Home Assistant** (reads an existing `weather.*` entity, no API key needed).
- Fetched **server-side**. Credentials stay on the server, and one upstream call
  is cached for every display rather than each tab fetching its own.

### What Home Assistant can and cannot supply

Home Assistant weather entities vary by integration, so the widget hides what is
missing rather than rendering blanks:

| Field | Home Assistant source | Notes |
| --- | --- | --- |
| temperature, humidity, wind | entity attributes | converted from HA's configured unit system |
| feels like | `apparent_temperature` | **not standard** — the row hides when absent |
| condition + icon | entity state | a fixed vocabulary shared with OpenWeatherMap |
| 3-day + hourly forecast | `weather.get_forecasts` service | falls back to the legacy `forecast` attribute on pre-2024 instances |
| **air quality** | — | **unavailable**; the AQI panel hides entirely |

Condition text is translated by HomeGlow from that shared vocabulary, so
forecasts read correctly in every supported language. OpenWeatherMap's own
localized description is preferred where it exists.

**Auto dark mode** no longer needs a weather provider at all: sunrise and sunset
are computed from coordinates (`GET /api/sun`), so the theme switches on schedule
with Home Assistant, with OpenWeatherMap, or with nothing configured.

**Code:** `WeatherWidget.jsx`; `server/services/weather/` (`payload.js` defines
the shared contract, one module per provider, `sun.js` for the solar
calculation); `server/services/homeAssistant.js` for the connection.

## Screensaver (burn-in prevention)

- After a configurable idle timeout, an overlay activates in one of two modes:
  cycling through tabs, or a photo slideshow. Optionally goes full-screen.
- Not mounted on mobile (phones lock themselves; see
  [Mobile Experience](../architecture/mobile-experience.md)).

**Code:** `ScreenSaver.jsx`, `ScreensaverCountdown.jsx`, timer logic in `app.jsx`.

## Touch gestures (wall displays)

- **Swipe with two fingers to change tabs** (Admin Panel → Displays →
  This Display, under Touch). Two fingers travelling sideways together go to the
  next tab (fingers moving left) or the previous one (moving right), in the
  dock's order, wrapping around at the ends. The fingers needn't land together:
  a second finger landing within 0.6 s of the first joins it, and each finger's
  travel counts from where it landed. One finger still scrolls and taps,
  and a pinch, a vertical drag or a slow drag is left alone. Ignored while
  Admin, the screensaver or a dialog is open.
- **Block pinch zoom**: gives the page `touch-action: pan-x pan-y`, so pinching
  or double-tapping no longer zooms the board by accident while scrolling still
  works.
- Both are this display's own settings, saved with the screensaver's, off by
  default, and never apply on a phone (no tabs there, and its owner may need to
  zoom).
- **Over plugins too.** A plugin is an iframe whose touches the dashboard never
  sees, so every plugin page is served with a small inert script
  (`server/utils/pluginFrameTouch.js`). Each plugin's wrapper posts it this
  display's settings; with swiping on, it reports two-finger touches back to
  the wrapper, which checks they came from its own frame and hands them to the
  same detector. With pinch zoom blocked, the plugin page gets the same
  `touch-action`.

**Code:** `utils/twoFingerSwipe.js` (detector, tab order, frame messages),
wiring in `app.jsx` and `PluginWidgetWrapper.jsx`, settings in
`utils/interfaceSettings.js`, UI in `AdminPanel.jsx`.

## Expanding a widget (wall displays)

- **Let widgets expand** (Admin Panel → Displays → This Display, under Expand
  widgets). A widget grows to the **top half** of the page, or to the **whole
  page** (dock included, but not the browser's own full screen), to show more,
  then goes back to its place on the grid. The rest of the page dims behind
  it; tapping the dimmed page puts the widget back, and so does Escape.
- **How to expand**, per display:
  - **Double-tap**: double-tap a widget for the top half, and again to put it
    back. So that a double-tap can win, a single tap on a widget's plain area
    (not a button, link or field) waits about a third of a second before it
    goes through; buttons act at once and never count. The browser's own
    double-tap zoom is turned off on those widgets.
  - **Button**: an expand button fades in at each widget's corner for a few
    seconds after the screen is touched. No tap is ever held back.
  - Either way, a widget at the top half shows a button that takes it to the
    whole page, and a button that puts it back.
- **Put back on its own** after a chosen time with no touch (1, 2, 5, 10 or 30
  minutes, or never; 2 by default), on a tab change, when the board is
  unlocked, and when expanding is turned off.
- **Choose widgets**: a folded list of the widgets turned on here, each with a
  switch, for a widget whose own taps or drags would fight with expanding.
  A plugin can leave itself out with `"expand": false` in its manifest.
- **The calendar** shows its month view while expanded and goes back to the
  tab's own view after. Its month/week switch still works while it is big,
  without changing the tab's saved view. Plugins are told their size through
  `HomeGlow.onExpand`.
- The widget is the same element lifted out of the grid, so it is never
  reloaded: a plugin keeps its state. Dialogs it opens still show above it.
- This display's own settings (in **This Display**, saved with the screensaver's), off by default,
  and never on a phone (each widget is already the width of the screen there).
- **Over plugins too.** The touch script every plugin page is served with
  (`server/utils/pluginFrameTouch.js`) reports touches (for the buttons and the
  auto-return) and, in double-tap mode, double-taps, holding single taps on
  the page's plain area as the dashboard does.

**Code:** `utils/widgetExpand.js` (settings, sizes, double-tap detector, frame
messages), `WidgetContainer.jsx` (expanding, held taps, buttons, timers),
`PluginWidgetWrapper.jsx` and `server/utils/pluginFrameTouch.js` (plugins),
`CalendarWidget.jsx` (month view), `ExpandWidgetsSettings.jsx` (Admin).

## Push notifications (phones)

- A device can get a notification when a chore or routine is done, or when
  someone finishes all of today's chores, even with HomeGlow closed. Turned on
  from the device itself, in **Admin Panel → Displays → Devices** ("Notifications
  on this device"), which asks the phone's permission.
- **Each device chooses for itself:** which of the two events, and about whom
  (everyone, or chosen family members). The phone's own quiet hours (Focus, Do
  Not Disturb) decide when it makes a sound. Completions by one person close
  together update one notification ("Ava finished 3 chores") rather than
  stacking up.
- A tap opens HomeGlow. Messages are in the language the device used when it
  turned them on (English or Spanish).
- The devices table shows which devices have them on, with a test and a way to
  turn them off from any device. Deleting a device turns its notifications off.
- **Needs HTTPS.** Browsers only allow push on a secure page, so a HomeGlow
  opened at `http://192.168.…` can't have them, and Admin doesn't offer them there. On iPhone and
  iPad (iOS 16.4 or later), HomeGlow must be added to the Home Screen and opened
  from there, which is why HomeGlow is now an installable app (a web app
  manifest and icons). Away from home, a notification still arrives; opening
  HomeGlow then needs whatever remote access the household has.
- Messages go through the phone's own push service (Apple's, Google's or
  Mozilla's), encrypted end to end, so the service can't read them. The server
  signs them with a key pair it makes on first use; the private half is stored
  encrypted with `ENCRYPTION_KEY`. It only ever sends to those push services.
  `HOMEGLOW_PUSH_CONTACT` sets the contact address the push services see (by
  default, the project's GitHub page).

**Code:** `server/services/notifications.js` (who hears what, the wording,
sending), `server/routes/notifications.js`, `client/public/sw.js` (shows a
message, handles a tap), `client/src/utils/pushNotifications.js`,
`client/src/components/DeviceNotifications.jsx`.

## Vacation mode

- A **household** setting (Admin Panel → Family → Vacation; issues #121, #230)
  for when the family is away. On every display, the screensaver becomes a
  playful vacation animation (vacation emoji pop up from behind the dock like
  popcorn and fall back out of view), chore due-time chimes are muted if "mute"
  is on, and a subtle 🏖️ badge shows top-right while active.
- Stored as the household `vacation_mode` setting. Each display reads it on
  load and rereads household settings every 5 minutes, so vacation turned on
  at one display reaches the others without a reload. (Before #230 the display
  side lived in each browser's `localStorage`, so only the display it was
  turned on from changed; that copy is no longer read.)
- **PIN-protected:** when an admin PIN is set, switching vacation on, or moving
  its dates while it is on, asks for the PIN, even on a display that remembers
  it, because it pauses chore tracking for the whole house. Turning it off, or
  changing only the chime setting, does not ask.
- **Optional date range**: start/end pickers appear when enabled. A bounded
  vacation activates and **auto-expires** on its own (chimes, badge, and the
  vacation screensaver all key off "active today", not just the toggle).
- **Metrics-aware** (issue #72): the same `vacation_mode` setting drives the
  server. While active, the nightly job **skips
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
- Admin → Plugins lists the repository's plugins by itself on opening (Refresh
  reads it again), in their categories, each with its version. Beside each one,
  as for themes: **Install**, **Update to …** or **Up to date**, decided by
  comparing the installed file with the repository's (its git sha). An installed
  plugin with a newer copy in the repository says so in Plugin Settings, with an
  **Update** button (issue #273).
- See the dedicated [Custom Widget Development](../guides/custom-widgets.md) guide.

**Code:** `PluginWidgetWrapper.jsx`, backend `/api/widgets*` routes, and
[`server/widgets/README.md`](../../server/widgets/README.md).

## Home Assistant panels (issue #252)

- **Admin → Dashboard → Home Assistant** builds panels of tiles for Home
  Assistant devices, with no code: pick devices (searchable, grouped by area),
  or start a panel from an area in one click; set each tile's label, icon, size
  (1×1 to 2×2), "view only", "press and hold", whether it shows its state, and
  "show only when…" another entity is in a given state. Several entities of
  one kind on one tile work together. A live preview shows the panel in the
  current theme at three widget sizes.
- Each panel is a plugin (`ha-<name>.html`), placed on tabs like any other, and
  stored in the database (`ha_panels`), so it survives upgrades. One template
  (`server/ha-panels/template.html`) draws every panel from its recipe, so a
  HomeGlow update improves them all.
- Tiles by kind: lights (tap; drag to dim), switches, fans (speed), shades
  (top half opens, bottom closes, drag for position), scenes and scripts, a
  thermostat (− / + and mode), media players, locks, alarms, vacuums, selects,
  numbers, camera snapshots, and read-only sensors, people and the sun. The
  theme's accent, button and meter roles color them; they reflow from a grid
  to a compact list in small widgets.
- **The token never leaves the server.** Panels talk only to HomeGlow, which
  checks every read and press against the panel's own recipe: only its
  entities, only actions that fit each one, values clamped, 10 presses a second
  at most. One WebSocket to Home Assistant (`subscribe_entities`) keeps a live
  copy, so panels polling every 2 seconds cost Home Assistant nothing; REST
  covers for it when the link is down.
- **Locks, alarms, garage doors and gates** always need press and hold.
  Unlocking, disarming and opening a garage door also need the household PIN,
  unless the display remembers the admin PIN or the household turns PIN
  protection off in the builder.
- A display can show panels without operating them: each panel declares an
  "Operate Home Assistant devices" control for Control Limits. A display set to
  Wall display hides it too, unless that display is excepted.
- Panels can be duplicated, copied as text and imported into another HomeGlow
  (with a step to swap entity ids), and the builder lists what panels did.
- Hand-written plugins get the same access by declaring `homeAssistant`
  entities in their manifest (Plugin Development guide, §5a), or a whole
  domain (not locks, alarms, covers or cameras). Media players add their
  library: browse and search through Home Assistant, play by key (never a
  content id), seek, shuffle, album art (issue #264) and grouping speakers to
  play in step; and a plugin with a
  media server of its own (Jellyfin) may play addresses on that server only.
  The Music plugin in HomeGlowPlugins is built on these.

**Code:** `HomeAssistantPanels.jsx`, `utils/haPanelBuilder.js`; backend
`routes/haPanels.js`, `services/haPanels.js` (rules), `services/haLive.js`
(live link), `ha-panels/template.html`.

## Admin Panel & PIN

- The gear icon opens `AdminPanel.jsx`, the single place to configure everything
  above.
- Access can be gated by an optional **PIN** (on-screen pad or keyboard entry),
  hashed in the `admin_pin` table.
- **User display order** (issue #134): Admin → Family → Users controls what order family
  members appear in — drag a row on desktop, or use the up/down arrows, which
  are the primary control on touch screens since HTML5 drag events never fire
  there (tab reordering works the same way). The order is stored on the user
  (`sort_order`) and applied by `GET /api/users`, so the dashboard chore
  columns, assignment dropdowns, and transfer/split pickers all follow it.
  The `bonus` pseudo-user is pinned.
- **Default avatars** (issue #132): besides uploading a photo, users can pick
  from a built-in bank of flat SVG avatars — mom/dad/girl/boy in five skin
  tones plus fun characters (cat, dog, fish, alpaca, chicken, dino, robot,
  unicorn, frog). Bundled in `server/assets/avatars/` (regenerable via
  `server/scripts/generateDefaultAvatars.js`), seeded into
  `uploads/users/defaults/` at startup, and picked via the "Choose" buttons in
  User Management.

**Code:** `AdminPanel.jsx`, `PinModal.jsx`, backend `/api/admin-pin*` routes.
