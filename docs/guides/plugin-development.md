# Plugin Development Guide

This is the complete guide to building HomeGlow plugins — from a simple HTML
widget to a full **platform plugin** with server-side storage, settings the
Admin Panel renders for you, live core events, and automatic server-side
reactions.

Related reading:
- [Custom Widget Development](custom-widgets.md) — quick summary + theming details.
- [Plugin Platform Architecture](../architecture/plugin-platform.md) — design
  rationale (issue #105).
- [`server/widgets/README.md`](../../server/widgets/README.md) — widget HTML
  templates.

## The two tiers

| | Basic widget | Platform plugin |
| --- | --- | --- |
| **What it is** | A single `.html` file rendered in a sandboxed iframe | The same file **plus an embedded manifest** |
| **Can call the REST API** | ✅ (same-origin) | ✅ |
| **Server-side storage** | — | ✅ namespaced key/value store |
| **Admin Panel settings** | enabled / transparency / refresh only | ✅ plus your own declared settings |
| **Live core events** | — | ✅ `HomeGlow.on('clam.withdrawn', ...)` |
| **Server-side reactions** | — | ✅ run even when no dashboard shows the widget |
| **Survives app upgrades** | ✅ (stored in the database) | ✅ (plugin *and* its data) |

A basic widget stays a basic widget forever if you want — nothing platform-side
is required. Add a manifest only when you need the extra capabilities.

## 1. Basic widget in five minutes

Create a single HTML file:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Widget</title>
  <link rel="stylesheet" href="/index.css">
  <style>
    body {
      background: var(--card-bg);
      color: var(--text-color);
      font-family: sans-serif;
      margin: 0;
      padding: 16px;
    }
  </style>
</head>
<body>
  <h3>Hello HomeGlow</h3>
  <div id="content">Loading…</div>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Theme + transparency come in on the URL.
      const params = new URLSearchParams(window.location.search);
      const theme = params.get('theme');
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute('data-theme', theme);
      }
      if (params.get('transparent') === 'true') {
        document.body.style.background = 'transparent';
      }

      // Widgets are same-origin: call any HomeGlow API directly.
      fetch('/api/users')
        .then((res) => res.json())
        .then((users) => {
          document.getElementById('content').textContent =
            `${users.length} family member(s)`;
        });
    });
  </script>
</body>
</html>
```

Install it via **Admin Panel → Widgets → Plugins → Upload Widget**, enable it,
assign it to a tab. Test both themes with `?theme=dark` / `?theme=light` while
developing. For external services without CORS headers, use the proxy:
`GET /api/proxy?url=...`.

> **Which endpoints can I call?** See the [API reference](#10-api-reference)
> (§10) for the data endpoints a plugin commonly reads and the stable plugin
> platform API.

Widgets are stored in HomeGlow's database, so they (and everything below)
survive app upgrades.

## 2. Becoming a platform plugin: the manifest

Embed a manifest as a JSON script block anywhere in your HTML (conventionally in
`<head>`):

```html
<script type="application/json" id="homeglow-manifest">
{
  "manifestVersion": 1,
  "id": "my-plugin",
  "name": "My Plugin",
  "apiVersion": "v1",
  "storage": true,
  "settings": [ ... ],
  "events": [ ... ],
  "reactions": [ ... ]
}
</script>
```

Then load the SDK:

```html
<script src="/plugin-sdk/v1.js"></script>
```

The server injects `window.__HOMEGLOW_PLUGIN__ = { id, apiVersion }` when
serving your widget, and the SDK picks it up — you never pass your own id.

### Manifest reference

| Field | Required | Description |
| --- | --- | --- |
| `manifestVersion` | ✅ | Must be `1`. |
| `id` | ✅ | Unique lowercase slug (`a-z`, `0-9`, `-`, max 64). Your namespace for storage/settings/events. Stable across versions — changing it orphans your data. |
| `name` | — | Display name shown in the Admin Panel (falls back to the filename). |
| `apiVersion` | — | `"v1"` — the API contract you target. |
| `storage` | — | `true` to use the storage API. Without it, storage calls are 403. |
| `settings` | — | Declared settings the Admin Panel renders (see §4). |
| `events` | — | Core events to receive while mounted (see §5). |
| `reactions` | — | Server-side increments run on events (see §6). Requires `storage: true`. |

**Validation is strict and loud**: an invalid manifest rejects the upload with
the exact errors (400), and a duplicate `id` is a 409. A widget *without* a
manifest block always installs as a basic widget.

## 3. Storage — your server-side state

With `"storage": true`, your plugin gets a private key/value store in HomeGlow's
database — state survives page reloads, different devices, and app upgrades.

```javascript
// JSON documents under string keys (keys: A-Za-z0-9 : _ . - , max 128 chars)
await HomeGlow.storage.set('buckets:user:3', { spend: 10, save: 5, give: 0 });
const buckets = await HomeGlow.storage.get('buckets:user:3');  // null if missing
const everything = await HomeGlow.storage.list();              // { key: value, ... }
const existed = await HomeGlow.storage.remove('buckets:user:3');

// Atomic counter: adds delta to a number at a dot-path inside the document
// stored under the key (document/path created on demand). Safe under
// concurrent writers — use this instead of get-modify-set for counters.
const { result, value } = await HomeGlow.storage.increment('give-pool', 'total', 2);
```

Limits: 64 KB per value, 500 keys per plugin. (Storage works in demo mode too —
it just resets with the demo cycle.)

Raw endpoints (if you prefer `fetch`):

```
GET    /api/plugin/v1/storage/:pluginId              all keys
GET    /api/plugin/v1/storage/:pluginId/:key         one value | 404
PUT    /api/plugin/v1/storage/:pluginId/:key         upsert JSON body
DELETE /api/plugin/v1/storage/:pluginId/:key
POST   /api/plugin/v1/storage/:pluginId/:key/increment   { path, delta }
```

## 4. Settings — rendered by the Admin Panel for you

Declare settings and the Admin Panel shows them in your plugin's card
(**Plugin Options**). You never build settings UI.

```json
"settings": [
  { "key": "siphonAmount", "label": "Give-bucket siphon (clams)",
    "type": "number", "default": 2, "min": 0, "max": 10 },
  { "key": "mode", "label": "Default bucket", "type": "select",
    "options": ["spend", "save", "give"], "default": "save" },
  { "key": "showChart", "label": "Show chart", "type": "boolean",
    "default": true, "scope": "device" }
]
```

| Property | Notes |
| --- | --- |
| `key` | Alphanumeric identifier, unique within the plugin. |
| `type` | `number` (optional `min`/`max`) · `string` · `boolean` · `select` (requires `options`, an array of strings). |
| `default` | Used until a value is saved. |
| `scope` | `"household"` (default): one value shared by every display — right for behavior like a siphon amount. `"device"`: per-display — right for presentation like a compact toggle. |

Read and write from the plugin:

```javascript
const settings = await HomeGlow.settings.get();
// -> { siphonAmount: 2, mode: "save", showChart: true }  (effective values)

await HomeGlow.settings.set({ mode: 'give' });  // validated server-side
```

Values are validated against your declared schema on every write (wrong type,
out-of-range, unknown key → 400; all-or-nothing).

## 5. Events — react live to what happens in HomeGlow

Declare the events you want; while your widget is visible on a display, the
dashboard streams them into your iframe:

```json
"events": ["clam.withdrawn", "chore.completed"]
```

```javascript
const off = HomeGlow.on('clam.withdrawn', (payload, meta) => {
  // payload: { userId, amount, newTotal }; meta: { event, emittedAt }
  refreshDisplay();
});
// off() or HomeGlow.off('clam.withdrawn', handler) to unsubscribe
```

### Event catalog

| Event | Fires when | Payload |
| --- | --- | --- |
| `clam.deposited` | clams added to a user | `{ userId, amount, newTotal }` |
| `clam.withdrawn` | clams reduced from a user | `{ userId, amount, newTotal }` |
| `chore.completed` | a chore is completed | `{ userId, choreId, scheduleId, clamValue, date }` |
| `chore.uncompleted` | a completion is undone | `{ userId, choreId, scheduleId, clamValue, date }` |

Declaring an event not in the catalog rejects the install — typos fail loudly.
Only declared events are ever delivered to your iframe.

**Important:** events fire in your widget only while it is mounted. They are
live UI signals, not a durable feed — anything that must not be missed belongs
in a **reaction** (next section) and durable state in **storage**.

## 6. Reactions — server-side logic without server-side code

A reaction is a bounded storage increment HomeGlow itself executes whenever an
event fires — **exactly once per event, even with zero dashboards open**. You
declare *what*; the server does it. (This is deliberate: HomeGlow never runs
plugin JavaScript on the server.)

```json
"reactions": [
  {
    "on": "clam.withdrawn",
    "action": "increment",
    "key": "give-pool",
    "path": "total",
    "delta": { "setting": "siphonAmount" }
  }
]
```

Reads as: *when clams are withdrawn, add the current value of my `siphonAmount`
setting to `total` inside my `give-pool` storage document.*

| Property | Notes |
| --- | --- |
| `on` | An event from the catalog. |
| `action` | `"increment"` (the only action today). |
| `key` / `path` | Storage document and dot-path to the number (created on demand). |
| `delta` | A literal number, `{ "setting": "<key>" }` (a declared **household number** setting — resolved live at fire time), or `{ "payload": "<field>" }` (a numeric field from the event payload, e.g. `amount`). |
| `factor` | Optional multiplier on the resolved delta (default `1`). `factor: -1` builds a **mirror reaction** that compensates an undo event. |

Requires `"storage": true`. The increment is atomic; a failed reaction is
logged server-side and never breaks the triggering action or other plugins.

**Pair do/undo events.** If you react to `chore.completed`, declare the mirror
on `chore.uncompleted` with `factor: -1` — otherwise complete → uncomplete →
re-complete double-counts your increment:

```json
"reactions": [
  { "on": "chore.completed",   "action": "increment", "key": "bank", "path": "tally",
    "delta": { "payload": "clamValue" } },
  { "on": "chore.uncompleted", "action": "increment", "key": "bank", "path": "tally",
    "delta": { "payload": "clamValue" }, "factor": -1 }
]
```

(Clam withdrawals have no undo event, so `clam.withdrawn` reactions like the
siphon need no mirror.)

## 7. Worked example: clam buckets (spend / save / give)

The motivating plugin for the platform, complete and installable. 15 clams =
$10 in our house; on every withdrawal an extra configurable amount is siphoned
into a shared *give* pool — even when no dashboard is showing the widget.

```html
<!DOCTYPE html>
<html>
<head>
  <title>Clam Buckets</title>
  <link rel="stylesheet" href="/index.css">

  <script type="application/json" id="homeglow-manifest">
  {
    "manifestVersion": 1,
    "id": "clam-buckets",
    "name": "Clam Buckets",
    "apiVersion": "v1",
    "storage": true,
    "settings": [
      { "key": "siphonAmount", "label": "Give-bucket siphon (clams per withdrawal)",
        "type": "number", "default": 2, "min": 0, "max": 10 },
      { "key": "giveGoal", "label": "Give-pool goal before donating",
        "type": "number", "default": 30, "min": 1 }
    ],
    "events": ["clam.withdrawn", "clam.deposited"],
    "reactions": [
      { "on": "clam.withdrawn", "action": "increment",
        "key": "give-pool", "path": "total",
        "delta": { "setting": "siphonAmount" } }
    ]
  }
  </script>

  <style>
    body { background: var(--card-bg); color: var(--text-color);
           font-family: sans-serif; margin: 0; padding: 16px; }
    .pool { font-size: 2em; font-weight: bold; color: var(--accent); }
    .goal-hit { animation: pulse 1s infinite alternate; }
    @keyframes pulse { to { opacity: 0.6; } }
  </style>
</head>
<body>
  <h3>🌊 Give Pool</h3>
  <div class="pool" id="pool">…</div>
  <div id="status"></div>

  <script src="/plugin-sdk/v1.js"></script>
  <script>
    async function refresh() {
      const [pool, settings] = await Promise.all([
        HomeGlow.storage.get('give-pool'),
        HomeGlow.settings.get(),
      ]);
      const total = pool?.total ?? 0;
      const el = document.getElementById('pool');
      el.textContent = `${total} clams`;
      el.classList.toggle('goal-hit', total >= settings.giveGoal);
      document.getElementById('status').textContent =
        total >= settings.giveGoal
          ? '🎉 Goal reached — time to pick a cause!'
          : `${settings.giveGoal - total} to go (siphoning ${settings.siphonAmount}/withdrawal)`;
    }

    document.addEventListener('DOMContentLoaded', () => {
      const params = new URLSearchParams(window.location.search);
      const theme = params.get('theme');
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute('data-theme', theme);
      }
      if (params.get('transparent') === 'true') {
        document.body.style.background = 'transparent';
      }

      refresh();
      // Live update while visible; the reaction keeps the pool correct
      // even while this widget is not mounted anywhere.
      HomeGlow.on('clam.withdrawn', refresh);
      HomeGlow.on('clam.deposited', refresh);
    });
  </script>
</body>
</html>
```

How the pieces cooperate:
- The **reaction** guarantees the siphon — server-side, atomic, once per
  withdrawal, using the live `siphonAmount` value.
- **Storage** holds the pool; it survives reloads, devices, and upgrades.
- **Settings** let the family tune the siphon and goal in the Admin Panel —
  household-scoped, so every display agrees.
- **Events** just refresh the UI when it happens to be on screen.

## 8. Development workflow & debugging

1. Write the HTML file; test standalone in a browser with `?theme=dark`.
2. Upload via **Admin Panel → Widgets → Plugins**. Re-uploading the same
   filename replaces the content in place (manifest re-validated each time).
3. Enable it, assign it to a tab, check both themes + transparency.
4. Debugging:
   - The browser console *inside the iframe* shows your JS errors.
   - `GET /api/widgets/debug` lists installed plugins (id, manifest present,
     content size).
   - `GET /api/plugin/v1/storage/<your-id>` shows your stored state.
   - `GET /api/plugin/v1/settings/<your-id>` shows effective settings.
   - Reaction failures are logged in the backend logs (`docker logs
     homeglow-backend`), never surfaced to the triggering user.
5. Publishing: submit to
   [jherforth/HomeGlowPlugins](https://github.com/jherforth/HomeGlowPlugins) so
   others can install it from the Admin Panel's GitHub tab.

## 9. Rules of thumb

- **Stay single-file** — no external CDNs; inline your CSS/JS. The app
  stylesheet (`/index.css`) gives you the theme variables.
- **Durable state → storage; UI state → the iframe.** Never keep balances in
  `localStorage` — that's per-device and wiped with browser data.
- **Must-not-miss logic → reactions.** `HomeGlow.on` handlers only run while
  your widget is on screen; reactions always run.
- **Counters → `increment`**, not get-modify-set — it's atomic under
  concurrent writers.
- **Behavior settings → household scope; presentation settings → device
  scope.**
- **Pick your `id` once.** Storage and settings are keyed by it; renaming it
  orphans existing data. Deleting a plugin keeps its stored data by default, so
  a reinstall under the same id picks up where it left off — the Admin Panel
  offers to purge the data on delete (`DELETE /api/widgets/:filename?purgeData=true`),
  which you should accept before installing a *different* plugin that uses the
  same id.
- Plugins are **fully trusted** in HomeGlow's self-hosted model (no auth) —
  install plugins you've read or trust the source of.

## 10. API reference

Plugins run in a **same-origin, unauthenticated** iframe, so they can `fetch()`
any HomeGlow endpoint directly. There are two tiers, and the difference matters:

- **The plugin platform API (`/api/plugin/v1/*`)** — a **stable, versioned
  contract**. It is frozen: a breaking change would ship as `/api/plugin/v2`,
  with v1 kept through a deprecation window. **Build on this.**
- **The core REST API (every other `/api/*` route)** — callable, but
  **unversioned and subject to change without notice**. It's the app's internal
  API; a core refactor can rename a field or route. Read from it freely, but
  **pin anything you depend on into your own plugin storage** rather than
  assuming shapes stay put.

All responses are JSON. Errors are uniformly `{ "error": "<message>" }` with an
appropriate HTTP status.

### 10.1 Plugin platform API (`/api/plugin/v1`) — the stable contract

The SDK (`HomeGlow.storage`, `HomeGlow.settings`, `HomeGlow.on`) wraps these —
see §3–§5. The raw endpoints:

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/plugin/v1/storage/:pluginId` | → `{ key: value, ... }` (all your docs) |
| `GET` | `/api/plugin/v1/storage/:pluginId/:key` | → the stored JSON value, or `404` |
| `PUT` | `/api/plugin/v1/storage/:pluginId/:key` | body: any JSON → `{ success }` (64 KB/value, 500 keys/plugin; `413` over cap) |
| `DELETE` | `/api/plugin/v1/storage/:pluginId/:key` | → `{ success }`, or `404` |
| `POST` | `/api/plugin/v1/storage/:pluginId/:key/increment` | body: `{ path, delta }` → `{ success, result, value }` (atomic) |
| `GET` | `/api/plugin/v1/settings/:pluginId?device=<name>` | → `{ settingKey: value }` (manifest default ← stored value) |
| `PUT` | `/api/plugin/v1/settings/:pluginId?device=<name>` | body: `{ settingKey: value }` → `{ success }` (validated; `?device=` required for device-scoped keys) |
| `GET` | `/api/plugin/v1/events/stream` | SSE: `data: { event, payload, emittedAt }` per event |

`:pluginId` must match your manifest `id`, and storage/settings require
`"storage": true` / declared `settings` respectively (else `403`).

### 10.2 Core data endpoints (call at your own risk)

The read endpoints and clam mutations a plugin most often integrates with.
Shapes are current as of this writing — treat them as unversioned.

**Users & clams** — a user's clam total is the sum of their `chore_history` rows.

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/users` | → `[{ id, username, email, profile_picture, clam_total }]` |
| `GET` | `/api/users/:id/clams` | → `{ user_id, clam_total }` |
| `POST` | `/api/users/:id/clams/add` | body: `{ amount, date? }` → `{ success, clam_total }` — emits `clam.deposited` |
| `POST` | `/api/users/:id/clams/reduce` | body: `{ amount }` → `{ success, clam_total }` (`400` if insufficient) — emits `clam.withdrawn` |

**Chore history** — the clam ledger.

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/chore-history?user_id=&date=&date_from=&date_to=` | → history rows (all filters optional) |
| `GET` | `/api/chore-history/user/:userId` | → all rows for a user |
| `GET` | `/api/chore-history/summary/:userId` | → `{ user_id, clam_total }` |
| `GET` | `/api/chore-history/recent?days=7` | → `[{ id, date, clam_value, title, created_at, username }]` (nonzero entries) |

**Chores & schedules**

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/chores` | → `[{ id, title, description, clam_value }]` |
| `GET` | `/api/chore-schedules?user_id=&visible=&chore_id=` | → schedule rows joined with `title, description, clam_value` |
| `POST` | `/api/chores/complete` | body: `{ chore_schedule_id, user_id, date }` → `{ success, clam_total }` (`409` if already done) — emits `chore.completed` |
| `POST` | `/api/chores/uncomplete` | body: `{ chore_schedule_id, user_id, date }` → `{ success, clam_total }` — emits `chore.uncompleted` |

**Prizes, settings, calendar, photos**

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/prizes` | → `[{ id, name, clam_cost }]` |
| `GET` | `/api/settings` | → `{ KEY: value, ... }` (global app settings) |
| `POST` | `/api/settings/search` | body: `["KEY", "PREFIX_*"]` → matching settings object (`*` wildcards) |
| `GET` | `/api/calendar-events?start=&end=` | → cached synced calendar events in the window |
| `GET` | `/api/calendar` | → locally-created events |
| `GET` | `/api/photo-items` | → `[{ id, url, thumbnail, type, source_id, source_name, source_type }]` |

The four endpoints marked "emits …" fire [events](#5-events--react-live-to-what-happens-in-homeglow)
your plugin can subscribe to (§5) and drive [reactions](#6-reactions--server-side-logic-without-server-side-code) (§6).

### 10.3 The CORS proxy (`/api/proxy`)

To reach an external service that lacks CORS headers, route the request through
`GET /api/proxy?url=<encoded-url>`. Two constraints:

- The target host must be in the `PROXY_WHITELIST` setting (an admin adds it) —
  otherwise `403`.
- It is **disabled in demo mode** (so the demo can't be used as an open relay).

### Beyond this list

This is the plugin-relevant subset. For the complete backend REST surface —
device/tab configuration, calendar-source management, Google/Apple connections,
photo-source setup, admin — see the [Backend Reference](../reference/backend-api.md).
Remember those routes are unversioned: prefer the platform API (§10.1) wherever
it covers your need.
