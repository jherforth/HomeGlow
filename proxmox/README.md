# HomeGlow on Proxmox VE

Two ways to install HomeGlow into a Proxmox LXC:

1. **[Self-install script](#quick-install-available-now)** — hosted in this repo, works today.
2. **[Official community-scripts listing](#getting-listed-in-community-scripts)** — a draft
   submission to [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE)
   for the one-line `helper-scripts` experience and extra exposure (issue #117).

Both use the same approach: a **Debian LXC with Docker**, running HomeGlow's published
GHCR images (`ghcr.io/jherforth/homeglow-{backend,frontend}`) via the project's
[`docker-compose.yml`](../docker-compose.yml). Because they pull the `:latest` images and
fetch the canonical compose file, they keep working for future HomeGlow releases with no
script changes.

> **Note on "node LXC":** the LXC runs **Debian + Docker**, not a Node runtime directly.
> HomeGlow's Docker images already bundle Node; the container only needs Docker to run them.

---

## Quick install (available now)

Run this **on a Proxmox VE host** (as root):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/jherforth/HomeGlow/main/proxmox/install-homeglow.sh)"
```

It prompts (with sensible defaults) for CT ID, hostname, disk/CPU/RAM, bridge, storage,
timezone, and web port, then:

1. Downloads a Debian 12 LXC template if needed.
2. Creates an **unprivileged** LXC with `nesting=1,keyctl=1` (required to run Docker inside
   an unprivileged container).
3. Installs Docker, fetches `docker-compose.yml`, generates a stable `ENCRYPTION_KEY` into
   `/opt/homeglow/.env`, and runs `docker compose up -d`.
4. Prints the access URL (`http://<container-ip>:<port>`).

### Updating

```bash
pct exec <CTID> -- sh -c 'cd /opt/homeglow && docker compose pull && docker compose up -d'
```

This works across HomeGlow releases because the compose file pulls `:latest`, which CI now
publishes on every tagged release.

---

## Getting listed in community-scripts

The files in [`community-scripts/`](./community-scripts) are a **draft submission** for the
official [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE)
collection:

| File | Role |
| --- | --- |
| `ct/homeglow.sh` | User-facing wrapper (sources their `build.func`; resources + `update_script`). |
| `install/homeglow-install.sh` | Runs inside the LXC: deps → Docker → deploy compose. |
| `json/homeglow.json` | Website metadata (resources, ports, docs, notes). |

### ⚠️ Before submitting

These follow the community-scripts framework **as of this writing**, but that framework
evolves. Before opening a PR:

1. **Re-validate against their current
   [CONTRIBUTING.md](https://github.com/community-scripts/ProxmoxVE/blob/main/.github/CONTRIBUTING.md)**
   and a recently-merged Docker-based script — confirm the current function names, variable
   units (RAM in MB, disk in GB), file locations, and JSON schema (`categories`, required
   fields).
2. **Test on a real Proxmox VE host** end-to-end: container builds, app is reachable, and
   `update` works. None of this can be verified without Proxmox + Docker, so it has **not**
   been runtime-tested — treat the drafts as a starting point.

### Submission steps

1. Fork `community-scripts/ProxmoxVE`.
2. Copy `ct/homeglow.sh`, `install/homeglow-install.sh`, and `json/homeglow.json` into the
   matching directories of the fork (their JSON lives under `frontend/public/json/`).
3. Run their linters / `shellcheck`, adjust to match current conventions.
4. Open a PR; respond to maintainer review. Acceptance is at their discretion (they weigh
   app maturity, popularity, and fit).

Once merged, HomeGlow gets a one-line installer and a page on their site.
