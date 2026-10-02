#!/usr/bin/env bash
# Tests for proxmox/install-homeglow.sh without a Proxmox host.
#
# Each scenario runs the real installer against a fake host: stub pct, pvesh,
# pvesm, pveam, ip and timedatectl that log what they were asked and answer
# from fixtures, and a scripted whiptail that records every dialog and replies
# with the next canned answer. Assertions read those logs.
#
#   bash proxmox/tests/install-homeglow.test.sh
#
# Runs in CI on Ubuntu. Needs bash, coreutils and awk; not whiptail or Proxmox.

# The stub bodies below are single-quoted on purpose: they expand when the
# stub runs, not when it is written.
# shellcheck disable=SC2016

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="$HERE/../install-homeglow.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASSED=0
FAILED=0
CURRENT=""

# --- the fake host -------------------------------------------------------------
STUBS="$WORK/stubs"
mkdir -p "$STUBS"

stub() { # stub <name> <body>
  printf '#!/usr/bin/env bash\n%s\n' "$2" >"$STUBS/$1"
  chmod +x "$STUBS/$1"
}

stub id 'if [[ "${1:-}" == -u ]]; then echo 0; else command -p id "$@"; fi'
stub pveversion 'echo "pve-manager/9.0.3/abcdef (running kernel: 6.14.8-2-pve)"'
stub nproc 'echo 8'
stub sleep ':'
stub clear ':'
stub timedatectl 'echo "${MOCK_HOST_TZ:-Europe/Berlin}"'

stub pvesh '
case "$*" in
  "get /cluster/nextid") echo 105 ;;
  "get /cluster/nextid --vmid "*)
    id="${!#}"
    if [[ " ${MOCK_USED_IDS:-100 101 102 103 104} " == *" $id "* ]]; then
      echo "VM $id already exists" >&2; exit 2
    fi
    echo "$id" ;;
  *) echo "pvesh stub: unexpected $*" >&2; exit 1 ;;
esac'

# pvesm status -content <type>: a header, then one row per pool from the
# fixture, in KiB like the real command.
stub pvesm '
[[ "$1 $2" == "status -content" ]] || { echo "pvesm stub: unexpected $*" >&2; exit 1; }
echo "Name             Type     Status           Total            Used       Available        %"
cat "$MOCK_DIR/storage-$3.txt" 2>/dev/null || true'

stub pveam '
case "$1" in
  update|download) exit 0 ;;
  available) echo "system          debian-12-standard_12.7-1_amd64.tar.zst" ;;
  list) exit 0 ;;
esac'

stub ip '
if [[ "$*" == "-o link show type bridge" ]]; then
  cat "$MOCK_DIR/bridges.txt"
elif [[ "$1 $2 $3" == "link show dev" ]]; then
  grep -q ": $4:" "$MOCK_DIR/bridges.txt"
else
  echo "ip stub: unexpected $*" >&2; exit 1
fi'

stub pct '
printf "%q " "$@" >>"$MOCK_DIR/pct.log"; echo >>"$MOCK_DIR/pct.log"
case "$1" in
  exec)
    shift 3
    # Skip an `env VAR=value ...` prefix to find the real command.
    if [[ "$1" == env ]]; then shift; while [[ "$1" == *=* ]]; do shift; done; fi
    case "$1" in
      getent) exit "${MOCK_NET_RC:-0}" ;;
      hostname) echo "192.168.1.77" ;;
      bash)
        if [[ -n "${MOCK_FAIL_PATTERN:-}" && "$3" == *"$MOCK_FAIL_PATTERN"* ]]; then exit 1; fi ;;
    esac ;;
esac
exit 0'

# Scripted whiptail. $MOCK_DIR/answers holds one reply per dialog:
#   "<exit code> <value>"   value "=" means "accept what the dialog offered".
# Every dialog is logged as "kind|title|detail" to $MOCK_DIR/ui.log.
stub whiptail '
args=("$@"); kind=""; title=""; rest=()
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[$i]}" in
    --title) title="${args[$((i + 1))]}" ;;
    --default-item) default="${args[$((i + 1))]}" ;;
    --menu|--inputbox|--yesno|--msgbox) kind="${args[$i]#--}"; rest=("${args[@]:$((i + 1))}"); break ;;
  esac
done
detail=""
case "$kind" in
  menu) for ((j = 4; j < ${#rest[@]}; j += 2)); do detail+="${rest[$j]} "; done; offered="${default:-}" ;;
  inputbox) detail="default=${rest[3]:-}"; offered="${rest[3]:-}" ;;
esac
n=$(( $(cat "$MOCK_DIR/answer-count" 2>/dev/null || echo 0) + 1 ))
echo "$n" >"$MOCK_DIR/answer-count"
echo "$kind|$title|$detail" >>"$MOCK_DIR/ui.log"
line="$(sed -n "${n}p" "$MOCK_DIR/answers")"
if [[ -z "$line" ]]; then
  echo "OUT OF ANSWERS at dialog $n ($kind|$title)" >>"$MOCK_DIR/ui.log"
  kill -TERM "$PPID" 2>/dev/null; exit 255
fi
rc="${line%% *}"; value="${line#* }"; [[ "$line" == "$rc" ]] && value=""
[[ "$value" == "=" ]] && value="${offered:-}"
[[ "$kind" == menu || "$kind" == inputbox ]] && printf "%s" "$value" >&2
exit "$rc"'

# Zone names the fake host knows.
ZONEINFO="$WORK/zoneinfo"
mkdir -p "$ZONEINFO/Europe" "$ZONEINFO/Asia" "$ZONEINFO/America"
touch "$ZONEINFO/Europe/Berlin" "$ZONEINFO/Asia/Tokyo" "$ZONEINFO/America/Chicago"

# --- scenario plumbing ---------------------------------------------------------
# Host shapes. Rows: name type status total used available pct (KiB).
host_lvm() {
  cat >"$MOCK_DIR/storage-rootdir.txt" <<'EOF'
local-lvm         lvmthin     active        98304000         1048576        97255424    1.07%
EOF
  cat >"$MOCK_DIR/storage-vztmpl.txt" <<'EOF'
local             dir         active        65536000        10485760        55050240   16.00%
EOF
  cat >"$MOCK_DIR/bridges.txt" <<'EOF'
4: vmbr0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT group default qlen 1000\    link/ether aa:bb:cc:dd:ee:01 brd ff:ff:ff:ff:ff:ff
EOF
}

# A ZFS install: no local-lvm at all, a second pool, a second bridge, and a
# firewall bridge Proxmox made for some guest.
host_zfs() {
  cat >"$MOCK_DIR/storage-rootdir.txt" <<'EOF'
local-zfs         zfspool     active       450000000        20000000       430000000    4.44%
tank              zfspool     active      3800000000      100000000      3700000000    2.63%
offline           nfs         inactive             0               0               0    0.00%
EOF
  cat >"$MOCK_DIR/storage-vztmpl.txt" <<'EOF'
local             dir         active        65536000        10485760        55050240   16.00%
nas-templates     nfs         active      1000000000       100000000       900000000   10.00%
EOF
  cat >"$MOCK_DIR/bridges.txt" <<'EOF'
4: vmbr0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT
5: vmbr1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT
9: fwbr101i0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT
EOF
}

# scenario <name> <host> <answers...>   (then call run_installer)
scenario() {
  CURRENT="$1"
  MOCK_DIR="$WORK/$1"
  mkdir -p "$MOCK_DIR"
  "$2"
  shift 2
  printf '%s\n' "$@" >"$MOCK_DIR/answers"
  : >"$MOCK_DIR/ui.log"
  : >"$MOCK_DIR/pct.log"
}

# run_installer [ui] [stdin]
run_installer() {
  local ui="${1:-whiptail}" input="${2:-}"
  # The subshell is the point: these reach the installer and nothing else.
  # shellcheck disable=SC2030
  (
    export MOCK_DIR HOMEGLOW_UI="$ui" ZONEINFO_DIR="$ZONEINFO" PATH="$STUBS:$PATH"
    printf '%b' "$input" | timeout 30 bash "$INSTALLER"
  ) >"$MOCK_DIR/out.txt" 2>&1
  RC=$?
}

# --- assertions ----------------------------------------------------------------
pass() { PASSED=$((PASSED + 1)); echo "  ok    $CURRENT: $1"; }
fail() {
  FAILED=$((FAILED + 1)); echo "  FAIL  $CURRENT: $1"
  echo "        --- dialogs ---"; sed 's/^/        /' "$MOCK_DIR/ui.log"
  echo "        --- pct ---"; sed 's/^/        /' "$MOCK_DIR/pct.log"
  echo "        --- output ---"; tail -n 15 "$MOCK_DIR/out.txt" | sed 's/^/        /'
}
check() { # check <description> <command...>
  local what="$1"; shift
  if "$@"; then pass "$what"; else fail "$what"; fi
}
has()      { grep -qF -- "$2" "$MOCK_DIR/$1"; }
lacks()    { ! grep -qF -- "$2" "$MOCK_DIR/$1"; }
rc_is()    { [[ "$RC" == "$1" ]]; }
# Every command run inside the container through bash -c forces the C.UTF-8
# locale, so the host's LANG cannot make apt and perl warn.
execs_use_c_locale() {
  grep -F -- 'bash -c' "$MOCK_DIR/pct.log" | grep -vqF 'LC_ALL=C.UTF-8' && return 1
  grep -qF -- 'bash -c' "$MOCK_DIR/pct.log"
}
has_escape() { grep -q $'\033' "$MOCK_DIR/out.txt"; }
no_escape() { ! has_escape; }
# The dialog shown right after the one whose title is $1.
next_title() { awk -F'|' -v t="$1" 'found { print $2; exit } $2 == t { found = 1 }' "$MOCK_DIR/ui.log"; }
title_after() { [[ "$(next_title "$1")" == "$2" ]]; }

# ==============================================================================
echo "install-homeglow.sh"

# Validators, sourced without running the installer. A subshell keeps the
# installer's functions and settings out of this script.
validators_ok() (
  export HOMEGLOW_INSTALLER_SOURCED=1
  # shellcheck source-path=SCRIPTDIR source=../install-homeglow.sh
  source "$INSTALLER"
  ZONEINFO_DIR="$ZONEINFO"
  set +e
  ok=1
  valid_cidr 192.168.1.50/24 || ok=0
  valid_cidr 192.168.1.50 && ok=0
  valid_cidr 192.168.1.256/24 && ok=0
  valid_cidr 10.0.0.5/33 && ok=0
  valid_ipv4 10.0.0.1 || ok=0
  valid_ipv4 1.2.3 && ok=0
  valid_hostname homeglow || ok=0
  valid_hostname home-glow-2 || ok=0
  valid_hostname -homeglow && ok=0
  valid_hostname bad_name && ok=0
  in_range 08 1 10 || ok=0
  in_range 0 1 10 && ok=0
  in_range abc 1 10 && ok=0
  valid_timezone Europe/Berlin || ok=0
  valid_timezone Mars/Olympus && ok=0
  valid_timezone ../../etc/passwd && ok=0
  (( ok ))
)
CURRENT="validators"
MOCK_DIR="$WORK/validators"; mkdir -p "$MOCK_DIR"; : >"$MOCK_DIR/ui.log"; : >"$MOCK_DIR/pct.log"; : >"$MOCK_DIR/out.txt"
check "accept good input and reject bad" validators_ok

# ------------------------------------------------------------------------------
scenario recommended host_lvm \
  "0" \
  "0 default" \
  "0"
LANG=en_US.UTF-8 run_installer
check "exits cleanly" rc_is 0
check "shows the banner" has out.txt '/_/ /_/\____/_/ /_/ /_/\___/'
check "draws it in the logo's colors" has out.txt $'\033[38;2;69;114;153m'
check "lists the settings being used" has out.txt "Using recommended settings"
check "runs container commands in C.UTF-8" execs_use_c_locale
check "installs the locales package" has pct.log "openssl\ locales"
check "generates the host's locale in the container" has pct.log "WANT_LANG=en_US.UTF-8"
check "asks nothing about storage when there is one pool" lacks ui.log "Container disk storage"
check "uses the only pool" has pct.log "local-lvm:6"
check "uses the next free ID" has pct.log "create 105 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"
check "DHCP on vmbr0" has pct.log "name=eth0\\,bridge=vmbr0\\,ip=dhcp"
check "takes the host's time zone from systemd" has pct.log "--timezone Europe/Berlin"
check "writes the zone into HomeGlow's .env" has pct.log "TZ=Europe/Berlin"
check "prints the address" has out.txt "http://192.168.1.77:3000"

# ------------------------------------------------------------------------------
scenario no-color host_lvm \
  "0" \
  "0 default" \
  "0"
NO_COLOR=1 LANG=C.UTF-8 run_installer
check "exits cleanly" rc_is 0
check "still shows the banner" has out.txt '/_/ /_/\____/_/ /_/ /_/\___/\____/_/\____/|__/|__/'
check "without a single escape code" no_escape
check "leaves a C locale alone" lacks pct.log "WANT_LANG"

# ------------------------------------------------------------------------------
scenario zfs-pick-storage host_zfs \
  "0" \
  "0 default" \
  "0 tank" \
  "0"
run_installer
check "exits cleanly" rc_is 0
check "offers the active pools, not inactive ones" has ui.log "menu|Container disk storage|local-zfs tank "
check "installs on the chosen pool" has pct.log "tank:6"
check "keeps templates on local when offered" has pct.log "local:vztmpl/"

# Back on that storage list returns to the Recommended/Advanced choice.
scenario zfs-storage-back host_zfs \
  "0" \
  "0 default" \
  "1" \
  "0 default" \
  "0 local-zfs" \
  "0"
run_installer
check "exits cleanly" rc_is 0
check "Back from storage returns to the settings choice" title_after "Container disk storage" "Settings"
check "installs on the pool chosen second time round" has pct.log "local-zfs:6"

# ------------------------------------------------------------------------------
scenario advanced host_zfs \
  "0" \
  "0 advanced" \
  "0 abc" "0" \
  "0 101" "0" \
  "0 120" \
  "0 bad_name" "0" \
  "0 glow" \
  "0 =" \
  "0 99" "0" \
  "0 4" \
  "0 =" \
  "1" \
  "0 =" \
  "0 tank" \
  "0 local" \
  "0 vmbr1" \
  "0 static" "0 10.0.0.5/33" "0" \
  "0 static" "0 10.0.0.5/24" "0 10.0.0.1" "0 20" \
  "0 Mars/Base" "0" \
  "0 Asia/Tokyo" \
  "0 =" \
  "0"
run_installer
check "exits cleanly" rc_is 0
check "rejects a non-numeric ID" has ui.log "msgbox|Invalid ID|"
check "rejects an ID a VM or container already has" has ui.log "msgbox|ID in use|"
check "rejects an invalid hostname" has ui.log "msgbox|Invalid hostname|"
check "caps cores at what the host has" has ui.log "msgbox|Invalid core count|"
check "Back from storage returns to memory" title_after "Container disk storage" "Memory"
check "lists real bridges, not firewall bridges" has ui.log "menu|Network bridge|vmbr0 vmbr1 other "
check "rejects a /33 prefix" has ui.log "msgbox|Invalid address|"
check "rejects an unknown time zone" has ui.log "msgbox|Unknown time zone|"
check "creates the container as chosen" has pct.log "create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst --hostname glow --cores 4 --memory 2048 --rootfs tank:6"
check "static address, gateway and VLAN on the chosen bridge" has pct.log "name=eth0\\,bridge=vmbr1\\,ip=10.0.0.5/24\\,gw=10.0.0.1\\,tag=20"
check "chosen time zone" has pct.log "--timezone Asia/Tokyo"
check "prints the static address" has out.txt "http://10.0.0.5:3000"

# ------------------------------------------------------------------------------
# One pool of each kind: storage steps answer themselves, and Back must pass
# through them instead of bouncing forward again.
scenario back-through-auto-steps host_lvm \
  "0" \
  "0 advanced" \
  "0 =" "0 =" "0 =" "0 =" "0 =" \
  "1" \
  "0 =" \
  "0 vmbr0" \
  "0 dhcp" "0 =" \
  "0 =" \
  "0 =" \
  "0"
run_installer
check "exits cleanly" rc_is 0
check "Back from the bridge skips the single-pool steps" title_after "Network bridge" "Memory"
check "never shows a storage menu" lacks ui.log "Container disk storage"

# ------------------------------------------------------------------------------
scenario change-settings host_lvm \
  "0" \
  "0 default" \
  "1" \
  "0 =" "0 kiosk" "0 =" "0 =" "0 =" \
  "0 vmbr0" \
  "0 dhcp" "0 =" \
  "0 =" \
  "0 8080" \
  "0"
run_installer
check "exits cleanly" rc_is 0
check "Change settings opens the wizard" title_after "Ready to install" "Container ID"
check "uses the changed values" has pct.log "--hostname kiosk"
check "uses the changed port" has pct.log "FRONTEND_PORT=8080"

# ------------------------------------------------------------------------------
scenario cancel host_lvm \
  "1"
run_installer
check "exits cleanly" rc_is 0
check "says nothing changed" has out.txt "Installation cancelled. Nothing was changed."
check "creates nothing" lacks pct.log "create"

# ------------------------------------------------------------------------------
scenario failure-cleanup host_lvm \
  "0" "0 default" "0" \
  "0"
MOCK_FAIL_PATTERN="get.docker.com" run_installer
check "exits with an error" rc_is 1
check "asks about the half-installed container" has ui.log "yesno|Installation failed|"
check "removes it when asked" has pct.log "destroy 105 --purge"
check "says what failed" has out.txt "Docker install failed."

# ------------------------------------------------------------------------------
scenario no-network-keep host_lvm \
  "0" "0 default" "0" \
  "1"
MOCK_NET_RC=1 run_installer
check "exits with an error" rc_is 1
check "explains the network problem" has out.txt "has no network after 60 seconds"
check "keeps the container when asked" lacks pct.log "destroy"
check "says how to remove it later" has out.txt "pct destroy 105 --purge"

# ------------------------------------------------------------------------------
scenario plain-prompts host_zfs
run_installer plain "\n\n2\n\n"
check "exits cleanly" rc_is 0
check "numbered storage choice" has pct.log "tank:6"
check "lists choices as text" has out.txt "2) tank"

# ------------------------------------------------------------------------------
# Input runs out mid-way (Ctrl-D, a closed pipe). It must stop as a cancel, not
# take the cancel message as an answer and re-ask forever.
scenario plain-input-runs-out host_lvm
run_installer plain "\n"
check "stops instead of looping" rc_is 0
check "says nothing changed" has out.txt "Installation cancelled. Nothing was changed."
check "creates nothing" lacks pct.log "create"

# Once a container exists, running out of input is a "no", not a cancel.
scenario plain-input-runs-out-after-create host_lvm
MOCK_FAIL_PATTERN="get.docker.com" run_installer plain "\n\n\n"
check "exits with an error" rc_is 1
check "keeps the container" lacks pct.log "destroy"
check "does not claim nothing changed" lacks out.txt "Nothing was changed"

# ------------------------------------------------------------------------------
echo
echo "${PASSED} passed, ${FAILED} failed"
(( FAILED == 0 ))
