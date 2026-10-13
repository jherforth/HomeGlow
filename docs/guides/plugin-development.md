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
    /* No body background: the dashboard's frame draws it, rounded and at
       the household's card opacity, and clears the page's own. */
    body {
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
      // Theme comes in on the URL.
      const params = new URLSearchParams(window.location.search);
      const theme = params.get('theme');
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute('data-theme', theme);
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

Install it via **Admin Panel → Dashboard → Plugins → Upload Widget**, enable it,
assign it to a tab. Test both themes with `?theme=dark` / `?theme=light` while
developing. For external services without CORS headers, use the proxy:
`GET /api/proxy?url=...`.

> **Which endpoints can I call?** See the [API reference](#10-api-reference)
> (§10) for the data endpoints a plugin commonly reads and the stable plugin
> platform API.

Widgets are stored in HomeGlow's database, so they (and everything below)
survive app upgrades.

### Theme colors arrive by message

`/index.css` gives you the variable names and their defaults, but the household's
picked interface colors are applied by the dashboard at runtime, and your widget
is a separate document. So the dashboard also posts them into your iframe, on
every load and on every change:

```js
{ type: 'homeglow:theme', theme: 'dark', colors: { primary, secondary, accent, accentRgb } }
```

If you load the SDK, there is nothing to do: it writes `--primary`, `--secondary`,
`--accent` and `--accent-rgb` onto your root and sets `data-theme`, so CSS that
reads `var(--accent, #757575)` follows the pick. Keep the fallback; it is what a
direct load of the file gets. For canvas drawing or anything that needs the
value in JavaScript, `HomeGlow.theme` holds the last message and
`HomeGlow.onTheme(handler)` calls you now and on every change. The `?theme=`
param is still on the URL, so a widget without the SDK starts in the right theme
and only misses the colors.

### Theme roles: text, shapes, type and meters

Version 2 of the message also carries the theme's **role tokens** and its fonts,
so a plugin can look native under any theme, not only take its accent:

```js
{ type: 'homeglow:theme', version: 2, theme, colors, tokens: { '--text': '#ffcc99', ... }, fonts: [ ... ] }
```

The SDK writes each token onto your root, so plugin CSS just uses them:

| Role | Tokens |
| --- | --- |
| Surfaces and text | `--background`, `--surface`, `--card-bg`, `--text`, `--text-secondary`, `--border` |
| Status | `--success`, `--warning`, `--hg-error` |
| Shape | `--hg-radius-sm`, `--hg-radius-md`, `--hg-radius-lg` |
| Type | `--hg-font-body`, `--hg-font-heading`, `--hg-heading-transform`, `--hg-heading-letter-spacing` |
| Meters (progress, levels, gauges) | `--hg-meter-track`, `--hg-meter-fill`, `--hg-meter-thickness`, `--hg-meter-cap` |
| Buttons | `--hg-button-bg`, `--hg-button-text`, `--hg-button-radius`, `--hg-button-weight`, `--hg-button-quiet-border` |

```css
body { color: var(--text); font-family: var(--hg-font-body, system-ui); }
.card { background: var(--card-bg); border-radius: var(--hg-radius-md, 8px); }
.ring-fill { stroke: var(--hg-meter-fill); stroke-width: var(--hg-meter-thickness, 3px); stroke-linecap: var(--hg-meter-cap, round); }
.save {
  background: var(--hg-button-bg, var(--accent)); color: var(--hg-button-text, #fff);
  border-radius: var(--hg-button-radius, 8px); font-weight: var(--hg-button-weight, 600);
  font-family: var(--hg-font-heading, inherit); text-transform: var(--hg-heading-transform, none);
}
```

- **Roles, not looks.** Each name says what a thing does. A theme decides how it
  looks: Starship's meters can be flat orange bars and another theme's a thick
  glowing ring, and the same plugin CSS draws both. The list only grows; names
  are never renamed or removed.
- **Fonts load for you.** When a theme brings its own fonts, the SDK registers
  them in your document, so `var(--hg-font-body)` renders in the theme's face.
  A font downloads only if your text uses it.
- **Frames are the dashboard's.** Your widget sits inside the theme's frame,
  and the dashboard keeps your content clear of any frame decoration. Don't
  draw a frame of your own. The frame also draws the background, rounded and at
  the household's card opacity, or none when the widget is set transparent, so
  the page's own `body` background is cleared. A widget with a palette of its
  own, such as a team's colors, paints it on a full-size wrapper element instead.
- **Keep fallbacks** (`var(--text, #e8e8e8)`), for a direct load of the file and
  for dashboards older than version 2. `HomeGlow.theme.tokens` has the values in
  JavaScript.

## 2. Becoming a platform plugin: the manifest

Embed a manifest as a JSON script block anywhere in your HTML (conventionally in
`<head>`):

```html
<script type="application/json" id="homeglow-manifest">
{
  "manifestVersion": 1,
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "One sentence on what this does, shown in the plugin list.",
  "author": "Your name or GitHub handle",
  "category": "family-hub",
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
| `description` | — | One sentence on what the plugin does, shown under its name in the Admin Panel and in the browse list. Max 300 characters — it is a card subtitle, not a README. Worth writing: without it the list shows only a filename. |
| `author` | — | Who wrote the plugin, shown as "by …" beside its name in the Admin Panel and the browse list. Max 80 characters. Without it no author is shown, except on the plugins that shipped before v1.6, which are credited to HomeGlow. |
| `version` | — | The plugin's version, shown beside its name in the Admin Panel and the plugin list: `major.minor.patch` by convention, any string up to 32 characters accepted. Raise it with every change (`1.0.1` for a fix, `1.1.0` for something new, `2.0.0` for a change that drops a setting or needs a newer HomeGlow). The list says **Up to date** or **Update to …** by comparing the installed file with the repository's itself (its git sha), so an update shows even when the version wasn't raised; the version tells people what they are getting. The plugins in HomeGlowPlugins all started at `1.0.0` (issue #273). |
| `category` | — | The heading the plugin store lists it under: `clock-calendar`, `news-weather`, `chores-rewards`, `family-hub`, `meals`, `household`, `health` or `games`. Without one, or with a value not on that list, it is listed under **Other**. |
| `apiVersion` | — | `"v1"` — the API contract you target. |
| `storage` | — | `true` to use the storage API. Without it, storage calls are 403. |
| `settings` | — | Declared settings the Admin Panel renders (see §4). |
| `events` | — | Core events to receive while mounted (see §5). |
| `reactions` | — | Server-side increments run on events (see §6). Requires `storage: true`. |
| `hideableControls` | — | Controls a display may be configured to hide (see §4). |
| `homeAssistant` | — | `{ "entities": [...], "control": true }`: the Home Assistant entities the plugin may read and operate (see §5a). |

Keys not listed here are **ignored**, not rejected — so a misspelled field fails
silently rather than loudly.

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

### Control limits — let a display hide your management controls

A wall display in the kitchen shouldn't offer your Edit and Delete buttons. Declare
which controls can be hidden and the Admin Panel makes them per-display switches.
**You do the hiding** — HomeGlow can't reach into your iframe. Household-facing
behavior is in the [Control Limits guide](control-limits.md).

```json
"hideableControls": [
  { "id": "editPoll", "label": "Create and edit polls" }
]
```

```js
// At parse time, not in DOMContentLoaded — later than that and the control
// paints before you remove it, flashing on every iframe reload.
const hidden = (new URLSearchParams(location.search).get('hide') || '')
  .split(',').filter(Boolean);

if (!hidden.includes('editPoll')) renderEditButton();
```

Literal markup is fine too — remove the nodes instead of skipping a call.

#### Rules

- **Ids are unprefixed, camelCase, and permanent.** `hide` names only your own
  controls. `edit_poll` and `EditPoll` are rejected outright, and upload doesn't
  validate it, so a typo fails silently. Ids are stored verbatim in every display's
  settings, so renaming one orphans their configuration — same rule as `manifest.id`.
- **Check nothing else references a node you removed.** Enable/disable, focus or
  label code doing `getElementById` on a hidden control will throw, and an exception
  mid-render can blank the widget. This is the one way adopting this breaks a plugin.
- **Fail open.** No `hide` param means hide nothing, so an older dashboard and a
  direct load both still work.
- **Declaring a control means a wall display hides it.** Don't declare what should
  always be visible; undeclared controls can never be hidden. A control reachable
  only *through* another needs no id of its own — hide the gate, and block entering
  that mode, not just its button.
- **Drop the container when nothing visible is left in it**, or you ship empty
  padding and headings floating over nothing.
- **`label` is optional** (falls back to the id) and **is not translated**, even
  though `lang` lets you localize the rest of your widget.
- **Not security.** The API has no per-device auth. Don't gate anything that matters
  on this.

#### Two things that will cost you time

**Retrofitting changes behavior on upgrade.** `hideAll` covers controls that didn't
exist when it was set, so the moment your update installs, every display already set
to Wall display loses your newly declared controls with nobody touching a setting.
Usually desirable — worth a line in your release notes.

**If hiding seems to do nothing, check whether that display remembers the admin
PIN.** Such displays are exempt and get an empty hide list whatever is configured, so
your code is probably fine. Clear it with Admin → Security → "Require PIN on all
devices again".

#### Testing

Append the param yourself — `/widgets/YourPlugin.html?hide=editPoll` — the cheapest
honest test of your hiding logic. Note a direct load isn't sandboxed, so `confirm()`,
`prompt()` and `alert()` work there and won't work embedded. Then try it in the
dashboard, and **test the all-hidden case**: it's where empty containers show up and
the state you're least likely to try.

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
| `chore.allCompleted` | a user's last **regular** chore for the day is done | `{ userId, username, date, reward }` |
| `prize.redeemed` | a prize-store request is approved | `{ userId, prizeId, offerId, prizeName, cost, newTotal }` |
| `ha.state` | Home Assistant entities changed | `{ entityIds }`: a nudge to read state again (§5a), never the state itself |

Declaring an event not in the catalog rejects the install — typos fail loudly.
Only declared events are ever delivered to your iframe.

**On `chore.allCompleted`:** it fires alongside the daily-completion bonus, so it
inherits that behaviour exactly — once per user per day, from whichever route
emptied their list (completing the last chore, receiving a transfer, or snoozing
one out of today). Undoing the last chore revokes the bonus, so redoing it fires
again. Bonus chores (`clam_value > 0`) are outside the regular set and never
trigger it.

It is always emitted regardless of the household's celebration setting — that
toggle is a display preference applied client-side, so your plugin still sees the
signal. And it is emitted **after** the `chore.completed` for the chore that
finished the list, so a counter incremented on `chore.completed` is already
correct by the time `chore.allCompleted` arrives.

**Important:** events fire in your widget only while it is mounted. They are
live UI signals, not a durable feed — anything that must not be missed belongs
in a **reaction** (next section) and durable state in **storage**.

### Telling the host you changed core data

Events flow HomeGlow → your plugin. This is the one signal that flows back.

If your plugin writes core data through the REST API — completing a chore,
adding clams — the host widgets showing that same data do not know. A chore your
plugin just completed keeps rendering as undone until the chore widget's own
refresh timer fires, which is **off by default** and five minutes at its
shortest.

Post one message to the parent window after the write lands:

```js
window.parent.postMessage({ type: 'homeglow:data-changed', scope: 'chores' }, '*');
```

HomeGlow re-broadcasts it to any widget listening for that scope, and the chore
widget refetches. Valid scopes are `chores`, `users`, `calendar` and `prizes`;
an unknown scope is dropped rather than waking every refetch in the app.

Three things worth knowing:

- **It is safe to send unconditionally.** A HomeGlow that predates this channel
  ignores the message, as does a plugin page opened outside an iframe.
- **It only refreshes the display it was sent from.** postMessage is
  same-page, so a second wall display still waits for its own timer. This is
  deliberate: the alternative is the SSE event stream, which does not reach the
  browser on every deployment.
- **It is a hint, not a write.** The host only refetches. It grants no
  permission you did not already have by calling the API.

### Asking for a celebration

When something in your plugin is worth marking (a child finished a routine, a
poll closed), ask the board for its celebration, the same one the chore widget
plays when someone finishes their day:

```js
if (typeof HomeGlow.celebrate === 'function') HomeGlow.celebrate();
```

The board throws the active theme's confetti across the whole screen, and the
theme's cast if it has one (a few of its own pictures crossing once). It is
the household's to control, not yours:

- **It may do nothing.** HomeGlow plays at most one per plugin every 15
  seconds, none while one is already playing, and none when the household has
  turned celebrations off in Admin. Nothing plays for people who ask their
  system for reduced motion.
- **Check for it first.** A HomeGlow older than the call has no `celebrate`.
- **Keep it for real moments.** Every tick of a checkbox is not one.

## 5a. Home Assistant — read and operate devices

Admin → Dashboard → Home Assistant builds panels without code. A plugin that
needs more can read and operate Home Assistant entities itself, under the same
rules. Declare them:

```json
"homeAssistant": { "entities": ["light.porch", "sensor.porch_temperature"], "control": true },
"events": ["ha.state"]
```

```js
const { entities, control, unit } = await HomeGlow.homeAssistant.state();
await HomeGlow.homeAssistant.action('light.porch', 'brightness', 60);
HomeGlow.on('ha.state', ({ entityIds }) => refresh());   // a nudge; read state again
```

- **HomeGlow keeps the token.** Your plugin never sees it, and nothing it does
  reaches Home Assistant except through these calls.
- **Only your entities, only fitting actions.** `state()` returns your declared
  entities, with only the attributes a tile would use. `action()` accepts only
  the actions that fit each kind of entity (`toggle`, `turn_on`, `turn_off`,
  `brightness` 0–100, `color_temp`, `percentage`, `open`, `close`, `stop`,
  `position`, `run`, `temperature`, `hvac_mode`, `play_pause`, `next`,
  `previous`, `volume`, `lock`, `unlock`, `arm_home`, `arm_away`, `disarm`,
  `start`, `pause`, `dock`, `select`, `set`), with values clamped to the
  entity's own range. `"control": false` makes it read only. The kinds and
  their actions are `DOMAINS` in `server/services/haPanels.js`.
- **Unlocking, disarming and opening a garage door** may need the household PIN:
  `action()` then rejects with `error.status === 401` and `error.needsPin`, and
  you call it again with `{ pin }`. Displays that remember the admin PIN are
  never asked, and the household can turn PIN protection off.
- **Poll `state()` every couple of seconds while you're visible.** HomeGlow
  answers from its own live copy, so it costs Home Assistant nothing.
- **Cameras:** `HomeGlow.homeAssistant.cameraUrl('camera.porch')` is the address
  of a declared camera's latest snapshot, for an `<img>`.

### Whole domains

A plugin published for every household can't list their entity ids. It can
be granted a domain whole instead, and `state()` then lists every entity there:

```json
"homeAssistant": { "domains": ["media_player"] }
```

Any domain a panel can show may be granted, except the ones that open up or
watch the home: `lock`, `alarm_control_panel`, `cover` (garage doors) and
`camera` must be listed entity by entity. `entities` and `domains` can be used
together, and `"control": false` makes both read only.

Entities the household has hidden or disabled in Home Assistant aren't listed
from a domain. `state()` also says where each entity comes from, in
`sources`: `{ integration, device }`, where `integration` is Home Assistant's
name for it (`music_assistant`, `cast`, `sonos`, `dlna_dmr` ...) and `device`
is a tag that is the same for every entity of one device. One speaker often
appears several times (Music Assistant's entity beside its Cast and DLNA ones);
these tell them apart. A source is `null` when Home Assistant has no registry
entry for the entity, or its registry can't be read.

### Music: a speaker's library

For a media player the plugin may operate, HomeGlow opens the player's own
library through Home Assistant: whatever it offers, from Music Assistant
(Spotify, YouTube Music, Jellyfin, local files…) to Sonos, Plex or Home
Assistant's media sources.

```js
const top = await HomeGlow.homeAssistant.media.browse('media_player.kitchen');
const level = await HomeGlow.homeAssistant.media.browse('media_player.kitchen', top.items[0].key);
const found = await HomeGlow.homeAssistant.media.search('media_player.kitchen', 'neil young');
await HomeGlow.homeAssistant.action('media_player.kitchen', 'play_media', found.items[0].key);
img.src = HomeGlow.homeAssistant.media.artUrl('media_player.kitchen', state.attributes.media_art);
```

- Items are `{ key, title, kind, canPlay, canOpen, thumb }`. **`play_media` takes a
  key**, never a content id: a plugin plays only what HomeGlow showed it. A key
  can go stale (after a restart): the call answers `410` with `stale: true`; open
  the list again.
- `search` remembers the query: `media.recent(entity)` lists the last eight,
  `media.clearRecent(entity)` forgets them.
- Other media actions: `seek` (seconds), `shuffle` (true or false). The state
  also carries `media_album_name`, `media_duration`, `media_position`,
  `media_position_updated_at` and `media_art`, a tag that changes with the
  picture (the picture's own address carries a token and is never sent).
- Speakers that play in step (Home Assistant's grouping: Music Assistant,
  Sonos ...): `action(leader, 'join', [otherIds])` adds speakers to the leader's
  group, `action(member, 'unjoin')` takes one out. Each must be a speaker the
  plugin may operate, up to 8. The state carries `group_members`, the leader
  first; a speaker that can be grouped reports feature 524288.
- A slow speaker (finding a song online, then buffering) answers
  `{ ok: true, pending: true }` after 1.5 seconds; watch `state()` for the change.

### Your own media server

A plugin that brings music from a server of its own (a Jellyfin server, say)
can play it on a Home Assistant speaker with `play_url`. The address must be on
the server the household named in one of the plugin's household settings, which
the manifest points to; anything else is refused.

```json
"settings": [{ "key": "jellyfinUrl", "label": "Jellyfin address", "type": "string", "default": "" }],
"homeAssistant": { "domains": ["media_player"], "playUrlsFrom": "jellyfinUrl" }
```

```js
await HomeGlow.homeAssistant.action('media_player.kitchen', 'play_url', { url: streamUrl });
await HomeGlow.homeAssistant.action('media_player.kitchen', 'play_url', { url: nextUrl, enqueue: 'add' });
```

The address must have the same scheme, host and port as the setting, and sit
under its path. `enqueue` is `replace` (the default), `add`, `next` or `play`,
for a player that can queue.
`title`, `artist`, `album` and `image` (a cover, on the same server) tell a speaker
that shows it what is playing; otherwise all it knows is the address.
A speaker that gives such an address as `media_title` has it passed on without
its query, so a sign-in in the address (Jellyfin's `api_key`) stays out of
every panel and plugin.

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
    body { color: var(--text-color);
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
2. Upload via **Admin Panel → Dashboard → Plugins**. Re-uploading the same
   filename replaces the content in place (manifest re-validated each time).
3. Enable it, assign it to a tab, check both themes + transparency, with the
   computer in light mode and in dark mode (see `color-scheme` below).
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
- **Know what `color-scheme` does before declaring it.** It doesn't choose your
  colors; it picks the browser's built-in ones (form controls, scrollbars, the
  backdrop behind your page). The dashboard declares none, and when your scheme
  differs, the browser paints that backdrop opaque. With `color-scheme: light
  dark`, a computer in dark mode shows your widget as a black tile under a light
  theme, with the theme's dark text on it. If you follow the theme, leave it
  out. If you paint your own full background anyway, it does no harm.
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
| `GET` | `/api/plugin/v1/ha/:pluginId/state` | → `{ entities, control, live, unit, pinProtection, error? }` (§5a) |
| `POST` | `/api/plugin/v1/ha/:pluginId/action` | body: `{ entity` or `entities, action, value?, pin?, device? }` → `{ ok, entities }`; `401 { needsPin }`, `403` outside your list, `429` over 10 a second |
| `GET` | `/api/plugin/v1/ha/:pluginId/camera/:entityId` | → a declared camera's snapshot image |

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
| `POST` | `/api/users/:id/clams/reduce` | body: `{ amount, kind? }` → `{ success, clam_total }` (`400` if insufficient) — records a **negative `spent` history row** (non-destructive; `kind: 'adjustment'` marks corrections) — emits `clam.withdrawn` |

**Chore history** — the clam ledger. Every row carries a **`kind`**:
`completion` (a chore done), `daily_bonus` (all regular chores done that day —
consecutive dates = streaks), `transfer_bonus`, `adjustment`, `missed` (logged
nightly for due-but-uncompleted regular chores, `clam_value` 0), or `spent`
(negative `clam_value`). Completion rate = completions / (completions + missed);
earned = sum of positive values; spent = −sum of `spent` rows.

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/chore-history?user_id=&date=&date_from=&date_to=` | → history rows incl. `kind` (all filters optional) |
| `GET` | `/api/chore-history/user/:userId` | → all rows for a user |
| `GET` | `/api/chore-history/summary/:userId` | → `{ user_id, clam_total }` |
| `GET` | `/api/chore-history/recent?days=7` | → `[{ id, date, clam_value, title, kind, created_at, username }]` (nonzero entries) |

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
| `GET` | `/api/settings` | → `{ KEY: value, ... }` (global app settings). `?keys=KEY,PREFIX_*` narrows it (`*` wildcards, comma-separated); no `keys` returns everything |
| `POST` | `/api/settings/search` | body: `["KEY", "PREFIX_*"]` → matching settings object (`*` wildcards). Still supported; prefer the `GET` above for new plugins |
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
