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
- Uploaded files are stored in `server/widgets/` and tracked in
  `widgets_registry.json`. They are served at `/widgets/:filename`.
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

## Debugging

- Browser console inside the iframe shows widget JS errors.
- **Admin Panel → Plugins → Debug** and `GET /api/widgets/debug` list the files on
  disk and the registry contents.
- Toggle the theme param in the URL to check theming.
