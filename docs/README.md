# HomeGlow Documentation

Welcome to the HomeGlow developer documentation. This directory is the starting
point for anyone evaluating the project or preparing to contribute. It describes
what HomeGlow is **in its current state**, how the pieces fit together, and how
to get productive quickly.

Please be sure to update these docs as changes are made to ensure the information
stays relevant.

> **HomeGlow** is an open-source, self-hosted dashboard for touch-enabled home
> displays (think Magic Mirror), built as a React SPA frontend and a Fastify +
> SQLite backend, shipped as two Docker images.

## 📚 Table of Contents

### Start here
- [Architecture Overview](architecture/overview.md) — the big picture: components, request flow, tech stack.
- [Getting Started (Local Dev)](guides/getting-started.md) — run the app on your machine with hot reload.

### Architecture & internals
- [Architecture Overview](architecture/overview.md)
- [Database & Migrations](architecture/database.md) — SQLite schema, tables, and the migration system.
- [Backend Reference](reference/backend-api.md) — server structure, services, and the full REST API surface.
- [Frontend Reference](reference/frontend.md) — React component map, state, and data flow.
- [Mobile Experience (Phase 2)](architecture/mobile-experience.md) — proposed architecture for a phone-native view that leaves the kiosk untouched.
- [Chores Refactor History](architecture/chores-refactor-history.md) — the (implemented) original design spec for the three-table chore system.

### Feature deep-dives
- [Features & Domains](reference/features.md) — chores/clams, calendar sync, photos, screensaver, theming, tabs & layout.

### Guides
- [Getting Started (Local Dev)](guides/getting-started.md)
- [Deployment](guides/deployment.md) — Docker Compose, Portainer, Proxmox LXC, and updating.
- [Demo Mode](guides/demo-mode.md) — run a public, self-resetting showcase instance with sample data.
- [Configuration](reference/configuration.md) — environment variables and admin-panel settings.
- [Custom Widget Development](guides/custom-widgets.md) — build and publish your own HTML widgets.
- [Contributing](guides/contributing.md) — workflow, testing, conventions, and how to add a migration.

## 🗺️ Repository layout at a glance

```
HomeGlow/
├── client/                 # React 19 + Vite frontend (SPA)
│   ├── src/
│   │   ├── app.jsx         # Root application component (dashboard shell)
│   │   ├── main.jsx        # Entry point + minimal path-based routing
│   │   ├── components/     # Widgets, admin panel, tab bar, screensaver, etc.
│   │   ├── pages/          # Dashboard, PhotosUpload
│   │   └── utils/          # apiConfig, deviceName, timezone, chore/color helpers (+ tests)
│   ├── Dockerfile          # Multi-stage build -> Nginx
│   └── nginx.conf          # SPA serving + /api, /uploads, /widgets reverse proxy
├── server/                 # Fastify + better-sqlite3 backend
│   ├── index.js            # Single-file API server (~4200 lines, all routes)
│   ├── migrations/         # Legacy bootstrap migrations + numbered schema migrations
│   ├── services/           # Calendar sync, Google/Apple integrations, photos
│   ├── utils/              # encryption
│   ├── widgets/            # Uploaded custom HTML widgets + authoring README
│   ├── tests/              # node:test suites (API, calendar, encryption)
│   └── Dockerfile
├── docker-compose.yml      # Production (pre-built GHCR images)
├── docker-compose-dev.yml  # Development (builds locally)
├── .github/workflows/      # CI tests + Docker image publishing
└── docs/                   # You are here
```

## 🔑 Facts worth knowing before you dive in

- **Two deployable units**: `homeglow-frontend` (Nginx serving the built SPA and
  proxying `/api`) and `homeglow-backend` (Fastify). They talk over a Docker
  network; the browser only ever talks to the frontend.
- **No user accounts / auth**: the app has no login. The only access control is an
  optional PIN on the Admin Panel. Do not expose it to the public internet.
- **Per-device configuration**: each browser generates a random device name
  (stored in `localStorage`) and its own tabs, layout, and widget settings live
  server-side keyed by that device name.
- **SQLite is the single source of truth** for chores, users, calendars, photos,
  settings, tabs, and layouts. The DB file lives at `server/data/tasks.db`.
- **The backend is one big file** — [`server/index.js`](../server/index.js). Route
  groups are documented in the [Backend Reference](reference/backend-api.md).

See [Architecture Overview](architecture/overview.md) to continue.
