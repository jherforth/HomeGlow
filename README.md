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
   git clone https://github.com/your-username/homeglow.git
   cd homeglow
