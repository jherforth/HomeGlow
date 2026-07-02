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
  `node:20-alpine` builds the Vite bundle, then `nginx:alpine` serves `dist/`. An
  entrypoint runs `envsubst` on [`nginx.conf`](../../client/nginx.conf) so
  `FRONTEND_PORT`/`BACKEND_SERVICE`/`BACKEND_PORT` are applied at container start.
- **Backend** ([`server/Dockerfile`](../../server/Dockerfile)): `node:24`, installs
  build tooling, `npm install`, rebuilds `better-sqlite3` from source, and runs
  `node index.js`. `uploads/` and `widgets/` are created with open permissions.

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
