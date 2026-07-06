#!/usr/bin/env bash
# Copyright (c) 2021-2025 community-scripts ORG
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
$STD apt-get install -y ca-certificates curl openssl
msg_ok "Installed Dependencies"

msg_info "Installing Docker"
$STD curl -fsSL https://get.docker.com | sh
$STD systemctl enable --now docker
msg_ok "Installed Docker"

msg_info "Deploying HomeGlow"
mkdir -p /opt/homeglow
curl -fsSL "${REPO_RAW}/docker-compose.yml" -o /opt/homeglow/docker-compose.yml
cat >/opt/homeglow/.env <<EOF
TZ=${tz:-America/New_York}
FRONTEND_PORT=3000
ENCRYPTION_KEY=$(openssl rand -base64 32)
EOF
cd /opt/homeglow
$STD docker compose pull
$STD docker compose up -d
msg_ok "Deployed HomeGlow"

motd_ssh
customize

msg_info "Cleaning up"
$STD apt-get -y autoremove
$STD apt-get -y autoclean
msg_ok "Cleaned"
