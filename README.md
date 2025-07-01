# HomeGlow
Self hosted home display project to be deployed in docker

**HomeGlow** is an open-source, self-hosted dashboard app designed for touch-enabled displays, inspired by Magic Mirror. It provides a modular, browser-based interface to display tasks, calendars, photos, and more, integrating with self-hosted services like Nextcloud Calendar and Immich, with a custom chore module for family use. Optimized for Linux, HomeGlow is lightweight, customizable, and perfect for home servers or Raspberry Pi setups.

## Features
- **Touch-Friendly Interface**: Built with React and touch gesture support for seamless interaction on touch screens.
- **Modular Design**: Displays widgets for calendars, photos, and chores, with easy extensibility for custom modules.
- **Self-Hosted Integrations**:
  - **Nextcloud Calendar**: Fetches events via CalDAV.
  - **Immich**: Displays photos using Immich's REST API.
  - **Chore Module**: Manages family chores with a simple database-driven system.
- **Database Support**: Uses SQLite for lightweight task and user data storage (PostgreSQL support planned).
- **Linux Optimized**: Deployable via Docker for easy setup on Ubuntu, Raspberry Pi OS, or other Linux distributions.
- **Open Source**: Licensed under the MIT License, encouraging community contributions.

## Getting Started

### Prerequisites
- **Node.js** (v18 or higher)
- **Docker** and **Docker Compose** (recommended for deployment)
- **Linux Server** (e.g., Ubuntu 22.04 or Raspberry Pi OS) for hosting
- **Nextcloud** and **Immich** instances (optional, for integrations)
- **Git** for cloning the repository

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/jherforth/homeglow.git
   cd homeglow

2. **update server/.env**:
  PORT=5000
  NEXTCLOUD_URL=https://your-nextcloud-instance.com
  NEXTCLOUD_USERNAME=your-username
  NEXTCLOUD_PASSWORD=your-password
  IMMICH_URL=https://your-immich-instance.com
  IMMICH_API_KEY=your-immich-api-key

3. **update client/.env**
  REACT_APP_API_URL=http://backend:5000

4. **run the build**
  ```bash
  docker-compose up --build -d

5. **access your app**
  http://your-server-ip:3000

6. **secure with nginx and certbot**
  ```bash
  sudo apt update
  sudo apt install nginx certbot python3-certbot-nginx

7. **configure nginx /etc/nginx/sites-available/homeglow**

  server {
      listen 80;
      server_name your-domain.com;
      location / {
          proxy_pass http://localhost:3000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
      location /api {
          proxy_pass http://localhost:5000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }

8. **enable and secure**
  ```bash
  sudo ln -s /etc/nginx/sites-available/homeglow /etc/nginx/sites-enabled/
  sudo systemctl restart nginx
  sudo certbot --nginx -d your-domain.com

### Optional:

1. **install dependencies**
  ```bash
  cd server
  npm install
  cd ../client
  npm install

2. **run backend**
  ```bash
  cd server
  npm start

3. **run frontend**
  ```bash
  cd client
  npm start