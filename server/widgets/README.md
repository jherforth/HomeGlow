# HomeGlow Widget Plugins Directory

This directory stores all uploaded widget HTML files for the HomeGlow app.

## How it works
- When you upload a widget via the Admin Panel, the HTML file is saved here.
- Each widget is a self-contained HTML file (with optional CSS/JS) that will be rendered in a sandboxed iframe in the app.
- The widget registry (`../widgets_registry.json`) keeps track of all uploaded widgets.

## Security
- Only HTML files are allowed.
- Widgets are rendered in sandboxed iframes for isolation and security.

## Manual Management
- You can manually add or remove HTML files here, but it is recommended to use the Admin Panel for consistency.
- If you manually remove a file, also update `widgets_registry.json` to avoid broken entries.

## Example
To test, upload a file like `hello-widget.html` via the Admin Panel, and it will appear here.

---

**Do not delete this README.**
