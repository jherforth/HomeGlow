# Contributing

Thanks for helping improve HomeGlow! This expands on the root
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) with the details a new developer needs to
land a change confidently.

## Workflow

1. **Fork** and clone the repo.
2. **Create a feature branch**: `git checkout -b feature/your-change`.
3. Set up local dev — see [Getting Started](getting-started.md).
4. Make your change following existing patterns.
5. **Test** (both suites) and verify light **and** dark themes plus multiple screen
   sizes (mobile/tablet/desktop) — the app is touch-first.
6. Open a **Pull Request** with a clear description.

CI runs the frontend and backend test suites on every push
([`ci-tests.yml`](../../.github/workflows/ci-tests.yml)); keep them green.

## Project conventions

- **Backend is a single file.** New routes go in
  [`server/index.js`](../../server/index.js) next to related routes; extract shared
  logic into `services/` or `utils/`. Update the endpoint table in the
  [Backend Reference](../reference/backend-api.md) when you add/change routes.
- **Prepared statements** for all SQL (better-sqlite3). Respect foreign keys.
- **Per-device settings** live in JSON blobs (`device_settings_json`,
  `tabs.config_json`) — read/write via the existing parse/merge helpers rather than
  adding columns, unless the data is truly relational.
- **Frontend**: MUI v9 components; theme via CSS variables and `data-theme`, not
  hardcoded colors. Widgets are lazy-loaded — follow the `React.lazy` +
  `Suspense` + idle-warmup pattern in [`app.jsx`](../../client/src/app.jsx).
- **Secrets** (calendar/Google credentials) must be encrypted before storage; use the
  existing encryption helpers.
- **Google API calls** use the shared `googleConnection.createGoogleFetch(apiBase, label)`
  factory rather than writing raw `fetch` calls. This handles token lifecycle,
  Bearer auth, JSON parsing, and structured error objects. Add new Google
  integrations by instantiating a configured `googleFetch` from the factory.
- **Endpoint guards & validation** follow a send-reply-then-`return null` convention:
  helpers like `loadGooglePhotoSourceOr404(id, reply)` or `validatePrizeBody(body, reply)`
  send the error response and return `null`, and the handler does `if (!x) return;`.
  Prefer extracting/reusing one of these over re-inlining the same lookup-or-404 /
  validate-or-400 guard in a new route.
- Add **error handling** and keep touch/mouse parity for interactive UI.

## Testing

| Area | Command | Framework |
| --- | --- | --- |
| Frontend | `cd client && npm test` | Vitest (`*.test.js` beside sources) |
| Frontend coverage | `npm run test:coverage` | `@vitest/coverage-v8` |
| Backend | `cd server && npm test` | Node built-in `node:test` |
| Backend (keep artifacts) | `npm run test-debug` | — |
| Backend coverage | `npm run test:coverage` | `c8` |

Backend tests are orchestrated by
[`runServerTests.js`](../../server/tests/runServerTests.js), which cleans temp DB
artifacts before and after the run. Environment flags
`HOMEGLOW_DISABLE_BACKGROUND_JOBS=1` and `HOMEGLOW_DISABLE_CALENDAR_SYNC=1` let you
run the server without background timers during tests.

Add tests alongside your change: a `*.test.js` next to a util, or a case in the
relevant `server/tests/*.test.js` suite.

## Adding a database migration

Migrations are described in detail in
[Database & Migrations](../architecture/database.md). To add one:

1. Copy [`server/migrations/migrationTemplate.js`](../../server/migrations/migrationTemplate.js)
   to `schemaNN-shortName.js`, where `NN` is the next unused schema id.
2. Put your DDL/DML where the template marks `MIGRATION SQL GOES HERE`. It runs
   inside a transaction; the template already commits and writes the new
   `SYSTEM_SCHEMA_ID`. Use `PRAGMA table_info(...)` guards to stay idempotent when
   adding columns.
3. Register it in the `schemaMigrations` array in
   [`server/index.js`](../../server/index.js):
   ```js
   { schemaId: NN, migrationPath: './migrations/schemaNN-shortName' },
   ```
4. Test against a copy of a real DB and a fresh DB. Migrations only run when their
   `schemaId` exceeds the stored version, so they apply exactly once per database.

**Don't** edit `initializeDatabase.js` or existing numbered migrations for schema
changes on existing installs — always add a new numbered migration so upgrades apply
cleanly.

## Documentation

Update the relevant page in `docs/` when you change behavior — new routes
(Backend Reference), schema (Database), settings (Configuration), or features
(Features). Keep the [docs index](../README.md) links working.

## Where to look for X

| I want to… | Start here |
| --- | --- |
| Add/modify an API endpoint | [`server/index.js`](../../server/index.js) + [Backend Reference](../reference/backend-api.md) |
| Change the DB schema | [Database & Migrations](../architecture/database.md) |
| Work on a widget's UI | `client/src/components/<Widget>.jsx` + [Frontend Reference](../reference/frontend.md) |
| Change dashboard layout/tabs | `WidgetContainer.jsx`, `TabBar.jsx`, `app.jsx` |
| Add configuration/settings | [Configuration](../reference/configuration.md) + `AdminPanel.jsx` |
| Build a custom widget | [Custom Widget Development](custom-widgets.md) |
| Understand chores/clams | [Features](../reference/features.md#chores--the-clam-reward-system) |
