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
# Settings are chosen in whiptail dialogs (the same blue screens the
# community-scripts installers use), with storage pools and network bridges
# offered as lists read from this host. Without a terminal or whiptail, or
# with HOMEGLOW_UI=plain, it asks the same questions as plain text prompts.
#
# License: MIT. Not affiliated with the community-scripts
# project; see proxmox/README.md for the path to the official listing.

set -Eeuo pipefail

REPO_RAW="https://raw.githubusercontent.com/jherforth/HomeGlow/main"
APP="HomeGlow"
BACKTITLE="${APP} · Proxmox VE installer"

# --- tiny output helpers (styled after community-scripts, self-contained) ----
YW="\033[33m"; GN="\033[1;92m"; RD="\033[01;31m"; CL="\033[m"
msg_info() { echo -e " ${YW}•${CL} $1"; }
msg_ok()   { echo -e " ${GN}✓${CL} $1"; }
msg_warn() { echo -e " ${YW}!${CL} $1"; }
msg_err()  { echo -e " ${RD}✗${CL} $1" >&2; }

# ============================================================================
# Validation — pure checks, no side effects (sourced by the tests).
# ============================================================================
is_uint()        { [[ "$1" =~ ^[0-9]+$ ]]; }
in_range()       { is_uint "$1" && (( 10#$1 >= $2 && 10#$1 <= $3 )); }
valid_hostname() { [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]]; }
valid_ipv4() {
  local ip="$1" part
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  for part in "${BASH_REMATCH[@]:1}"; do (( 10#$part <= 255 )) || return 1; done
}
valid_cidr() {
  [[ "$1" == */* ]] || return 1
  valid_ipv4 "${1%/*}" && in_range "${1#*/}" 1 32
}
ZONEINFO_DIR="${ZONEINFO_DIR:-/usr/share/zoneinfo}"
valid_timezone() {
  [[ -n "$1" && "$1" != *..* && "$1" != /* && -f "${ZONEINFO_DIR}/$1" ]]
}

# ============================================================================
# Host discovery
# ============================================================================

# The host's zone. /etc/timezone is gone from Debian 13 (Proxmox VE 9), so ask
# systemd first, then read the /etc/localtime link, and only then the old file.
host_timezone() {
  local tz=""
  if command -v timedatectl >/dev/null 2>&1; then
    tz="$(timedatectl show --property=Timezone --value 2>/dev/null || true)"
  fi
  if [[ -z "$tz" && -L /etc/localtime ]]; then
    tz="$(readlink -f /etc/localtime 2>/dev/null | sed -n 's|^.*/zoneinfo/||p')"
  fi
  if [[ -z "$tz" && -r /etc/timezone ]]; then
    tz="$(head -n1 /etc/timezone)"
  fi
  echo "${tz:-America/New_York}"
}

# Whether an ID is free across the cluster — containers AND VMs, which share
# one ID space. pvesh refuses an ID that is taken.
ctid_free() {
  pvesh get /cluster/nextid --vmid "$1" >/dev/null 2>&1
}

# Active storage pools that accept a content type, as "name|type|free KiB".
list_storage() {
  { pvesm status -content "$1" 2>/dev/null || true; } \
    | awk 'NR > 1 && $3 == "active" { print $1 "|" $2 "|" $6 }'
}

storage_count() { list_storage "$1" | grep -c . || true; }

human_kib() {
  numfmt --to=iec --from-unit=1024 --suffix=B --format %.1f "$1" 2>/dev/null || echo "${1}KiB"
}

# Linux bridges guests can attach to. fwbr* are the per-guest firewall
# bridges Proxmox creates itself; they are not for us.
list_bridges() {
  ip -o link show type bridge 2>/dev/null \
    | awk -F': ' '{ sub(/@.*/, "", $2); print $2 }' \
    | grep -Ev '^(fwbr|docker|br-)' || true
}

# ============================================================================
# Dialogs: whiptail on a terminal, plain prompts otherwise.
# Each prints the answer on stdout and returns non-zero for Cancel/Back.
# ============================================================================
case "${HOMEGLOW_UI:-auto}" in
  whiptail|plain) UI="$HOMEGLOW_UI" ;;
  *)
    if [[ -t 0 && -t 1 ]] && command -v whiptail >/dev/null 2>&1; then
      UI=whiptail
    else
      UI=plain
    fi
    ;;
esac
STEP_LABEL=""   # "[Step 3/11]" while the advanced wizard runs
CT_CREATED=0    # set once pct create succeeds; failures after that offer cleanup

backtitle() { echo "${BACKTITLE}${STEP_LABEL:+ $STEP_LABEL}"; }

# ui_input <title> <text> <default> [ok-label] [cancel-label]
ui_input() {
  if [[ $UI == whiptail ]]; then
    whiptail --backtitle "$(backtitle)" --title "$1" \
      --ok-button "${4:-Next}" --cancel-button "${5:-Back}" \
      --inputbox "\n$2" 12 70 "$3" 3>&1 1>&2 2>&3
  else
    local reply
    echo -e "\n ${GN}$1${CL} — $2" >&2
    read -rp "   [$3]: " reply || input_closed || return 1
    echo "${reply:-$3}"
  fi
}

# ui_menu <title> <text> <default-tag> <tag> <description> [<tag> <description> ...]
ui_menu() {
  local title="$1" text="$2" default="$3"; shift 3
  if [[ $UI == whiptail ]]; then
    local count=$(( $# / 2 )) height
    height=$(( count > 8 ? 8 : count ))
    whiptail --backtitle "$(backtitle)" --title "$title" \
      --ok-button "Next" --cancel-button "Back" --default-item "$default" \
      --menu "\n$text" $(( height + 10 )) 74 "$height" "$@" 3>&1 1>&2 2>&3
  else
    local -a tags=() descs=()
    while (( $# )); do tags+=("$1"); descs+=("$2"); shift 2; done
    echo -e "\n ${GN}${title}${CL} — ${text}" >&2
    local i reply
    for i in "${!tags[@]}"; do
      printf '   %d) %-14s %s\n' "$(( i + 1 ))" "${tags[$i]}" "${descs[$i]}" >&2
    done
    while true; do
      read -rp "   Choose 1-${#tags[@]} [${default}]: " reply || input_closed || return 1
      [[ -z "$reply" ]] && { echo "$default"; return 0; }
      if in_range "$reply" 1 "${#tags[@]}"; then echo "${tags[$(( reply - 1 ))]}"; return 0; fi
      for i in "${!tags[@]}"; do [[ "${tags[$i]}" == "$reply" ]] && { echo "$reply"; return 0; }; done
      echo "   Please enter a number from the list." >&2
    done
  fi
}

# Box height for a block of text: its lines once wrapped, plus the frame.
text_height() {
  local lines
  lines="$(echo -e "$1" | fold -s -w 68 | wc -l)"
  lines=$(( lines + 8 ))
  (( lines > 24 )) && lines=24
  echo "$lines"
}

# ui_yesno <title> <text> [yes-label] [no-label]
ui_yesno() {
  if [[ $UI == whiptail ]]; then
    whiptail --backtitle "$(backtitle)" --title "$1" \
      --yes-button "${3:-Yes}" --no-button "${4:-No}" --yesno "\n$2" "$(text_height "$2")" 74
  else
    local reply
    echo -e "\n ${GN}$1${CL}" >&2
    echo -e "$2" | sed 's/^/   /' >&2
    read -rp "   ${3:-Yes}? [Y/n]: " reply || input_closed || return 1
    [[ ! "$reply" =~ ^[Nn] ]]
  fi
}

ui_msg() {
  if [[ $UI == whiptail ]]; then
    whiptail --backtitle "$(backtitle)" --title "$1" --msgbox "\n$2" "$(text_height "$2")" 74
  else
    echo -e "   ${YW}$1:${CL} $2" >&2
  fi
}

# Wipe the last dialog off the terminal. Never fatal: without a usable TERM,
# clear fails, and that must not abort an install under set -e.
clear_screen() {
  if [[ $UI == whiptail ]]; then clear 2>/dev/null || true; fi
}

# Stop the whole installer. Dialogs run inside $(...), where a plain `exit`
# would only end that subshell and hand its message back as an answer, so a
# subshell signals the main script instead.
MAIN_PID=$$
trap 'exit 0' USR1

exit_cancelled() {
  clear_screen
  echo -e "\n ${YW}Installation cancelled. Nothing was changed.${CL}\n" >&2
  if (( BASH_SUBSHELL > 0 )); then kill -USR1 "$MAIN_PID"; fi
  exit 0
}

# Input ran out (Ctrl-D, a closed pipe). Before anything is created that is a
# cancel; once a container exists, it is a "no" to whatever was asked.
input_closed() {
  (( CT_CREATED )) && return 1
  exit_cancelled
}

# ============================================================================
# Failure handling
# ============================================================================

die() {
  trap - ERR
  msg_err "$1"
  if (( CT_CREATED )); then
    local remove=0
    ui_yesno "Installation failed" "Container ${CTID} was created but ${APP} did not finish installing:\n\n  $1\n\nRemove the half-installed container now?" "Remove it" "Keep it" && remove=1
    if [[ $UI == whiptail ]]; then
      clear_screen
      msg_err "$1"
    fi
    if (( remove )); then
      msg_info "Removing container ${CTID}"
      pct stop "$CTID" >/dev/null 2>&1 || true
      if pct destroy "$CTID" --purge >/dev/null 2>&1; then
        msg_ok "Container ${CTID} removed"
      else
        msg_err "Could not remove it; run: pct destroy ${CTID} --purge"
      fi
    else
      msg_warn "Kept container ${CTID} for inspection: pct enter ${CTID}"
      msg_warn "Remove it later with: pct stop ${CTID}; pct destroy ${CTID} --purge"
    fi
  fi
  exit 1
}
trap 'die "Unexpected error on line ${LINENO}: ${BASH_COMMAND}"' ERR

# ============================================================================
# Settings
# ============================================================================
pick_storage() { # pick_storage <content> <label> <current>
  local content="$1" label="$2" current="$3" name type free
  local -a items=()
  while IFS='|' read -r name type free; do
    items+=("$name" "$(printf '%-10s %s free' "$type" "$(human_kib "$free")")")
  done < <(list_storage "$content")
  (( ${#items[@]} )) || die "No active storage on this host accepts ${label,,}s (content type '${content}')."
  if (( ${#items[@]} == 2 )); then echo "${items[0]}"; return 0; fi
  [[ -n "$current" ]] || current="${items[0]}"
  ui_menu "${label} storage" "Where should the ${label,,} go?" "$current" "${items[@]}"
}

pick_bridge() {
  local current="$1" bridge v
  local -a items=()
  while read -r bridge; do
    [[ -n "$bridge" ]] && items+=("$bridge" "Linux bridge")
  done < <(list_bridges)
  items+=("other" "Type a bridge name (OVS, SDN vnet, ...)")
  v="$(ui_menu "Network bridge" "Which bridge should the container connect to?" "$current" "${items[@]}")" || return 1
  if [[ "$v" == other ]]; then
    v="$(ui_input "Network bridge" "Bridge name:" "$current")" || return 1
  fi
  echo "$v"
}

storage_free_kib() {
  list_storage rootdir | awk -F'|' -v s="$1" '$1 == s { print $3 }'
}

# Defaults, most of them read from this host.
set_defaults() {
  CTID="$(pvesh get /cluster/nextid 2>/dev/null || echo 100)"
  CT_HOSTNAME="homeglow"
  DISK_GB=6
  CORES=2
  RAM_MB=2048
  if list_bridges | grep -qx vmbr0; then
    BRIDGE=vmbr0
  else
    BRIDGE="$(list_bridges | head -n1)"
  fi
  BRIDGE="${BRIDGE:-vmbr0}"
  NET_MODE=dhcp
  IPV4_CIDR=""
  GATEWAY=""
  VLAN=""
  TZ_NAME="$(host_timezone)"
  FRONTEND_PORT=3000
  STORAGE=""
  TEMPLATE_STORAGE=""
}

# Choose storage when it is not obvious. With one pool there is nothing to ask;
# for templates, "local" is the conventional home when it is offered.
# Returns non-zero when the person pressed Back.
default_storage() {
  if [[ -z "$STORAGE" ]]; then
    STORAGE="$(STEP_LABEL='' pick_storage rootdir "Container disk" "")" || return 1
  fi
  if [[ -z "$TEMPLATE_STORAGE" ]]; then
    if list_storage vztmpl | cut -d'|' -f1 | grep -qx local; then
      TEMPLATE_STORAGE=local
    else
      TEMPLATE_STORAGE="$(STEP_LABEL='' pick_storage vztmpl "Template" "")" || return 1
    fi
  fi
}

# The advanced wizard. Back on the first step returns non-zero.
advanced_settings() {
  local step=1 last=11 back=0 v free
  while (( step <= last )); do
    STEP_LABEL="[Step ${step}/${last}]"
    case $step in
      1)
        if ! v="$(ui_input "Container ID" "Numeric ID for the new container (100 or above).\nIt must not be used by any container or VM." "$CTID")"; then
          STEP_LABEL=""; return 1
        fi
        if ! in_range "$v" 100 999999999; then
          ui_msg "Invalid ID" "Container IDs are whole numbers from 100 up."; continue
        fi
        if ! ctid_free "$v"; then
          ui_msg "ID in use" "ID ${v} is already taken by a container or VM on this cluster."; continue
        fi
        CTID=$((10#$v))
        ;;
      2)
        v="$(ui_input "Hostname" "Network name for the container." "$CT_HOSTNAME")" || { step=$((step - 1)); back=1; continue; }
        if ! valid_hostname "$v"; then
          ui_msg "Invalid hostname" "Use letters, digits and hyphens (not at either end), up to 63 characters."; continue
        fi
        CT_HOSTNAME="$v"
        ;;
      3)
        v="$(ui_input "Disk size" "Disk size in GB. HomeGlow and Docker need about 4 GB;\nphotos and sounds you upload are stored here too." "$DISK_GB")" || { step=$((step - 1)); back=1; continue; }
        in_range "$v" 4 65536 || { ui_msg "Invalid size" "Enter a whole number of GB, at least 4."; continue; }
        DISK_GB=$((10#$v))
        ;;
      4)
        local max_cores
        max_cores="$(nproc 2>/dev/null || echo 64)"
        v="$(ui_input "CPU cores" "CPU cores for the container (this host has ${max_cores})." "$CORES")" || { step=$((step - 1)); back=1; continue; }
        in_range "$v" 1 "$max_cores" || { ui_msg "Invalid core count" "Enter a number from 1 to ${max_cores}."; continue; }
        CORES=$((10#$v))
        ;;
      5)
        v="$(ui_input "Memory" "RAM in MB. 2048 is comfortable; 1024 is the practical minimum." "$RAM_MB")" || { step=$((step - 1)); back=1; continue; }
        in_range "$v" 512 1048576 || { ui_msg "Invalid memory" "Enter a whole number of MB, at least 512."; continue; }
        RAM_MB=$((10#$v))
        ;;
      6)
        # One pool means nothing to choose; pass through in whichever
        # direction the wizard is moving.
        if (( $(storage_count rootdir) == 1 )); then
          STORAGE="$(list_storage rootdir | cut -d'|' -f1)"
          if (( back )); then step=$((step - 1)); continue; fi
          step=$((step + 1)); continue
        fi
        v="$(pick_storage rootdir "Container disk" "$STORAGE")" || { step=$((step - 1)); back=1; continue; }
        free="$(storage_free_kib "$v")"
        if [[ -n "$free" ]] && (( free < DISK_GB * 1024 * 1024 )); then
          ui_yesno "Low on space" "${v} has $(human_kib "$free") free, less than the ${DISK_GB} GB disk.\n\nThin-provisioned pools can still work. Use it anyway?" "Use it" "Choose again" || continue
        fi
        STORAGE="$v"
        ;;
      7)
        if (( $(storage_count vztmpl) == 1 )); then
          TEMPLATE_STORAGE="$(list_storage vztmpl | cut -d'|' -f1)"
          if (( back )); then step=$((step - 1)); continue; fi
          step=$((step + 1)); continue
        fi
        v="$(pick_storage vztmpl "Template" "${TEMPLATE_STORAGE:-local}")" || { step=$((step - 1)); back=1; continue; }
        TEMPLATE_STORAGE="$v"
        ;;
      8)
        v="$(pick_bridge "$BRIDGE")" || { step=$((step - 1)); back=1; continue; }
        if ! ip link show dev "$v" >/dev/null 2>&1; then
          ui_msg "Unknown bridge" "There is no interface called '${v}' on this host."; continue
        fi
        BRIDGE="$v"
        ;;
      9)
        v="$(ui_menu "IPv4 address" "How should the container get its address?" "$NET_MODE" \
          dhcp "Automatic (DHCP, recommended)" \
          static "Static address")" || { step=$((step - 1)); back=1; continue; }
        NET_MODE="$v"
        if [[ "$NET_MODE" == static ]]; then
          v="$(ui_input "Static address" "Address with prefix length, e.g. 192.168.1.50/24." "${IPV4_CIDR}")" || continue
          valid_cidr "$v" || { ui_msg "Invalid address" "Use the form 192.168.1.50/24."; continue; }
          IPV4_CIDR="$v"
          v="$(ui_input "Gateway" "Default gateway, e.g. 192.168.1.1." "${GATEWAY}")" || continue
          valid_ipv4 "$v" || { ui_msg "Invalid gateway" "Use the form 192.168.1.1."; continue; }
          GATEWAY="$v"
        fi
        v="$(ui_input "VLAN tag" "VLAN tag for the network interface. Leave empty for none." "${VLAN}")" || continue
        if [[ -n "$v" ]] && ! in_range "$v" 1 4094; then
          ui_msg "Invalid VLAN" "VLAN tags are numbers from 1 to 4094."; continue
        fi
        VLAN="$v"
        ;;
      10)
        v="$(ui_input "Time zone" "IANA time zone for the container and HomeGlow, e.g. Europe/Berlin.\nThis host uses ${TZ_NAME}." "$TZ_NAME")" || { step=$((step - 1)); back=1; continue; }
        valid_timezone "$v" || { ui_msg "Unknown time zone" "'${v}' is not a time zone this host knows. Use a name like America/Chicago."; continue; }
        TZ_NAME="$v"
        ;;
      11)
        v="$(ui_input "Web port" "Port HomeGlow is served on inside the container." "$FRONTEND_PORT")" || { step=$((step - 1)); back=1; continue; }
        in_range "$v" 1 65535 || { ui_msg "Invalid port" "Enter a port from 1 to 65535."; continue; }
        FRONTEND_PORT=$((10#$v))
        ;;
    esac
    step=$((step + 1))
    back=0
  done
  STEP_LABEL=""
}

summary_text() {
  local net="DHCP"
  [[ "$NET_MODE" == static ]] && net="${IPV4_CIDR} via ${GATEWAY}"
  [[ -n "$VLAN" ]] && net="${net}, VLAN ${VLAN}"
  cat <<EOF
  Container ID:      ${CTID}
  Hostname:          ${CT_HOSTNAME}
  Disk:              ${DISK_GB} GB on ${STORAGE}
  CPU / RAM:         ${CORES} cores, ${RAM_MB} MB
  Template storage:  ${TEMPLATE_STORAGE}
  Network:           ${BRIDGE}, ${net}
  Time zone:         ${TZ_NAME}
  Web port:          ${FRONTEND_PORT}

  Unprivileged Debian 12 container with Docker (nesting + keyctl), started
  on boot. HomeGlow runs from the published images in /opt/homeglow.
EOF
}

choose_settings() {
  set_defaults
  ui_yesno "${APP}" "This creates a new LXC container on this Proxmox host and installs ${APP} in it: Debian 12, Docker, and the ${APP} containers.\n\nNothing is changed until you confirm the settings at the end." "Continue" "Exit" \
    || exit_cancelled

  local mode
  while true; do
    mode="$(ui_menu "Settings" "Use the recommended settings, or choose each one?" default \
      default "Recommended: next free ID, 6 GB, 2 cores, 2048 MB, DHCP" \
      advanced "Advanced: choose ID, storage, network, time zone, ...")" || exit_cancelled
    if [[ "$mode" == advanced ]]; then
      advanced_settings || continue
    else
      set_defaults
    fi
    default_storage || continue
    # "Change settings" walks the wizard with every current choice filled in;
    # Back off its first step returns to the Recommended/Advanced choice.
    while ! ui_yesno "Ready to install" "$(summary_text)" "Install" "Change settings"; do
      advanced_settings || continue 2
    done
    return 0
  done
}

# ============================================================================
# Install
# ============================================================================
install_homeglow() {
  # --- ensure a Debian 12 template is available ------------------------------
  msg_info "Ensuring the Debian 12 LXC template is available"
  pveam update >/dev/null 2>&1 || true
  local template
  template="$(pveam available --section system 2>/dev/null | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)"
  [[ -n "$template" ]] || die "Could not find a debian-12-standard template via 'pveam available'."
  if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$template"; then
    msg_info "Downloading ${template} to ${TEMPLATE_STORAGE}"
    pveam download "$TEMPLATE_STORAGE" "$template" >/dev/null || die "Template download failed."
  fi
  msg_ok "Template ready: ${template}"

  # --- create + start the container ------------------------------------------
  local net="name=eth0,bridge=${BRIDGE}"
  if [[ "$NET_MODE" == static ]]; then
    net+=",ip=${IPV4_CIDR},gw=${GATEWAY}"
  else
    net+=",ip=dhcp"
  fi
  [[ -n "$VLAN" ]] && net+=",tag=${VLAN}"

  # nesting + keyctl are required to run Docker inside an unprivileged LXC.
  msg_info "Creating LXC ${CTID} (${CT_HOSTNAME})"
  pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${template}" \
    --hostname "$CT_HOSTNAME" \
    --cores "$CORES" \
    --memory "$RAM_MB" \
    --rootfs "${STORAGE}:${DISK_GB}" \
    --net0 "$net" \
    --features "nesting=1,keyctl=1" \
    --unprivileged 1 \
    --onboot 1 \
    --timezone "$TZ_NAME" \
    >/dev/null || die "pct create failed."
  CT_CREATED=1
  msg_ok "Container created"

  msg_info "Starting container"
  pct start "$CTID" >/dev/null || die "pct start failed."
  # Wait for an address and working DNS before installing anything.
  local online=0
  for _ in $(seq 1 30); do
    if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then online=1; break; fi
    sleep 2
  done
  (( online )) || die "The container has no network after 60 seconds. Check the bridge (${BRIDGE}), DHCP or static address, and VLAN."
  msg_ok "Container started"

  # --- provision inside the container ----------------------------------------
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
TZ=${TZ_NAME}
FRONTEND_PORT=${FRONTEND_PORT}
ENCRYPTION_KEY=\$(openssl rand -base64 32)
EOF"
  run "cd /opt/homeglow && docker compose pull >/dev/null 2>&1 && docker compose up -d >/dev/null 2>&1" \
    || die "docker compose up failed."
  msg_ok "${APP} deployed"

  # --- done ------------------------------------------------------------------
  local ip
  if [[ "$NET_MODE" == static ]]; then
    ip="${IPV4_CIDR%/*}"
  else
    ip="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo
  msg_ok "${APP} is installed in LXC ${CTID}."
  echo -e "   Open:  ${GN}http://${ip:-<container-ip>}:${FRONTEND_PORT}${CL}"
  echo -e "   Shell: ${YW}pct enter ${CTID}${CL}"
  echo -e "   Update later:  ${YW}pct exec ${CTID} -- sh -c 'cd /opt/homeglow && docker compose pull && docker compose up -d'${CL}"
  echo
}

main() {
  # --- preflight -------------------------------------------------------------
  [[ "$(id -u)" -eq 0 ]] || { msg_err "Run as root on the Proxmox VE host."; exit 1; }
  command -v pveversion >/dev/null 2>&1 || { msg_err "This must be run on a Proxmox VE host (pveversion not found)."; exit 1; }
  command -v pct >/dev/null 2>&1 || { msg_err "pct not found — is this a Proxmox VE host?"; exit 1; }

  (( $(storage_count rootdir) > 0 )) || { msg_err "No active storage on this host accepts container disks (content type 'rootdir')."; exit 1; }
  (( $(storage_count vztmpl) > 0 )) || { msg_err "No active storage on this host accepts container templates (content type 'vztmpl')."; exit 1; }

  choose_settings
  clear_screen
  echo -e "\n${GN}=== Installing ${APP} ===${CL}\n"
  summary_text | sed -n '1,8p'
  echo
  install_homeglow
}

# The tests source this file for its functions without running the installer.
[[ "${HOMEGLOW_INSTALLER_SOURCED:-0}" == 1 ]] || main "$@"
