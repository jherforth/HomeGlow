# Frontend Reference

The frontend is a **React 19 + Vite 8** single-page app in `client/`. It renders a
customizable, touch-friendly dashboard of widgets and an Admin Panel for
configuration. UI is built with **Material UI v9**; theming is driven by CSS
custom properties.

## Entry & routing

- [`client/src/main.jsx`](../../client/src/main.jsx) — bootstraps React, runs
  `initTimezone()` first, then does **path-based routing** (no React Router):
  `/photos` → `PhotosUpload`, everything else → `App`.
- [`client/src/app.jsx`](../../client/src/app.jsx) — the root dashboard component
  (the real application shell). Holds most top-level state and orchestration.
- [`client/src/index.css`](../../client/src/index.css) — global styles and the CSS
  variables (`--background`, `--card-bg`, `--accent`, gradients, etc.) that
  implement light/dark theming and are also shared with custom widgets.

> `pages/Dashboard.jsx` is an **older/standalone** dashboard implementation not
> used by the main app flow (`app.jsx` supersedes it). Treat it as legacy.

## Top-level state & data flow (`app.jsx`)

`App` owns the dashboard's configuration and fetches it on mount:

- **Device identity**: `getDeviceApiBase()` builds `/api/devices/:deviceName/...`
  from the `localStorage` UUID ([`utils/deviceName.js`](../../client/src/utils/deviceName.js)).
- **On boot** it (in order): migrates any legacy localStorage settings to the
  server, fetches device settings, then fetches tabs, widget assignments,
  installed plugins, and global API keys.
- **Theme**: `theme` (light/dark) and `themeMode` (light/dark/**auto**). Auto mode
  uses OpenWeatherMap sunrise/sunset for the configured location. Preferences
  persist in `localStorage` and apply via `data-theme` + CSS variables.
- **Widgets**: a memoized `widgets` array is built from enabled widget settings +
  which widgets are assigned to the active tab, then handed to `WidgetContainer`.
  Built-in widgets and plugins are all **lazy-loaded** (`React.lazy`) and warmed
  during idle time (respecting slow-connection / data-saver hints).
- **Screensaver**: an inactivity timer (config in `screensaverSettings`) triggers
  a `ScreenSaver` overlay (tab-cycling or photo slideshow), optionally full-screen.
- **Settings changes** propagate through custom window events
  (`homeglow:device-settings-updated`, `homeglow:interface-settings-updated`).

## Component map (`client/src/components/`)

### Layout & chrome
| Component | Role |
| --- | --- |
| `WidgetContainer.jsx` | The responsive 12-column grid (`react-grid-layout`); drag/resize, layout persistence to the backend, lock/unlock. |
| `DraggableWidget.jsx` | Individual widget frame with edge +/- resize controls and touch/mouse support. |
| `TabBar.jsx` | Floating bottom dock: tab switching, add/delete tab, theme toggle, lock toggle, settings, refresh. |
| `TabIconModal.jsx` | Modal for creating/labelling a tab and picking its icon. |
| `ScreenSaver.jsx` / `ScreensaverCountdown.jsx` | Burn-in-prevention overlay and its countdown indicator. |

### Built-in widgets
| Component | Role |
| --- | --- |
| `CalendarWidget.jsx` (largest) | Month/week calendar via `react-big-calendar`; multi-source, multi-day & all-day events; reads cached events from the backend. |
| `WeatherWidget.jsx` | Current conditions + 3-day forecast with temperature/precipitation graphs (`recharts`); talks to OpenWeatherMap. |
| `ChoreWidget.jsx` | Per-user daily chores, swipe-to-complete, clam progress and rewards. |
| `PhotoWidget.jsx` | Slideshow from configured photo sources (Immich, Google Photos, uploads). |
| `PluginWidgetWrapper.jsx` | Renders a custom/plugin widget in a sandboxed `<iframe>` served from `/widgets/:filename`, passing the theme via query param. |
| `MonthDayCell.jsx` | Custom day cell renderer for the calendar. |
| `CountdownCircle.jsx` | Circular refresh countdown used by widgets with auto-refresh. |

### Admin & configuration
| Component | Role |
| --- | --- |
| `AdminPanel.jsx` (largest file) | The settings hub: APIs, widget enable/refresh, users, chores, prizes, calendar & photo sources, plugins, interface colors, screensaver. |
| `ChoreSchedulesTab.jsx` | Manage chores and their recurring schedules (cron/duration/interval). |
| `ChoreHistoryTab.jsx` | View/delete recent chore completions. |
| `GoogleAccountConnection.jsx` | Google OAuth linking UI (calendar/photos). |
| `PinModal.jsx` | On-screen + keyboard PIN entry for Admin Panel lock. |
| `ColorPickerPopover.jsx` | Reusable color picker (`react-color`) for theme/gradient/source colors. |
| `ExampleWidgetUsage.jsx` | Reference/demo component for widget authors. |

### Pages (`client/src/pages/`)
| Page | Role |
| --- | --- |
| `PhotosUpload.jsx` | Standalone `/photos` upload page (e.g. from a phone) that adds images to a HomeGlow photo source. |
| `Dashboard.jsx` | Legacy dashboard (not in the active route path). |

## Utilities (`client/src/utils/`)

| Module | Role |
| --- | --- |
| `apiConfig.js` | Resolves `API_BASE_URL` (dev: `VITE_REACT_APP_API_URL` or `localhost:5001`; prod: same-origin). |
| `deviceName.js` | Generate/read/persist the per-device UUID and build the device API base. |
| `timezone.js` | Fetch and cache the server timezone (`initTimezone`, `getServerTimezoneSync`) so client date math matches the backend. |
| `choreHelpers.js` | Cron/day-of-week helpers, "should this chore show today", today's date string in server TZ. |
| `colorContrast.js` | Contrast calculations for readable text on colored backgrounds. |

Each of these has a matching `*.test.js` (Vitest).

## Build & test

```bash
cd client
npm run dev            # Vite dev server (hot reload)
npm run build          # production build -> dist/
npm run preview        # preview the production build
npm test               # Vitest (run once)
npm run test:watch
npm run test:coverage
```

The production build is served by Nginx (see [`client/Dockerfile`](../../client/Dockerfile)
and [`client/nginx.conf`](../../client/nginx.conf)). Vite build-time variables
(`VITE_APP_VERSION`, `VITE_GIT_COMMIT`, `VITE_GITHUB_REPOSITORY`,
`VITE_OPENWEATHER_API_KEY`, `VITE_REACT_APP_API_URL`) are injected as Docker build
args.
