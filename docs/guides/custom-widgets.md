# Custom Widget Development

HomeGlow supports **custom widgets**: self-contained HTML files that render inside
sandboxed iframes on the dashboard. This is the plugin system — no rebuild of the
app required.

> The authoritative, template-rich guide lives next to the widget code at
> [`server/widgets/README.md`](../../server/widgets/README.md). This page
> summarizes it and explains how widgets fit into the system.

## How custom widgets work

- A widget is a single `.html` file uploaded via **Admin Panel → Plugins** (or
  installed from the `jherforth/HomeGlowPlugins` GitHub repo).
- Uploaded widgets are stored **in the database** (the `plugins` table in
  `tasks.db`) and served at `/widgets/:filename` — so installed plugins survive
  app upgrades along with the rest of your data. (Before schema migration 18 they
  lived on the container filesystem and were wiped on every image update; files
  still on disk are imported once at startup and legacy files are served as a
  read-only fallback.)
- On the dashboard, [`PluginWidgetWrapper.jsx`](../../client/src/components/PluginWidgetWrapper.jsx)
  renders the widget in an `<iframe>` with
  `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`, passing the
  current theme as a query param: `/widgets/myWidget.html?theme=dark`.
- When serving widget HTML, the backend rewrites hardcoded `localhost:PORT`
  references to the current origin and injects an overflow-fix `<style>` so widgets
  size correctly.
- Widgets are enabled per device and can be assigned to tabs like built-in widgets.

## Minimum requirements

1. **Link the app stylesheet** to inherit theme CSS variables:
   ```html
   <link rel="stylesheet" href="/index.css">
   ```
2. **Handle the theme (and optional transparency) query params** on load:
   ```javascript
   document.addEventListener('DOMContentLoaded', () => {
     const params = new URLSearchParams(window.location.search);
     const theme = params.get('theme');
     if (theme === 'dark' || theme === 'light') {
       document.documentElement.setAttribute('data-theme', theme);
     }
     if (params.get('transparent') === 'true') {
       document.body.style.background = 'transparent';
     }
   });
   ```

Theme tokens you can rely on (from `index.css`): `--background`, `--card-bg`,
`--card-border`, `--text-color`, `--accent`, and the gradient variables. Text
colors: light `#333`, dark `#a6a6d1`. A full template is in the
[widgets README](../../server/widgets/README.md#-complete-widget-template).

## Development workflow

1. Write your HTML file (start from the template).
2. Test locally in a browser with `?theme=dark` / `?theme=light`.
3. Upload via **Admin Panel → Plugins → Upload Widget**.
4. Enable it and assign it to a tab.
5. Verify transparency and both themes.

## Calling APIs from a widget

Because widgets are sandboxed and same-origin, they can call HomeGlow's backend —
including the generic CORS proxy at `GET /api/proxy` for reaching external services
that lack CORS headers. Keep widgets lightweight and avoid external CDN dependencies
where possible.

## Platform plugins: manifest + server-side storage

Plain HTML widgets need none of this — everything below is opt-in
(issue #105; design details in
[Plugin Platform](../architecture/plugin-platform.md)).

> The full author guide — including **reactions** (server-side logic that runs
> even when your widget isn't mounted) and a complete worked example — is
> [Plugin Development](plugin-development.md). This section is the short
> version.

A widget can embed a **manifest** to become a platform plugin with its own
server-side storage namespace:

```html
<script type="application/json" id="homeglow-manifest">
{
  "manifestVersion": 1,
  "id": "my-plugin",
  "name": "My Plugin",
  "apiVersion": "v1",
  "storage": true
}
</script>
```

- `id` must be a unique lowercase slug (`a-z`, `0-9`, hyphens). An invalid
  manifest rejects the upload with the validation errors; a duplicate `id` is a
  409.
- With `"storage": true`, the plugin gets a namespaced key/value store that
  survives reloads, devices, and app upgrades (64 KB per value, 500 keys).

Load the SDK and use it:

```html
<script src="/plugin-sdk/v1.js"></script>
<script>
  async function main() {
    // HomeGlow.pluginId is set automatically for manifest plugins.
    await HomeGlow.storage.set('buckets:user:3', { spend: 10, save: 5, give: 0 });
    const buckets = await HomeGlow.storage.get('buckets:user:3');   // null if missing
    const all = await HomeGlow.storage.list();
    await HomeGlow.storage.remove('buckets:user:3');

    // Atomic counter — safe under concurrent writes:
    const { result } = await HomeGlow.storage.increment('give-pool', 'total', 2);
  }
  main();
</script>
```

The raw endpoints live under `/api/plugin/v1/storage/:pluginId/...` if you prefer
`fetch` directly.

### Declared settings

A plugin can declare settings in its manifest; the Admin Panel renders them in a
**Plugin Options** section of the plugin's card, and the plugin reads the
effective values through the SDK:

```json
"settings": [
  { "key": "siphonAmount", "label": "Give-bucket siphon", "type": "number",
    "default": 2, "min": 0 },
  { "key": "mode", "label": "Mode", "type": "select",
    "options": ["spend", "save", "give"], "default": "save" },
  { "key": "compact", "label": "Compact view", "type": "boolean",
    "default": false, "scope": "device" }
]
```

- Types: `number` (optional `min`/`max`), `string`, `boolean`, `select`
  (requires `options`).
- `scope` is `"household"` by default — the value is shared by every display.
  `"device"` values are per-display.

```javascript
const settings = await HomeGlow.settings.get();   // { siphonAmount: 2, mode: "save", compact: false }
await HomeGlow.settings.set({ siphonAmount: 3 }); // validated against the manifest schema
```

### Core events

Declare the events your plugin cares about in the manifest — names are validated
against the catalog at install time:

```json
"events": ["clam.withdrawn", "clam.deposited", "chore.completed"]
```

While the widget is visible on a display, the dashboard streams those events into
the iframe and the SDK dispatches them:

```javascript
const off = HomeGlow.on('clam.withdrawn', (payload) => {
  // payload: { userId, amount, newTotal }
  refreshBuckets();
});
// later: off();  (or HomeGlow.off('clam.withdrawn', handler))
```

Current catalog: `clam.deposited` / `clam.withdrawn`
(`{ userId, amount, newTotal }`) and `chore.completed` / `chore.uncompleted`
(`{ userId, choreId, scheduleId, clamValue, date }`). Only events named in your
manifest are delivered. Events are live UI signals — they fire only while your
widget is mounted, so keep durable state in plugin storage (server-side
reactions that run without a mounted widget are issue #105 Phase 4).

## Debugging

- Browser console inside the iframe shows widget JS errors.
- **Admin Panel → Plugins → Debug** and `GET /api/widgets/debug` list the
  installed plugins in the DB store (plus any legacy on-disk files and the old
  registry, for troubleshooting migrations).
- Toggle the theme param in the URL to check theming.
