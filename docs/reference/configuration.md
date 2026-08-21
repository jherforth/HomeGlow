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
| `ENCRYPTION_KEY` | _auto-generated_ | **Optional.** Key used to encrypt stored third-party credentials. If unset, one is generated on first start — see below. Set it only to supply your own key or share one across instances; must decode to 32 bytes (`openssl rand -base64 32`). Changing it after credentials are stored invalidates them. |
| `NODE_ENV` | — | `production` / `development`. |
| `HOMEGLOW_DISABLE_BACKGROUND_JOBS` | `0` | Set to `1` to disable the nightly chore-pruning cron (useful in tests). |
| `HOMEGLOW_DISABLE_CALENDAR_SYNC` | `0` | Set to `1` to disable the calendar sync service. |
| `DEMO_MODE` | `false` | Set to `true` to run a **public demo instance**: in-memory DB (wiped on stop), admin PIN disabled, sample data seeded and reset every 6h (incl. live demo calendar feeds and a static weather snapshot), and abuse-prone routes (uploads, CORS proxy, OAuth, calendar source management) return 403 — calendar sync only ever fetches the seeded demo feeds. See the [Demo Mode](../guides/demo-mode.md) guide. |
| `BACKEND_VERSION` / `BACKEND_GIT_COMMIT` / `BACKEND_GITHUB_REPOSITORY` | build metadata | Surfaced by `GET /api/stats`; set by CI. |

### Encryption key — you do not need to set one

Stored third-party credentials — the Google OAuth client secret and tokens, the
Home Assistant access token, and calendar and photo source passwords, API keys
and refresh tokens — are encrypted with AES-256-GCM.

**No configuration is required.** On first start the server generates a random
32-byte key and writes it to `server/data/.encryption-key` with mode `0600`.
That path is inside the mounted `data` volume, so the key survives restarts and
image upgrades. The one thing worth doing is **including `homeglow/data` in your
backups** — losing that file means re-entering your stored credentials.

Resolution order is `ENCRYPTION_KEY` → the key file → generate a new one. When
`ENCRYPTION_KEY` is set and no key file exists yet, the supplied key is also
written to the file, so removing the variable later keeps working rather than
silently generating a different key.

The server only disables third-party connections when it has no usable key at
all, which in practice means the key file could not be written (a read-only
volume or a permissions problem) or a supplied `ENCRYPTION_KEY` does not decode
to 32 bytes. Both are logged at startup. To rotate to a fresh key, delete
`server/data/.encryption-key` and restart — stored credentials will need
re-entering.

> **Before v1.7**, calendar and photo credentials used a separate scheme that
> fell back to a key hardcoded in this repository whenever `ENCRYPTION_KEY` was
> unset — which was every install using the stock `docker-compose.yml`, since it
> never passed the variable through. They now share the key above, and existing
> values are re-encrypted automatically on upgrade (migration 25). No action is
> needed.

### Outbound TLS — self-signed certificates on your own network

HomeGlow talks to two kinds of host and treats their certificates differently.
There is nothing to configure.

| Target | Certificate policy |
| --- | --- |
| `http://` anything | No TLS involved. Installs running entirely over plain HTTP, on a LAN or on localhost, are unaffected. |
| `https://` **public** host (Google, iCloud, OpenWeatherMap, a hosted ICS feed) | **Always verified.** A bad certificate here is an attack, and it is the only thing protecting an OAuth refresh token in transit. |
| `https://` **private** host | **Self-signed accepted**, and logged when it happens. |

"Private" means loopback, RFC1918 (`10/8`, `172.16/12`, `192.168/16`),
link-local, IPv6 unique-local/loopback, or a hostname ending in `.local`,
`.lan`, `.internal`, `.home` or `.home.arpa`. That covers the normal
self-hosted case — Immich, Home Assistant or a NAS on your own network, where no
public CA will ever issue a certificate for `192.168.1.50`.

The match is on the literal hostname, with no DNS lookup. One honest limitation
follows: a name like `myserver.local` that actually resolves to a public address
is still treated as local.

> **Before v1.7**, the CORS proxy set `NODE_TLS_REJECT_UNAUTHORIZED=0` the first
> time it saw any `https://` URL, which disabled certificate verification for
> the whole backend process — Google token exchanges included — and never
> restored it. It also meant self-signed LAN services only worked *after*
> something happened to trip that switch, so they failed on a fresh boot. Both
> are fixed: the decision is per request, and the LAN case is now deterministic
> (issue #139).

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
| `VITE_OPENWEATHER_API_KEY` | — | **Unused since weather moved server-side (#57).** The key now lives only in the `settings` table and never reaches the bundle. |
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
| **Connections → Weather** | Provider choice (`WEATHER_PROVIDER`: `openweathermap` \| `homeassistant`), OpenWeatherMap key (`WEATHER_API_KEY`, write-only) | `settings` (global) |
| **Connections → Home Assistant** | Base URL (`HOME_ASSISTANT_URL`), long-lived token (`HOME_ASSISTANT_TOKEN_ENC`, encrypted + write-only), weather entity (`HOME_ASSISTANT_WEATHER_ENTITY`) | `settings` (global) |
| **APIs** | ICS calendar URL | `settings` (global) |
| **Chores → rewards** | Daily completion bonus (`daily_completion_clam_reward`), all-chores-done celebration (`CHORE_CELEBRATION_ENABLED`, default on) | `settings` (global) |
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
