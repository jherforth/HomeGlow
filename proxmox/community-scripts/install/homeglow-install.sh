#!/usr/bin/env bash
# Copyright (c) 2026 community-scripts ORG
# Author: jherforth
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/jherforth/HomeGlow

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

REPO_RAW="https://raw.githubusercontent.com/jherforth/HomeGlow/main"

msg_info "Installing Dependencies"
$STD apt-get install -y ca-certificates curl openssl gnupg
msg_ok "Installed Dependencies"

msg_info "Installing Docker"
# Docker's own signed apt repository, its key checked against the fingerprint
# Docker publishes, rather than the get.docker.com convenience script.
DOCKER_KEY_FINGERPRINT="9DC858229FC7DD38854AE2D88D81803C0EBFCD88"
OS_ID="$(. /etc/os-release && echo "$ID")"
OS_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" -o /etc/apt/keyrings/docker.asc
if [[ "$(gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc 2>/dev/null | awk -F: '/^fpr:/ { print $10; exit }')" != "$DOCKER_KEY_FINGERPRINT" ]]; then
  rm -f /etc/apt/keyrings/docker.asc
  msg_error "Docker's signing key does not match its published fingerprint"
  exit 1
fi
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${OS_ID} ${OS_CODENAME} stable" >/etc/apt/sources.list.d/docker.list
$STD apt-get update
$STD apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
$STD systemctl enable --now docker
msg_ok "Installed Docker"

msg_info "Deploying HomeGlow"
mkdir -p /opt/homeglow
curl -fsSL "${REPO_RAW}/docker-compose.yml" -o /opt/homeglow/docker-compose.yml
# .env holds ENCRYPTION_KEY, which decrypts every stored password and token:
# readable by root only.
(
  umask 077
  cat >/opt/homeglow/.env <<EOF
TZ=${tz:-America/New_York}
FRONTEND_PORT=3000
ENCRYPTION_KEY=$(openssl rand -base64 32)
EOF
)
chmod 600 /opt/homeglow/.env
cd /opt/homeglow || exit
$STD docker compose pull
$STD docker compose up -d
msg_ok "Deployed HomeGlow"

motd_ssh
customize

msg_info "Cleaning up"
$STD apt-get -y autoremove
$STD apt-get -y autoclean
msg_ok "Cleaned"
