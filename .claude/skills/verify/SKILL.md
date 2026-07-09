---
name: verify
description: Build, launch, and drive HomeGlow locally to verify client/server changes end-to-end.
---

# Verifying HomeGlow changes

## Launch (demo mode gives instant sample data)

```bash
# API server — demo mode auto-seeds chores + calendar for each new device
cd server && PORT=5001 DEMO_MODE=true node index.js &

# Client dev server (client/ expects the API at localhost:5001 in dev mode)
cd client && npx vite --port 3012 --strictPort &
```

Gotchas:
- Ports 3001/3005 are often already taken by the user's own dev servers on
  this machine — pick an unused port, never kill existing node processes.
- Each browser profile is a fresh "device" (`homeglow_device_name` in
  localStorage). Demo seeding only happens for first-run devices: if you
  intercept `GET /api/devices/*/settings` and inject `widgetSettings` into an
  empty response, the app thinks it's configured and never seeds.

## Drive (Playwright + system Edge, no browser download)

`npm i playwright-core` in the scratchpad, then
`chromium.launch({ channel: 'msedge', headless: true })`.

Useful handles:
- Widgets: `.widget-wrapper`; refresh ring: `button[aria-label="Refresh widget now"]`.
- Shrink widget refresh intervals by rewriting `GET /api/devices/*/settings`
  responses (only when `widgetSettings` already exists — see gotcha above).
- Simulate tab hide/show: `Object.defineProperty(document,'visibilityState',...)`
  plus dispatching `visibilitychange`.
- Screensaver: seed localStorage `screensaverSettings`
  (`{enabled,mode:'photos'|'tabs',timeout(minutes, fractions ok),slideshowInterval}`)
  before load; exit by clicking the overlay.
- Track data churn with `page.on('request')` filtered to `localhost:5001`.

- Chore cards (`.chore-card`, `[data-schedule-id]`) have a long-press/right-click
  context menu; `locator.click({ button: 'right' })` opens it. Long-press via CDP
  `Input.dispatchTouchEvent` (context needs `hasTouch: true`), hold ~900ms.
  PIN-gated flows need a non-demo server (file `DB_PATH`) with a PIN set via
  `POST /api/admin-pin/set`; PinModal accepts keyboard digits + Enter.

## Worth driving

- Widget auto-refresh cadence and the countdown ring (in-place, no remount:
  tag DOM nodes with a marker property and confirm they survive a refresh).
- Hidden page / photos-mode screensaver must stop all widget fetches; on
  resume an overdue widget fetches exactly once (catch-up).
- Client unit tests: `cd client && npm test` (vitest). Server: `cd server && npm test`.
