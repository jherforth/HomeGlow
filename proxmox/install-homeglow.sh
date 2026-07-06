#!/usr/bin/env bash
# HomeGlow — Proxmox VE self-install script.
#
# Run this ON A PROXMOX VE HOST (as root). It creates a Debian LXC, installs
# Docker inside it, and deploys HomeGlow from the published GHCR images via the
# project's docker-compose.yml. Because it pulls the :latest images and the
# canonical compose file, it keeps working for future HomeGlow releases with no
# changes to this script — update in place with `docker compose pull`.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/jherforth/HomeGlow/main/proxmox/install-homeglow.sh)"
#
# License: MIT (same as HomeGlow). Not affiliated with the community-scripts
# project; see proxmox/README.md for the path to the official listing.

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/jherforth/HomeGlow/main"
APP="HomeGlow"

# --- tiny output helpers (styled after community-scripts, self-contained) ----
YW="\033[33m"; GN="\033[1;92m"; RD="\033[01;31m"; CL="\033[m"
msg_info() { echo -e " ${YW}•${CL} $1"; }
msg_ok()   { echo -e " ${GN}✓${CL} $1"; }
msg_err()  { echo -e " ${RD}✗${CL} $1" >&2; }
die()      { msg_err "$1"; exit 1; }

# --- preflight ---------------------------------------------------------------
[[ "$(id -u)" -eq 0 ]] || die "Run as root on the Proxmox VE host."
command -v pveversion >/dev/null 2>&1 || die "This must be run on a Proxmox VE host (pveversion not found)."
command -v pct >/dev/null 2>&1 || die "pct not found — is this a Proxmox VE host?"

echo -e "\n${GN}=== ${APP} — Proxmox LXC installer ===${CL}\n"

# --- prompt for settings (Enter accepts the default) -------------------------
ask() { # ask <var> <prompt> <default>
  local __var="$1" __prompt="$2" __default="$3" __reply
  read -rp " ${__prompt} [${__default}]: " __reply || true
  printf -v "$__var" '%s' "${__reply:-$__default}"
}

DEFAULT_CTID="$(pvesh get /cluster/nextid 2>/dev/null || echo 100)"
HOST_TZ="$(cat /etc/timezone 2>/dev/null || echo America/New_York)"

ask CTID       "Container ID"                 "$DEFAULT_CTID"
ask HOSTNAME   "Hostname"                     "homeglow"
ask DISK_GB    "Disk size (GB)"               "6"
ask CORES      "CPU cores"                    "2"
ask RAM_MB     "RAM (MB)"                     "2048"
ask BRIDGE     "Network bridge"               "vmbr0"
ask STORAGE    "Storage pool"                 "local-lvm"
ask TEMPLATE_STORAGE "Template storage"       "local"
ask TZ         "Timezone (IANA)"              "$HOST_TZ"
ask FRONTEND_PORT "HomeGlow web port"         "3000"

pct status "$CTID" >/dev/null 2>&1 && die "Container ID ${CTID} already exists. Choose another."

# --- ensure a Debian 12 template is available --------------------------------
msg_info "Ensuring Debian 12 LXC template is available"
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam available --section system 2>/dev/null | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)"
[[ -n "$TEMPLATE" ]] || die "Could not find a debian-12-standard template via 'pveam available'."
if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  msg_info "Downloading ${TEMPLATE} to ${TEMPLATE_STORAGE}"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null || die "Template download failed."
fi
msg_ok "Template ready: ${TEMPLATE}"

# --- create + start the container --------------------------------------------
# nesting + keyctl are required to run Docker inside an unprivileged LXC.
msg_info "Creating LXC ${CTID} (${HOSTNAME})"
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" \
  --memory "$RAM_MB" \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --features "nesting=1,keyctl=1" \
  --unprivileged 1 \
  --onboot 1 \
  --timezone "$TZ" \
  >/dev/null || die "pct create failed."
msg_ok "Container created"

msg_info "Starting container"
pct start "$CTID" >/dev/null || die "pct start failed."
# Wait for network (DHCP lease + resolvable).
for _ in $(seq 1 30); do
  pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
  sleep 2
done
msg_ok "Container started"

# --- provision inside the container ------------------------------------------
run() { pct exec "$CTID" -- bash -c "$1"; }

msg_info "Installing base dependencies"
run "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq ca-certificates curl openssl >/dev/null" \
  || die "Dependency install failed."
msg_ok "Base dependencies installed"

msg_info "Installing Docker (this can take a few minutes)"
run "curl -fsSL https://get.docker.com | sh >/dev/null 2>&1" || die "Docker install failed."
run "systemctl enable --now docker >/dev/null 2>&1" || true
msg_ok "Docker installed"

msg_info "Deploying ${APP}"
run "mkdir -p /opt/homeglow"
run "curl -fsSL '${REPO_RAW}/docker-compose.yml' -o /opt/homeglow/docker-compose.yml" \
  || die "Could not fetch docker-compose.yml."
# Generate a stable .env once (never regenerated on re-run/update).
run "test -f /opt/homeglow/.env || cat > /opt/homeglow/.env <<EOF
TZ=${TZ}
FRONTEND_PORT=${FRONTEND_PORT}
ENCRYPTION_KEY=\$(openssl rand -base64 32)
EOF"
run "cd /opt/homeglow && docker compose pull >/dev/null 2>&1 && docker compose up -d >/dev/null 2>&1" \
  || die "docker compose up failed."
msg_ok "${APP} deployed"

# --- done --------------------------------------------------------------------
IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')"
echo
msg_ok "${APP} is installed in LXC ${CTID}."
echo -e "   Open:  ${GN}http://${IP:-<container-ip>}:${FRONTEND_PORT}${CL}"
echo -e "   Update later:  ${YW}pct exec ${CTID} -- sh -c 'cd /opt/homeglow && docker compose pull && docker compose up -d'${CL}"
echo
