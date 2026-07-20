# Architecture Overview

HomeGlow is a self-hosted home dashboard split into two runtime services plus a
SQLite database. This page explains the components, how a request flows through
the system, and the technology choices.

## High-level diagram

```
                        ┌──────────────────────────────────────────┐
   Browser / Touch      │              homeglow-frontend           │
   display              │   (Nginx :FRONTEND_PORT, default 3000)   │
   ┌───────────┐        │                                          │
   │  React SPA│◀──────▶│  • Serves built Vite bundle (dist/)      │
   │  (dist)   │  HTTP  │  • Reverse-proxies:                      │
   └───────────┘        │       /api/     ──▶ backend              │
        ▲               │       /uploads/ ──▶ backend              │
        │               │       /Uploads/ ──▶ backend              │
        │ loads         │       /widgets/ ──▶ backend              │
        │ index.html    └───────────────────────┬──────────────────┘
        │                                        │ Docker network
        │                                        ▼
        │               ┌──────────────────────────────────────────┐
        │               │              homeglow-backend            │
        │               │        (Fastify :PORT, default 5000)     │
        │               │                                          │
        │               │  • REST API (server/index.js)            │
        │               │  • Calendar sync service (node-cron)     │
        │               │  • Nightly chore-pruning cron job        │
        │               │  • Static: /widgets, /Uploads            │
        │               └───────────────┬──────────────────────────┘
        │                               │
        │                               ▼
        │               ┌──────────────────────────────────────────┐
        │               │   SQLite (better-sqlite3)                 │
        │               │   server/data/tasks.db  (bind-mounted)    │
        │               │   server/uploads/       (bind-mounted)    │
        └───────────────┴──────────────────────────────────────────┘
        (custom widgets render in sandboxed iframes served from backend)
```

## The two services

### Frontend (`client/`)
- **React 19** single-page app built with **Vite 8**.
- UI built on **Material UI (MUI) v9** with Emotion for styling; theming driven by
  CSS custom properties in [`client/src/index.css`](../../client/src/index.css).
- Widgets are **code-split** (`React.lazy` + `Suspense`) and warmed during idle
  time based on which widgets are enabled — see [`app.jsx`](../../client/src/app.jsx).
- Built into static assets and served by **Nginx** in production. Nginx also
  reverse-proxies API and asset paths to the backend so the browser only needs
  one origin. See [`client/nginx.conf`](../../client/nginx.conf).
- Routing is intentionally minimal: [`main.jsx`](../../client/src/main.jsx) does
  path-based rendering — `/photos` renders the upload page, everything else
  renders the dashboard `App`. There is no React Router.
- Reusable components (`DeleteConfirmationDialog`, `LoadingBackdrop`,
  `RefreshIntervalSelect`, `ScreensaverIntervalSlider`, `AdminFormSection`,
  `VersionInfoCard`) are factored out of `AdminPanel.jsx` and shared across
  widgets. See [Frontend Reference](../reference/frontend.md).

### Backend (`server/`)
- **Fastify 5** HTTP server, entirely contained in
  [`server/index.js`](../../server/index.js) (~4,200 lines). All routes are
  registered here; helper logic lives in `services/` and `utils/`.
- **better-sqlite3** for synchronous, embedded SQL access.
- **Background jobs**:
  - A nightly `node-cron` job at midnight (local `TZ`) prunes finished/orphaned
    chores and generates recurring "sticky" chore instances.
  - The **Calendar Sync Service** ([`services/calendarSync.js`](../../server/services/calendarSync.js))
    periodically fetches ICS/CalDAV/Google calendars into a local cache table.
- **File handling**: uploads (user avatars, photos) are written to
  `server/uploads/` and served statically. Custom widgets are stored in the
  database (`plugins` table) and served at `/widgets/:filename`, so they survive
  image upgrades — see [Plugin Platform](plugin-platform.md).
- **Google API integration**: All three Google service modules
  (`googleCalendar.js`, `googlePhotos.js`, `googlePhotosPicker.js`) share a single
  authenticated fetch implementation via `googleConnection.createGoogleFetch()`,
  which handles token lifecycle, Bearer auth, JSON parsing, and error
  normalization. See [Backend Reference](../reference/backend-api.md#google-api-client-pattern).

### Database
- A single SQLite file at `server/data/tasks.db`.
- Managed through a two-tier migration system (legacy bootstrap migrations +
  numbered schema migrations tracked by a `SYSTEM_SCHEMA_ID` setting). See
  [Database & Migrations](database.md).

## Request flow (example: loading the dashboard)

1. Browser requests `/` → Nginx serves `index.html` + hashed JS/CSS bundles.
2. On boot, the SPA reads/creates a **device name** (random UUID in
   `localStorage`, see [`utils/deviceName.js`](../../client/src/utils/deviceName.js)).
3. The SPA calls, via the Nginx `/api` proxy:
   - `GET /api/devices/:device/settings` — widget/plugin/theme settings for this device
   - `GET /api/devices/:device/tabs` — the device's tabs and per-tab layout config
   - `GET /api/devices/:device/widget-assignments` — which widgets are on which tab
   - `GET /api/widgets` — installed custom plugins
   - `GET /api/settings` — global API keys (weather, ICS URL)
4. Enabled widgets are lazy-loaded and rendered into a draggable/resizable grid.
5. Each widget fetches its own data (e.g. `GET /api/calendar-events`,
   `GET /api/chore-schedules`, weather from OpenWeatherMap directly, etc.).

## Key architectural decisions & their consequences

| Decision | Why | Consequence for contributors |
| --- | --- | --- |
| Per-device config keyed by a `localStorage` UUID | Multiple physical displays share one backend but each shows a different layout | There is no "global" layout; test with a known device name. Clearing browser storage creates a *new* device. |
| No authentication, optional Admin PIN only | Designed for trusted LAN / kiosk use | Never expose to the internet without a reverse proxy + your own auth. See the [security note](../../README.md#-security). |
| Single-file backend | Simplicity for a small project | Use the route-group map in the [Backend Reference](../reference/backend-api.md) to navigate; grep by path prefix. |
| Settings stored as JSON blobs (`device_settings_json`, `config_json`) | Flexible, schema-light per-device data | Reads/writes go through `parseJsonObject`/merge helpers, not columns. |
| Credentials encrypted at rest (AES-256-CBC) | Protect CalDAV/Google secrets in the DB | Requires a stable `ENCRYPTION_KEY`; changing it invalidates stored secrets. |
| Custom widgets are sandboxed iframes | Untrusted HTML shouldn't touch the app | Widgets get theme via URL params and the shared `/index.css`; see [Custom Widgets](../guides/custom-widgets.md). |

## Technology stack summary

| Layer | Technology |
| --- | --- |
| Frontend framework | React 19, Vite 8 |
| UI / styling | MUI v9, Emotion, CSS variables, `react-grid-layout`, `react-rnd`, `hammerjs` (touch), `recharts` (graphs), `react-big-calendar` |
| Frontend tests | Vitest + `@vitest/coverage-v8` |
| Backend framework | Fastify 5 (`@fastify/cors`, `@fastify/static`, `@fastify/multipart`) |
| Database | SQLite via `better-sqlite3` |
| Scheduling | `node-cron`, `cron-parser` |
| Calendar | `node-ical`, `ical.js`, `ical-generator`, CalDAV, Google Calendar API |
| Backend tests | Built-in `node:test` runner, coverage via `c8` |
| Packaging | Docker (multi-stage), Nginx, GitHub Actions → GHCR |

Continue to [Database & Migrations](database.md) or the
[Backend Reference](../reference/backend-api.md).
