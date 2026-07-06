# Deployment

HomeGlow ships as two Docker images published to GitHub Container Registry (GHCR):

- `ghcr.io/jherforth/homeglow-frontend` — Nginx serving the built SPA + reverse proxy.
- `ghcr.io/jherforth/homeglow-backend` — Fastify API + SQLite.

Target environment: Linux hosts, including low-power devices (Raspberry Pi,
Proxmox VMs). Portainer is fully supported.

## Recommended: Docker Compose with pre-built images

```bash
# 1. Download the compose file
wget https://raw.githubusercontent.com/jherforth/HomeGlow/main/docker-compose.yml

# 2. Create a .env next to it
cat > .env <<'EOF'
FRONTEND_PORT=3000
TZ=America/New_York
ENCRYPTION_KEY=REPLACE_WITH_openssl_rand_base64_32
EOF

# 3. Start
docker compose up -d

# 4. Open http://your-server-ip:3000  and configure via the ⚙️ Admin Panel
```

[`docker-compose.yml`](../../docker-compose.yml) defines:
- `homeglow-backend` — bind-mounts `./homeglow/data` (DB) and `./homeglow/uploads`
  (photos/avatars/widgets); env `PORT`, `TZ`, `NODE_ENV=production`.
- `homeglow-frontend` — publishes `FRONTEND_PORT`; knows the backend via
  `BACKEND_SERVICE`/`BACKEND_PORT` on the shared `homeglow-network`.

> Add `ENCRYPTION_KEY` to the backend service's environment (and your `.env`) if you
> use Google/CalDAV connections — see [Configuration](../reference/configuration.md).

### Updating
```bash
docker compose pull && docker compose up -d
```

## Running a public demo instance (demo mode)

Set `DEMO_MODE=true` in the `.env` (or environment) of the backend container to
turn an install into a throwaway public demo:

```env
DEMO_MODE=true
```

What it changes:

- **In-memory database** — all data lives in RAM and is wiped when the
  container stops; `DB_PATH` is ignored.
- **Admin PIN disabled** — the Admin Panel opens without a prompt, and the
  PIN set/verify/delete routes return 403 so a visitor can't lock others out.
- **Sample data** — a demo household (users, chores, schedules, clam history,
  prizes, a week of calendar events) is seeded at boot and re-seeded every
  6 hours; new visitor devices auto-enable the chore + calendar widgets.
- **Abuse-prone routes return 403** — all uploads (widgets/sounds/avatars/
  photos), widget install/delete, the `/api/proxy` CORS proxy, Google/Apple
  connection setup, and calendar test/sync triggers (visitor-supplied URLs
  are never fetched — the calendar sync service stays off).
- A "Demo Mode" banner is shown in the client.

Normal installs are unaffected: `DEMO_MODE` defaults to `false` everywhere.

## Building from source

```bash
git clone https://github.com/jherforth/homeglow.git && cd homeglow
docker compose -f docker-compose-dev.yml up --build
```
This builds both images locally using [`client/Dockerfile`](../../client/Dockerfile)
and [`server/Dockerfile`](../../server/Dockerfile). See
[Getting Started](getting-started.md) for the dev ports and native (npm) workflow.

## How the images are built

- **Frontend** ([`client/Dockerfile`](../../client/Dockerfile)): multi-stage —
  `node:24-alpine` builds the Vite bundle (`npm ci`, pinned to the committed
  lockfile; the builder runs on the build host's native architecture since
  `dist/` is architecture-independent), then `nginx:alpine` serves `dist/`.
  Published for `linux/amd64` and `linux/arm64`. An entrypoint runs `envsubst`
  on [`nginx.conf`](../../client/nginx.conf) so
  `FRONTEND_PORT`/`BACKEND_SERVICE`/`BACKEND_PORT` are applied at container start.
- **Backend** ([`server/Dockerfile`](../../server/Dockerfile)): multi-stage —
  a `node:24-slim` builder installs production dependencies (with a C++ toolchain
  available only in that stage as a fallback if `better-sqlite3` has no prebuilt
  binary), then a clean `node:24-slim` runtime copies `node_modules` + app code and
  runs `node index.js`. Final image is ~300MB (vs ~1.4GB before the multi-stage
  split). Published for `linux/amd64` and `linux/arm64` (Raspberry Pi capable).
  `uploads/` and `widgets/` are created with open permissions.

## CI/CD (GitHub Actions)

- [`.github/workflows/ci-tests.yml`](../../.github/workflows/ci-tests.yml) — runs
  frontend and backend test suites (Node 20) on every push.
- [`.github/workflows/docker-image.yml`](../../.github/workflows/docker-image.yml) —
  on a `v*` tag (or manual dispatch), builds and pushes both images to GHCR, injecting
  version/commit/repo build args. Tags produced: the release tag and `latest-test`.

To cut a release, push a `v*` tag (e.g. `git tag v1.4 && git push --tags`).

## Reverse proxy / HTTPS

The app has no built-in TLS or auth. For HTTPS and a custom domain, front it with a
reverse proxy (Nginx, Traefik, Caddy, or Cloudflare Tunnel) and add access control.
Only the **frontend** port needs to be exposed; the backend stays on the internal
Docker network.

## Data & backups

Back up the two bind-mounted directories:
- `./homeglow/data/` — SQLite database (`tasks.db`, `.encryption-key`).
- `./homeglow/uploads/` — user avatars, uploaded photos, and custom widgets.
