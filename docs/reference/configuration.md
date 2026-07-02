# Configuration

HomeGlow is configured in two places: **environment variables** (infrastructure,
set at deploy/build time) and the **Admin Panel** (runtime settings stored in the
database). This page covers both.

## Environment variables

### Runtime — backend (`homeglow-backend`)
| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | Port Fastify listens on. |
| `TZ` | `America/New_York` | IANA timezone. Drives the nightly cron job and date math. Set this to your local zone. |
| `DB_PATH` | `server/data/tasks.db` | Override the SQLite file location. |
| `ENCRYPTION_KEY` | _(insecure fallback)_ | 32-byte key used to encrypt stored third-party credentials/tokens. **Set a stable value in production.** Generate with `openssl rand -base64 32`. Changing it invalidates previously stored secrets. |
| `NODE_ENV` | — | `production` / `development`. |
| `HOMEGLOW_DISABLE_BACKGROUND_JOBS` | `0` | Set to `1` to disable the nightly chore-pruning cron (useful in tests). |
| `HOMEGLOW_DISABLE_CALENDAR_SYNC` | `0` | Set to `1` to disable the calendar sync service. |
| `BACKEND_VERSION` / `BACKEND_GIT_COMMIT` / `BACKEND_GITHUB_REPOSITORY` | build metadata | Surfaced by `GET /api/stats`; set by CI. |

If `ENCRYPTION_KEY` is missing or invalid, the server logs a warning at startup and
disables third-party connections (Google, etc.). To regenerate a random key on
restart, delete `server/data/.encryption-key`.

### Runtime — frontend (`homeglow-frontend`, Nginx)
| Variable | Default | Purpose |
| --- | --- | --- |
| `FRONTEND_PORT` | `3000` | Port Nginx serves the SPA on. |
| `BACKEND_SERVICE` | `homeglow-backend` | Hostname of the backend on the Docker network (proxy target). |
| `BACKEND_PORT` | `5000` | Backend port to proxy `/api`, `/uploads`, `/widgets` to. |

### Build-time — frontend (Vite, baked into the bundle)
| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_REACT_APP_API_URL` | same-origin (prod) / `http://localhost:5001` (dev) | API base URL. Empty in prod means "use the current origin" (Nginx proxies `/api`). |
| `VITE_OPENWEATHER_API_KEY` | — | Optional default weather key baked in at build time. |
| `VITE_APP_VERSION`, `VITE_GIT_COMMIT`, `VITE_GITHUB_REPOSITORY` | build metadata | Version display. |

### `.env` for Docker Compose
See [`env.example`](../../env.example). Typical production `.env`:
```env
FRONTEND_PORT=3000
TZ=America/New_York
ENCRYPTION_KEY=<openssl rand -base64 32>
```
Development additionally uses `DEV_FRONTEND_PORT` (3001) and `DEV_BACKEND_PORT` (5001).

## Admin Panel settings (stored in the database)

Open with the gear (⚙️) icon. These persist server-side (global settings in the
`settings` table; per-device UI in `devices`/`tabs`).

| Section | What it configures | Storage |
| --- | --- | --- |
| **APIs** | OpenWeatherMap API key, ICS calendar URL | `settings` (global) |
| **Chores → sounds** | Master enable (`CHORE_SOUND_ENABLED`), default sound (`CHORE_SOUND_DEFAULT`), volume (`CHORE_SOUND_VOLUME`) | `settings` (global) |
| **Widgets** | Enable/disable built-ins, per-widget auto-refresh interval, transparency | `devices.device_settings_json` (per device) |
| **Users** | Family members, avatars, clam adjustments | `users`, `chore_history` |
| **Chores** | Chore definitions, schedules (cron/duration/interval), history | `chores`, `chore_schedules`, `chore_history` |
| **Prizes** | Clam-purchasable rewards | `prizes` |
| **Calendar** | ICS/CalDAV/Google sources, colors, sync intervals | `calendar_sources`, `calendar_sync_status` |
| **Photos** | Immich/Google/upload sources | `photo_sources`, media tables |
| **Connections** | Google OAuth linking | `google_accounts` |
| **Plugins** | Upload/install/enable custom widgets | `server/widgets/`, `widgets_registry.json`, per-device plugin settings |
| **Interface** | Theme mode, gradients, interface colors, screensaver | `localStorage` + `device_settings_json` |
| **Security** | Admin PIN | `admin_pin` |

## Refresh intervals

Widgets support independent auto-refresh (5/15/30 min, 1–6 h). This is a per-widget
device setting; a `CountdownCircle` shows time to next refresh.

## Chore sounds (per device)

Each display can silence chore due-time sounds independently via the 🔔/🔕 button on
the chore widget, stored as `choreWidgetSettings.soundEnabled` in that device's
`device_settings_json`. This is layered under the global master switch — see
[Features → Chore due-time sounds](features.md#chore-due-time-sounds).

## Security notes

- HomeGlow has **no authentication** beyond the optional Admin PIN. Do not expose it
  directly to the internet.
- For HTTPS / a custom domain, put it behind a reverse proxy (Nginx, Traefik,
  Cloudflare Tunnel, etc.) and add your own access control.
- Keep `ENCRYPTION_KEY` secret and stable.
