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

It walks you through the settings in dialogs, the same blue `whiptail` screens the
community-scripts installers use:

- **Recommended** takes the next free container ID, 6 GB disk, 2 cores, 2048 MB RAM,
  DHCP on `vmbr0`, and this host's time zone. It only asks which storage pool to use
  when the host has more than one (on a ZFS install, for example, there is no
  `local-lvm`).
- **Advanced** steps through each setting, with **Back** on every screen: container ID
  (checked against containers *and* VMs), hostname, disk, cores, RAM, storage pool and
  template storage (picked from this host's active pools, with free space shown),
  network bridge (picked from the host's bridges), DHCP or a static address with
  gateway, an optional VLAN tag, time zone, and web port. Bad input is caught on the
  screen where you typed it.
- Nothing is created until you confirm the summary. If the install fails after the
  container exists, it offers to remove the half-installed container.

Without a terminal or `whiptail`, it asks the same questions as plain text prompts
(force this with `HOMEGLOW_UI=plain`). Then it:

1. Downloads a Debian 12 LXC template if needed.
2. Creates an **unprivileged** LXC with `nesting=1,keyctl=1` (required to run Docker inside
   an unprivileged container).
3. Installs Docker, fetches `docker-compose.yml`, generates a stable `ENCRYPTION_KEY` into
   `/opt/homeglow/.env`, and runs `docker compose up -d`.
4. Prints the access URL (`http://<container-ip>:<port>`).

### Testing changes to the script

There's no Proxmox host in CI, so `proxmox/tests/install-homeglow.test.sh` runs the real
script against a stubbed one: fake `pct`/`pvesm`/`pvesh`/`pveam`/`ip` that log what
they're asked, and a scripted `whiptail` that answers each dialog. CI runs it alongside
ShellCheck on every push. Run it locally with `bash proxmox/tests/install-homeglow.test.sh`.
The stubs can't show how the dialogs look on a real terminal, so check a change to the
dialogs by hand on a Proxmox host.

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
