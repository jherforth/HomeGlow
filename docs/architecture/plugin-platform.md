# Plugin Platform Architecture (Issue #105)

> **Status:** Proposed design. Nothing here is implemented yet — this is the
> planning spec for issue [#105 "feat: Plugin extensibility"](https://github.com/jherforth/HomeGlow/issues/105),
> milestone 1.7. The database-flexibility half of the original discussion (external
> Postgres/MariaDB, ORM adoption) was split out to #119 and is **out of scope** here.

This document describes how to evolve HomeGlow's current "static HTML in an iframe"
plugin system into a small **plugin platform** that lets plugins react to core
events, persist their own data, and expose their own settings — without breaking
the trusted, self-hosted, single-origin model that makes the current system simple.

## 1. Where plugins stand today

The current system (see [Custom Widgets](../guides/custom-widgets.md)) is
deliberately minimal:

| Piece | Today |
| --- | --- |
| **Format** | A single `.html` file uploaded via Admin Panel → Plugins, or installed from the `jherforth/HomeGlowPlugins` GitHub repo. |
| **Storage on disk** | `server/widgets/<file>.html`, tracked in `server/widgets_registry.json` (`[{ name, filename }]`). |
| **Serving** | `GET /widgets/:filename` — backend rewrites `localhost:PORT` to the live origin and injects an overflow-fix `<style>`. |
| **Rendering** | [`PluginWidgetWrapper.jsx`](../../client/src/components/PluginWidgetWrapper.jsx) renders an `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups">` at `/widgets/<file>?theme=<t>`. |
| **API access** | Because the iframe is **same-origin**, a plugin can already `fetch()` the entire REST API, including the CORS proxy at `GET /api/proxy`. There is no auth — plugins are fully trusted. |
| **Settings** | Only `enabled`, `transparentBackground`, and a refresh interval, stored **per device** inside `devices.device_settings_json → pluginSettings[filename]`. |

### What plugins cannot do today

1. **React to core events** — no notification when a chore is completed or clams
   are withdrawn.
2. **Persist their own data** — no server-side storage a plugin can call its own;
   the only durable surface is per-device settings JSON.
3. **Declare their own settings** — the Admin Panel renders a fixed set of
   controls; a plugin cannot add a "siphon amount" field.

So "advanced plugins" is **not** about granting API access (plugins already have
it). It is about adding the three missing platform pieces above and formalizing
the implicit contract so core refactors don't silently break community plugins.

## 2. The reference use case: clam buckets

The motivating plugin — used throughout this doc as the acceptance test — is a
**clam bucket** system (spend / save / give):

- Kids **withdraw** clams (mechanism exists: `POST /api/users/:id/clams/reduce`).
- On each withdrawal, the plugin **siphons** a configurable extra amount (e.g.
  2 clams) into a shared **give** bucket → needs an **event on withdrawal**, and a
  **siphon-value setting**.
- Per-kid spend/save/give balances plus the family give pool live in the plugin's
  **own bank** → needs **plugin storage**.
- When the give bucket crosses a threshold, the family picks a donation → plugin
  UI over its own data, calling core APIs.

If the platform can express this plugin cleanly, the design is right.

## 3. The four capabilities

The issue asks for four platform capabilities, tied together by a **manifest**:

- **(a)** A versioned plugin API contract (`/api/plugin/v1/...`).
- **(b)** An event system (core emits domain events; plugins subscribe).
- **(c)** Plugin-owned, namespaced storage.
- **(d)** Per-plugin declared settings, rendered by the Admin Panel.

Each is designed below. They can ship independently and in order — **(a)** and
**(c)** first (self-contained), then **(d)**, then **(b)** (the largest piece).

---

## 4. The plugin manifest — the tie that binds

Today a plugin is one HTML file plus a two-field registry entry. The platform
replaces that with a **manifest** — a small JSON descriptor a plugin ships
alongside its HTML.

### 4.1 Format

A manifest is `<pluginId>.plugin.json`, uploaded next to (or embedded in) the
widget HTML. `pluginId` is a slug (`[a-z0-9-]+`), stable across versions, and is
the namespace key for storage, settings, and event subscriptions.

```jsonc
{
  "manifestVersion": 1,
  "id": "clam-buckets",
  "name": "Clam Buckets",
  "version": "1.0.0",
  "entry": "clam-buckets.html",
  "apiVersion": "v1",            // which /api/plugin/vN contract it targets
  "storage": true,               // plugin uses the storage surface
  "events": [                    // domain events it subscribes to
    "clam.withdrawn"
  ],
  "settings": [                  // declared, Admin-Panel-rendered settings
    {
      "key": "siphonAmount",
      "label": "Give-bucket siphon (clams per withdrawal)",
      "type": "number",
      "default": 2,
      "min": 0,
      "scope": "household"       // "household" (default) | "device"
    }
  ]
}
```

### 4.2 Backwards compatibility

A plugin **without** a manifest is a legacy widget: it keeps working exactly as
today (static HTML, per-device `enabled`/`transparent`/refresh, full API access,
no events/storage/declared settings). The manifest is purely additive — the
registry entry gains an optional `manifest` field.

### 4.3 Registry evolution

`widgets_registry.json` today is `[{ name, filename }]`. It becomes:

```jsonc
[
  {
    "name": "Clam Buckets",
    "filename": "clam-buckets.html",
    "pluginId": "clam-buckets",       // present only for manifest plugins
    "manifest": { /* parsed manifest, validated on upload/install */ }
  },
  { "name": "Weather", "filename": "weather.html" }   // legacy, unchanged
]
```

> **Decision:** the manifest is parsed and **validated once at upload/install
> time**, then cached in the registry, so the hot path (`GET /api/widgets`,
> event dispatch) never re-reads disk. Invalid manifests reject the upload with a
> clear error rather than half-installing.

---

## 5. Capability (a): versioned plugin API contract

### 5.1 Problem

Plugins today call arbitrary internal routes (`/api/users/:id/clams/reduce`, …).
Any core refactor can silently break a community plugin, and there is no
designated surface to hang a future permission model on.

### 5.2 Design

Introduce a **stable, versioned namespace**: `/api/plugin/v1/...`. This is *not*
a rewrite of the API — it is a thin, documented, deliberately-frozen surface that
the platform commits to. It contains:

- **Storage** — `/api/plugin/v1/storage/...` (capability c).
- **Settings** — `/api/plugin/v1/settings/...` (capability d).
- **A curated, stable subset of read/write domain endpoints** the platform
  guarantees, e.g. `/api/plugin/v1/users`, `/api/plugin/v1/users/:id/clams`, and
  the clam mutations. These may **proxy** to the existing internal routes at
  first — the point is the *contract*, not new logic.

Everything under `/api/plugin/v1` is documented in
[Backend Reference](../reference/backend-api.md) and versioned: a breaking change
means a new `v2` namespace, with `v1` kept until a deprecation window passes.
Internal routes (`/api/...` without the `plugin/vN` prefix) carry **no stability
promise** and plugins are documented as using them at their own risk.

### 5.3 Off-ramp to a permission model (future, not 1.7)

Because everything a "platform plugin" needs now flows through one namespace, a
future capability/permission model has a single choke point: the manifest
declares intent (`storage`, `events`, which domains it touches), and a middleware
on `/api/plugin/v1` could later enforce it with a per-plugin token. **For 1.7
plugins remain fully trusted** — we only build the *shape* that makes enforcement
possible later, we don't build enforcement.

### 5.4 Identifying the calling plugin

Storage and settings endpoints are namespaced by `pluginId` in the path
(`/api/plugin/v1/storage/:pluginId/...`). For the trusted model this is
sufficient. When a permission model arrives, the path `pluginId` is validated
against a token minted for the iframe (see §9, open questions).

---

## 6. Capability (c): plugin-owned storage

Designed before (b) because it is the most self-contained and (b) depends on it
for the reference use case.

### 6.1 Data model

A single new table — a namespaced key/value store, with values as JSON documents.
This is the smallest thing that satisfies "keep bucket balances server-side,
surviving devices and reloads."

**`plugin_storage`** (new, schema migration **18**):
```
id            INTEGER PRIMARY KEY
plugin_id     TEXT NOT NULL          -- namespace; matches registry pluginId
key           TEXT NOT NULL          -- plugin-defined key, e.g. "buckets:user:3"
value_json    TEXT NOT NULL          -- JSON document
updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
UNIQUE(plugin_id, key)
```

> **Why key/value, not per-plugin tables or documents-with-schema:** plugins are
> untyped, community-authored, and few. A KV surface needs zero per-plugin
> migration, matches HomeGlow's existing "JSON blob" pattern
> (`device_settings_json`, `config_json`), and is trivial to back up (it lives in
> the same `tasks.db`). If a plugin needs relational queries, that is a strong
> signal it should be a core feature, not a plugin.

### 6.2 API (under the v1 contract)

```
GET    /api/plugin/v1/storage/:pluginId              -> { key: value, ... }  (list all keys)
GET    /api/plugin/v1/storage/:pluginId/:key         -> value | 404
PUT    /api/plugin/v1/storage/:pluginId/:key         body: JSON value  -> upsert
DELETE /api/plugin/v1/storage/:pluginId/:key         -> 204
```

- Values are arbitrary JSON up to a per-value size cap (e.g. 64 KB) and a
  per-plugin key cap (e.g. 500 keys) to bound abuse of the shared DB.
- Writes are single-statement upserts (`INSERT ... ON CONFLICT(plugin_id,key) DO
  UPDATE`), so they inherit better-sqlite3's synchronous atomicity.
- `pluginId` in the path must exist in the registry as a manifest plugin with
  `storage: true`, else `403` — this keeps legacy widgets and typo'd namespaces
  out of the table.

### 6.3 Atomic mutations for the siphon

The reference use case needs to move clams into the give bucket **atomically**
with the withdrawal. Plain KV upserts have a read-modify-write race if two
withdrawals land together. Two options:

- **6.3a (recommended for 1.7):** a small **atomic-increment** helper endpoint —
  `POST /api/plugin/v1/storage/:pluginId/:key/increment` with `{ path, delta }` —
  that applies a numeric delta to a JSON path inside `value_json` inside one
  better-sqlite3 transaction. Covers "add N to the give bucket" without exposing a
  general transaction API.
- **6.3b (deferred):** a general "participating event handler" that runs
  server-side inside the withdrawal transaction (see §7.4). More powerful, much
  larger; not needed until a plugin needs more than counters.

---

## 7. Capability (b): the event system

The largest capability. Core emits **domain events**; plugins **subscribe**. The
central design fork is **where** delivery happens.

### 7.1 Event catalog (initial)

Start small and concrete — the events the reference use case and near neighbors
need:

| Event | Emitted when | Payload |
| --- | --- | --- |
| `clam.withdrawn` | `POST /api/users/:id/clams/reduce` succeeds | `{ userId, amount, newTotal }` |
| `clam.deposited` | `POST /api/users/:id/clams/add` succeeds | `{ userId, amount, newTotal }` |
| `chore.completed` | a chore is marked complete | `{ userId, choreId, scheduleId, clamValue }` |

Events are named `domain.pastTenseVerb`. New events are additive; the catalog is
documented in the Backend Reference.

### 7.2 Emission — a tiny in-process bus

Add a minimal internal emitter in the backend (a thin wrapper over Node's
`EventEmitter`, or a hand-rolled `dispatch(eventName, payload)` in a new
`server/services/pluginEvents.js`). Core mutation routes call
`pluginEvents.emit('clam.withdrawn', payload)` **after** their DB transaction
commits. This is one line at each emission site and has no effect if no plugin
subscribes.

### 7.3 Delivery to plugins — the design fork

Plugins run in **iframes on the client**, but the interesting events happen on the
**server**, and a plugin's server-side storage may need updating even when its
iframe isn't mounted (e.g. a kid withdraws on the kiosk; the give bucket must
update regardless of which device is showing the plugin). Three delivery models:

| Model | How | Pros | Cons |
| --- | --- | --- | --- |
| **A. Server-side webhook/handler** | Manifest registers a handler; core runs plugin logic server-side on emit | Works with no iframe mounted; can be atomic/participating | Requires running untrusted plugin *code* on the server — big security/runtime jump |
| **B. Client postMessage bridge** | `PluginWidgetWrapper` subscribes over SSE/WebSocket, forwards events into the iframe via `postMessage` | No server-side code execution; simple; reuses same-origin trust | Only fires when the iframe is mounted and the device is on the right tab |
| **C. Server SSE fan-out + plugin-owned reaction endpoint** | Core pushes events to a lightweight **server-side reducer per plugin** that only does declared, safe operations (storage writes/increments) | No arbitrary code on server; works without an iframe | Reducer expressiveness is limited to declared ops |

> **Recommendation:**
> **Ship Model B first** (client postMessage bridge) — it is the smallest,
> safest, and unlocks reactive *UI* immediately. Then add a **constrained Model C**
> for the "must update even when unmounted" case: the manifest declares a
> **declarative reaction** (e.g. "on `clam.withdrawn`, increment
> `storage[give-pool]` by `settings.siphonAmount`"), which core executes via the
> atomic-increment primitive from §6.3a inside the emission transaction. This gets
> the clam-bucket siphon working **server-side and atomically without ever running
> arbitrary plugin code on the server.** Full Model A (arbitrary server-side plugin
> code) is explicitly deferred and may never be needed.

### 7.4 Participating vs. reacting

The issue asks whether handlers can *participate* (alter the withdrawal, e.g. take
the siphon atomically) or only *react*.

- **1.7 answer:** the declarative reaction in Model C **participates in effect** —
  the siphon is applied atomically with the withdrawal via the increment
  primitive — without a plugin being able to *veto or alter the core mutation
  itself*. The withdrawal still happens exactly as core defines it; the plugin
  adds a bounded, declared side effect.
- **Deferred:** letting a plugin change the primary mutation (e.g. reject a
  withdrawal, change its amount) requires synchronous in-transaction plugin code
  (Model A) and a rollback contract. Out of scope for 1.7.

### 7.5 The client bridge concretely

`PluginWidgetWrapper` opens one SSE stream (`GET /api/plugin/v1/events/stream`,
new) for the whole dashboard, filters events against each mounted plugin's
declared `events`, and forwards matching ones into the iframe:

```js
iframe.contentWindow.postMessage(
  { type: 'homeglow:event', event: 'clam.withdrawn', payload },
  window.location.origin      // same-origin target, never "*"
);
```

The plugin listens with `window.addEventListener('message', ...)`, verifying
`origin === window.location.origin`. A small documented JS shim
(`/plugin-sdk/v1.js`, served by the backend) can wrap this so plugins write
`HomeGlow.on('clam.withdrawn', cb)` instead of raw postMessage.

---

## 8. Capability (d): per-plugin declared settings

### 8.1 Problem

The Admin Panel renders a fixed control set. The manifest's `settings[]` array
(see §4.1) lets a plugin declare its own — a typed schema of
`{ key, label, type, default, ... }`.

### 8.2 Storage — household vs. device

The issue notes platform settings like the siphon amount are "probably
household-wide rather than per-device." The current `pluginSettings` blob is
per-device. Design:

- **`scope: "device"`** settings continue to live in
  `devices.device_settings_json → pluginSettings[pluginId]` (existing path).
- **`scope: "household"`** settings (the default for declared settings) live in a
  new global store so every display agrees on the siphon amount. Reuse the
  existing global `settings` KV table with a namespaced key:
  `plugin:<pluginId>:settings` → JSON blob. No new table needed.

### 8.3 API (under the v1 contract)

```
GET  /api/plugin/v1/settings/:pluginId    -> merged { key: value } (defaults <- household <- device overrides)
PUT  /api/plugin/v1/settings/:pluginId    body: { key: value, ... }  (validated against manifest schema, scope-routed)
```

- Values are **validated against the manifest schema** on write (type, min/max),
  rejecting unknown keys — this is the one place plugin input is typed.
- The iframe reads its settings either via this endpoint or via a `settings` field
  the bridge injects at load, mirroring how `theme` is passed today.

### 8.4 Admin Panel rendering

The existing **Plugins** sub-tab (`AdminPanel.jsx`, `widgetsSubTab === 1`) gains,
per manifest plugin, a settings section generated from `manifest.settings[]`:
number/text/toggle/select controls bound to `PUT /api/plugin/v1/settings/:id`.
Legacy widgets show only the existing enabled/transparent/refresh controls,
unchanged. Reuse `AdminFormSection` and the existing control components so the
look matches core settings.

---

## 9. Security & trust model

The current model is **"same-origin iframe, fully trusted, LAN-only, no auth"**
(see [overview](overview.md) security note). The platform must not quietly widen
the blast radius:

- **No arbitrary server-side plugin code in 1.7.** Storage, settings, and reactions
  are all *data and declarations* the backend interprets — never `eval`'d plugin
  JS. This is the single most important constraint and the reason Model A is
  deferred.
- **Namespacing is enforced server-side**, not trusted from the client: storage
  and settings are keyed by a `pluginId` that must exist as an installed manifest
  plugin; one plugin cannot read another's namespace by path alone (and a future
  token model closes the "any same-origin script can hit any namespace" gap).
- **Manifest is validated on upload/install**, bounding what a malformed or
  malicious manifest can declare (event names against the known catalog, setting
  types against the allowed set, size/key caps on storage).
- **postMessage uses an explicit same-origin target**, never `"*"`, and plugins
  verify `event.origin`.
- The **fully-trusted reality is unchanged for 1.7** (any same-origin script can
  still call any API). The platform's job is to add the *seams* — one API
  namespace, declared capabilities in the manifest — where enforcement can later
  be added without another redesign. This is the "off-ramp" the issue asks for.

---

## 10. Data model & migration summary

New/changed persistence, all additive:

| Change | Where | Migration |
| --- | --- | --- |
| `plugin_storage` table (KV per plugin) | `tasks.db` | new schema migration **18** |
| Global household settings | reuse existing `settings` table, key `plugin:<id>:settings` | none (KV reuse) |
| Device-scoped plugin settings | existing `devices.device_settings_json → pluginSettings` | none |
| `manifest`/`pluginId` fields on registry entries | `widgets_registry.json` | none (JSON file, tolerant read) |

> Current latest schema migration is **17** (`schema17-choreTransferSnooze.js`),
> so the storage table lands at **18**. Follow
> [`migrationTemplate.js`](../../server/migrations/migrationTemplate.js) and the
> [Contributing → adding a migration](../guides/contributing.md#adding-a-database-migration)
> steps: register it in the `schemaMigrations` map in `server/index.js`, wrap it
> in a transaction, and write `SYSTEM_SCHEMA_ID` before commit.

---

## 11. New/changed code surface

| Area | File(s) | Change |
| --- | --- | --- |
| Storage table | `server/migrations/schema18-pluginStorage.js` (new) | Create `plugin_storage`. |
| Event bus | `server/services/pluginEvents.js` (new) | In-process emitter + declarative-reaction executor. |
| Emission sites | `server/index.js` clam add/reduce & chore-complete routes | One `pluginEvents.emit(...)` after commit. |
| v1 API | `server/index.js` (or a new `server/routes/pluginV1.js` if the single file is split) | `/api/plugin/v1/storage`, `/settings`, `/events/stream`, curated domain subset. |
| Manifest handling | `server/index.js` upload/install/list widget routes | Parse + validate manifest, extend registry entries. |
| Plugin SDK shim | `server/` static + `client/public` | `/plugin-sdk/v1.js` — `HomeGlow.on/off`, storage/settings helpers. |
| Client bridge | [`PluginWidgetWrapper.jsx`](../../client/src/components/PluginWidgetWrapper.jsx) | SSE subscription + `postMessage` forwarding, filtered by declared events. |
| Admin settings UI | [`AdminPanel.jsx`](../../client/src/components/AdminPanel.jsx) Plugins sub-tab | Render `manifest.settings[]` controls. |
| Docs | `docs/guides/custom-widgets.md`, `server/widgets/README.md`, `docs/reference/backend-api.md` | Document manifest, SDK, v1 contract, events. |

---

## 12. Phasing

Ship in order of dependency and risk; each phase is independently useful.

1. **Phase 1 — Manifest + v1 storage (a, c).** Manifest format, validation,
   registry extension, `plugin_storage` table, `/api/plugin/v1/storage` + atomic
   increment, SDK storage helpers. *Reference use case: buckets persist.*
2. **Phase 2 — Declared settings (d).** Manifest `settings[]`, household/device
   scoping, `/api/plugin/v1/settings`, Admin Panel rendering. *Reference: siphon
   amount is configurable.*
3. **Phase 3 — Events, client delivery (b, Model B).** Event bus, emission sites,
   SSE stream, `PluginWidgetWrapper` bridge, `HomeGlow.on`. *Reference: plugin UI
   reacts live to withdrawals.*
4. **Phase 4 — Declarative server-side reactions (b, Model C + §6.3a).** Manifest
   declares a reaction; core executes the siphon atomically on withdrawal even
   with no iframe mounted. *Reference: siphon is correct and atomic regardless of
   device.*
5. **Deferred / future:** Model A (arbitrary server-side plugin code),
   participating handlers that alter/veto core mutations, and the per-plugin
   permission-token enforcement (#105 mentions as an off-ramp, not a 1.7
   deliverable).

## 13. Open questions

- **Iframe identity / token (§5.4, §9):** for a real permission model, how does
  the backend bind an iframe to *its* `pluginId` so a plugin can't spoof another's
  namespace? Likely a per-plugin token injected at load and required on
  `/api/plugin/v1`. Deferred, but the manifest/namespace shape should not
  foreclose it.
- **Reaction expressiveness (§7.3 Model C):** is "increment a JSON path by a
  settings-derived delta" enough for the plugins we expect, or do we need a small
  declarative expression grammar? Start with increment; revisit with real plugins.
- **GitHub plugin distribution:** the `jherforth/HomeGlowPlugins` install flow
  must learn to fetch and validate the `.plugin.json` alongside the HTML.
- **Event delivery when multiple devices are open:** SSE fan-out is per-connection;
  the declarative reaction (Model C) must run **once** on the server per event, not
  once per connected device — the reaction executor lives at emission, not in the
  bridge.
