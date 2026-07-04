# Code Cleanup Tracking — Issue #116

> **Purpose:** track unused / dead code for the [#116 refactoring effort](https://github.com/jherforth/HomeGlow/issues/116).
> Seeded from a **Fallow** scan (VS Code) on 2026-07-03, then each finding was
> **manually verified against the codebase** before being marked actionable —
> static scanners miss dynamic `import()` and namespace (`require`) property access,
> so several Fallow hits are false positives. Line numbers are from the scan and
> may drift as the code changes; re-confirm before deleting.

## How findings were verified

- **Exports:** grep for the symbol across `client/src` + `server` (excluding its own
  definition/export lines and test files). Zero external references → dead.
- **Dynamic imports:** checked `app.jsx` lazy-load table (`() => import('...')`) — a
  `default` export loaded this way looks unused to a static scanner but is live.
- **Namespace exports (server):** modules are consumed as
  `const x = require('./x'); x.fn()`, so checked for `x.<fn>` property access too.
- **Props:** confirmed the prop is both (a) never referenced in the component body and
  (b) whether a parent still passes it — a passed-but-ignored prop implies a
  settings/feature tail, not a trivial delete.
- **Files:** a file is dead only if nothing imports it via `from '...'` / `import('...')`.

---

## Summary

| Bucket | Count | Action |
| --- | --- | --- |
| False positives (Fallow) | 2 exports + most of the 21 "unused files" | **None** — leave as-is |
| Safe deletes (dead code) | 4 server functions + 3 client files | Delete after confirming |
| Trivial (drop needless `export`) | 4 symbols | Remove export keyword / entry |
| ~~Dead props w/ settings tail~~ | ~~5 props~~ | ✅ **DONE** — removed end-to-end (see §4) |
| Duplicate code (Fallow "Duplicates") | ~50 clusters | Triaged in §5 — most are expected boilerplate |

---

## 1. False positives — do NOT touch

| Symbol / file | Fallow loc | Why it's a false positive |
| --- | --- | --- |
| `AdminPanel.jsx` default export | AdminPanel.jsx:3861 | Lazy-loaded: `loadAdminPanel = () => import('./components/AdminPanel.jsx')` → `lazy(loadAdminPanel)` in [app.jsx:18,60](../../client/src/app.jsx). Live. |
| `ScreenSaver.jsx` default export | ScreenSaver.jsx:331 | Lazy-loaded: `import('./components/ScreenSaver.jsx')` in [app.jsx:24,66,601](../../client/src/app.jsx). Live. |
| "Unused Files (21)" | (line 1 each) | Spot-checked `CountdownCircle` (imported by [WidgetContainer.jsx:9](../../client/src/components/WidgetContainer.jsx)) and `MonthDayCell` (imported by [CalendarWidget.jsx:12](../../client/src/components/CalendarWidget.jsx)) — both live. Confirms the "line-1 = false positive" theory. **But see §2 for the 3 that are genuinely dead.** |

---

## 2. Safe deletes — verified dead code

### 2a. Dead server functions (each has exactly 2 references: its definition + its `module.exports` entry — never called anywhere)

- [ ] `clearOAuthSecret` — [googleConnection.js:61](../../server/services/googleConnection.js) (+ export line 262). Never called.
- [ ] `searchAlbumMedia` — [googlePhotos.js:73](../../server/services/googlePhotos.js) (+ export line 109). Never called.
- [ ] `listRecentMedia` — [googlePhotos.js:88](../../server/services/googlePhotos.js) (+ export line 110). Never called.
- [ ] `getMediaItem` — [googlePhotos.js:103](../../server/services/googlePhotos.js) (+ export line 111). Never called.

> **Context / bigger opportunity:** `searchAlbumMedia`, `listRecentMedia`, and `getMediaItem`
> are the legacy **Google Photos Library API** helpers. The app moved to the **Picker API**
> (`googlePhotosPicker.js` + `schema10-googlePhotosPicker` migration). `listAlbums` from the
> same file *is* still used ([index.js:3306](../../server/index.js)), so the module stays —
> but these three are the dead remainder of the old path and can likely go together.

### 2b. Dead client files (cluster — remove together)

- [ ] `client/src/components/ExampleWidgetUsage.jsx` — **zero** references anywhere. Demo/example scaffolding.
- [ ] `client/src/components/DraggableWidget.jsx` — only referenced *from* `ExampleWidgetUsage.jsx`. The live app renders widgets via [WidgetContainer.jsx](../../client/src/components/WidgetContainer.jsx), not `DraggableWidget`. Dead once ExampleWidgetUsage is removed.
- [ ] `client/src/pages/Dashboard.jsx` — orphaned. [main.jsx](../../client/src/main.jsx) renders `App` (`app.jsx`) directly (and lazy-loads `PhotosUpload`); nothing imports `pages/Dashboard.jsx`.

> ⚠️ `DraggableWidget` is a whole widget-drag system — confirm it isn't an
> intentionally-parked alternative before deleting. Evidence says dead, but it's the one
> worth a second look.

---

## 3. Trivial — function is used internally, only the *export* is unnecessary

Drop the `export` keyword (client) or the `module.exports` entry (server); keep the function.

- [ ] `getApiUrl` — [apiConfig.js:1](../../client/src/utils/apiConfig.js). Used internally at line 8 (`API_BASE_URL = getApiUrl()`); never imported elsewhere.
- [ ] `GOOGLE_SCOPES` — [googleConnection.js:259](../../server/services/googleConnection.js). Used internally (lines 109, 165); never accessed via the module namespace.
- [ ] `refreshAccessToken` — [googleConnection.js:271](../../server/services/googleConnection.js). Called internally (line 235); never accessed externally.
- [ ] `sourceDir` — [googlePhotosPicker.js:137](../../server/services/googlePhotosPicker.js). Called internally (line 95); never accessed externally.

---

## 4. ✅ DONE — dead props removed end-to-end

Owner confirmed both were truly dead (artifacts of earlier background/calendar iterations).
Removed on 2026-07-04. Build + all 38 client tests pass; verified in-browser that the
AdminPanel Widgets tab no longer shows any "Transparent Background" toggle and all widgets
still render with no console errors.

- [x] **`transparentBackground`** — removed from the four **core** widgets and their whole
  settings tail:
  - Destructure removed from `CalendarWidget`, `ChoreWidget`, `PhotoWidget`, `WeatherWidget`.
  - Prop passes removed from [app.jsx](../../client/src/app.jsx) (calendar / weather / chores /
    photos renders + the weather prefetch).
  - `transparent` dropped from `DEFAULT_WIDGET_SETTINGS` in both app.jsx and AdminPanel.jsx.
  - Both **"Transparent Background"** toggles removed from the AdminPanel Widgets tab (the
    core-widget loop + the weather-specific block).
  - ⚠️ **Preserved on purpose:** plugin transparency is **live** —
    [PluginWidgetWrapper.jsx:16](../../client/src/components/PluginWidgetWrapper.jsx) actually
    consumes `transparentBackground`. The plugin `transparent` setting, its AdminPanel toggle,
    and the app.jsx plugin pass were **kept**. This cleanup was scoped to the core widgets only.
- [x] **`icsCalendarUrl`** — removed the prop pass from app.jsx, the destructure from
  `CalendarWidget`, and the dead `ICS_CALENDAR_URL` entry from the `apiKeys` state (it had no
  server producer and no consumer). CalendarWidget owns its own calendar sourcing.

> Note: `ExampleWidgetUsage.jsx` still passes `transparentBackground={false}` to these widgets,
> but that file is dead (§2b) and the extra prop is harmless (ignored). It disappears when the
> §2b cluster is deleted.

---

## Notes for whoever picks this up

- **Buckets 2 & 3 are low-risk** (verified unreferenced) — good first pass; run
  `cd client && npm run build && npm test` and `cd server && npm test` after.
- **Bucket 4 is not cleanup, it's a mini-feature decision.** Loop in product intent before
  touching it.
- Fallow's full **"Unused Files (21)"** list was collapsed in the scan; the 3 real dead files
  in §2b were found by an independent unimported-file pass. If you expand that Fallow section,
  cross-check against §1/§2b — the rest are expected to be line-1 false positives.

---

## 5. Duplicates (Fallow "Duplicates" panel)

Fallow reported **~50 duplicate clusters**. A representative sample from each category was
verified against the code. **Line numbers below are from the scan and predate the §4 edits**,
so app.jsx / AdminPanel.jsx numbers have shifted by a few dozen lines — re-locate by symbol,
not by line. Nothing here is changed yet; this is a triage + recommendation.

### 5A. Expected — do NOT deduplicate (~40% of the findings; consider suppressing in Fallow)

Every `schema*.js` migration copies the same skeleton from
[migrationTemplate.js](../../server/migrations/migrationTemplate.js) — the
`__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT` guard, `BEGIN`/`COMMIT`/`ROLLBACK` wrapper, and the
`INSERT OR REPLACE INTO settings` version bump. **Verified.** Migrations are frozen,
self-contained historical scripts; sharing code between them would break deterministic
replay. This covers the `migration` (13L×10), `migrationTemplate.js` (34L/15L), `db`, `NOT`,
and essentially all cross-`schema*` clusters. **Treat as noise.**

### 5B. High value — true cross-file logic duplication (extract shared code)

- [x] ✅ **DONE (2026-07-04) — localStorage settings readers extracted to a shared module.**
  `readLocalInterfaceColors` / `readLocalScreensaverSettings` / `readLocalAutoDarkModeSettings`
  plus their defaults, normalizers, and storage-key constants were verbatim copies in
  [app.jsx](../../client/src/app.jsx) and [AdminPanel.jsx](../../client/src/components/AdminPanel.jsx),
  reached through *differently-named* key constants (`SCREENSAVER_SETTINGS_STORAGE_KEY` vs
  `INTERFACE_SCREENSAVER_STORAGE_KEY`, etc.). Confirmed both names resolved to the same string
  values (`'screensaverSettings'`, `'interfaceColors'`, `'autoDarkModeSettings'`), then moved
  everything to **[utils/interfaceSettings.js](../../client/src/utils/interfaceSettings.js)** as
  the single source of truth. Both files now import from it under one canonical name per key —
  drift is structurally impossible. Kept the **richer** `normalizeAutoDarkModeSettings` (trims
  `locationQuery`, validates lat/lon), so AdminPanel gains that normalization for free.
  Widget-settings + theme readers stayed local (they differ between the files).
  Verified: build + 38 tests pass; in-browser round-trip — saved accent colors wrote the
  correct key, and seeding all three keys with non-default values then reloading showed the app
  read them all back with zero errors (a seeded `"  Berlin  "` location correctly rendered
  trimmed as `Berlin`, proving the shared normalizer is now in effect on the AdminPanel side).
- [ ] **Loading-indicator `Backdrop`** (84 lines) shared between AdminPanel (~3756-3839) and
  [ChoreWidget.jsx](../../client/src/components/ChoreWidget.jsx) (964-1046). **Verified** — the
  glass/blurred animated spinner overlay. → extract `<LoadingBackdrop>`.
- [ ] **Numeric keypad** — [ClamValueModal.jsx:139-152](../../client/src/components/ClamValueModal.jsx)
  ↔ [PinModal.jsx:237-250](../../client/src/components/PinModal.jsx). Near-identical 3×3 button
  grid. → extract `<NumericKeypad>`.
- [ ] **Per-tab `configJson` parsing** — [CalendarWidget.jsx:64-84](../../client/src/components/CalendarWidget.jsx)
  ↔ [WeatherWidget.jsx:91-133](../../client/src/components/WeatherWidget.jsx). → shared helper.
- [ ] **Settings fetch/normalize `response`** — app.jsx:389-431 ↔ AdminPanel.jsx:439-464. → shared.

### 5C. Medium value — intra-module / structural duplication

- [ ] **Google service `googleFetch` copied across all three modules** —
  [googleCalendar.js](../../server/services/googleCalendar.js),
  [googlePhotos.js](../../server/services/googlePhotos.js),
  [googlePhotosPicker.js](../../server/services/googlePhotosPicker.js) (Fallow: `pathAndQuery`,
  `parsed`, `errText`). **Verified verbatim** except the `API_BASE` constant. → shared
  `googleHttp.js`. Do this **after** removing the dead googlePhotos functions in §2a.
- [ ] **WidgetContainer width/height symmetry** — `canDecreaseHeight` (601-619) mirrors
  `canDecreaseWidth` (653-671), same at 704-722 / 755-773. → parameterize by axis.
- [x] ✅ **DONE (2026-07-04) — multi-day event lane-packing de-duplicated.** The week-view and
  month-view renders in [CalendarWidget.jsx](../../client/src/components/CalendarWidget.jsx) each
  carried an identical copy of: an `isMultiDaySpanning` helper (with a no-op `all_day ? X : X`
  ternary), a "sort by duration desc then start asc" comparator, and a greedy first-fit
  lane-packing loop. Extracted to three module-level helpers — `isMultiDaySpanning` (simplified),
  `compareByDurationThenStart`, and `packEventsIntoLanes(events) → { laneCount, getLane }` — and
  pointed both render paths at them. Verified: build + 38 tests pass; in-browser with seeded
  overlapping multi-day events, **both** month view (per-row packing) and week view (week packing)
  render correct 3-lane stacking, lane reuse for non-overlapping events, continuation arrows, and
  correct exclusion of timed/single-day events — zero console errors.
- [ ] **CalendarWidget internal repetition (remaining)** — other self-duplicated date-cell renders
  and `moment` formatting blocks (e.g. 1405-1420/1489-1504) plus overlap with
  [MonthDayCell.jsx](../../client/src/components/MonthDayCell.jsx). → extract date helpers.
- [ ] **Cross-widget UI blocks** — ChoreWidget:604-624 ↔ PhotoWidget:251-264, and
  CalendarWidget:600-608 ↔ PhotoWidget:189-197 (likely shared loading/empty states).
- [ ] **AdminPanel repeated MUI patterns** — `option` (Select MenuItem blocks, 3×), `tagName`
  (2×), `Typography` styled headers (several), `TableCell`, confirm-dialog blocks (684-696/733-745).
  Extractable into small components/constants, but **higher risk** — AdminPanel is ~3800 lines
  and central; do it in small, well-tested steps.
- [ ] **server `index.js` route-handler patterns** — repeated validation / CRUD / Google
  token-refresh blocks (`settings`, `photos`, `response`, `push`, `source`, `sourceId`,
  `account`, `deviceName`, `chore_schedule_id`, `clam_cost`). The file is ~4400 lines
  (monolithic Fastify routes); extract helpers incrementally — **high-touch, highest risk.**
  Do these one at a time, each behind existing endpoint tests.
  - [x] ✅ **DONE (2026-07-04) — prize body validation** (`clam_cost` cluster). The POST and
    PATCH `/api/prizes` handlers shared an identical name/clam_cost destructure + guard; extracted
    to a `validatePrizeBody(body)` helper colocated with the prize routes. Verified: all 39 server
    tests pass, including the existing `prize endpoints validate and support CRUD lifecycle` test
    that drives invalid (400) + valid create/update through the real server.
  - [x] ✅ **DONE (2026-07-04) — Google Photos picker guards** (`source`/`account` cluster). The
    three picker endpoints (create / poll / ingest a `picker-session`) each repeated an identical
    "load source + assert GooglePhotos type → 404" guard and an identical "get connected account →
    400" guard. Extracted `loadGooglePhotoSourceOr404(sourceId, reply)` and
    `loadConnectedGoogleAccountOr400(reply)` (send-reply-then-`return null`, so behavior is
    byte-identical). The endpoint-specific `picker_session_id` checks stay inline (they differ:
    200 null-session vs 400 "No active picker session"). Verified: 39 server tests pass **plus** a
    live probe of all 7 branches — absent/wrong-type source → 404, no-account create/poll/ingest →
    400, and the preserved no-session branches (200 null-session, 400 "No active picker session").
    **Follow-up:** the same account guard also appears verbatim in 3 Google-connection routes
    (~3346/3366/3386); left out of this scoped change — could reuse the same helper later.

### 5D. Low value — likely coincidental, leave alone

The 6–9 line clusters (e.g. `MonthDayCell` 159-165/184-190, the small `index.js` pairs) are
structural lookalikes with little payoff. Only fold them in if you're already refactoring that
code for another reason.

### Suggested order if picking this up

1. **5B localStorage readers** — highest value, lowest risk, self-contained (and closes a real
   drift bug). Start here.
2. **5B keypad + loading backdrop** — clean, isolated component extractions.
3. **5C googleFetch** — after §2a dead-code removal.
4. **5C WidgetContainer axis** — tidy, local.
5. Defer **AdminPanel** and **index.js** internal dedup until there's test coverage around the
   touched routes/dialogs — reward is real but so is the blast radius.
