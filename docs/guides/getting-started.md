# Getting Started (Local Development)

This guide gets HomeGlow running on your machine with hot reload so you can start
contributing. There are two ways to develop: **native (npm)** for fast frontend
iteration, or **Docker** for a production-like setup.

## Prerequisites

- **Node.js 20+** (backend Dockerfile uses Node 24; CI uses Node 20).
- **npm**.
- A C toolchain for `better-sqlite3` native build (usually preinstalled; on Linux
  you may need `python3`, `make`, `g++`).
- Optional: **Docker + Docker Compose** for the containerized path.
- Optional API access: an **OpenWeatherMap** key (weather + auto dark mode), a
  **calendar** source (ICS/CalDAV/Google), an **Immich** instance (photos).

## Option A — Native (npm) with hot reload

### 1. Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment
Create `server/.env`:
```env
PORT=5001
TZ=America/New_York
# Optional but recommended so credentials encrypt/decrypt consistently:
# ENCRYPTION_KEY=<openssl rand -base64 32>
```

Create `client/.env`:
```env
VITE_REACT_APP_API_URL=http://localhost:5001
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here
```

> **Port note:** the client's dev default expects the backend on **5001**
> (`apiConfig.js` falls back to `http://localhost:5001` in dev). Set `PORT=5001` in
> `server/.env` to match, or point `VITE_REACT_APP_API_URL` wherever your backend runs.

### 3. Run both servers
```bash
# Terminal 1 — backend
cd server && npm start          # node index.js, listens on PORT (5001)

# Terminal 2 — frontend
cd client && npm run dev        # Vite dev server (hot reload)
```

Open the URL Vite prints (typically `http://localhost:5173`). The SQLite database
and its schema are created automatically on first backend start
(`server/data/tasks.db`).

## Option B — Docker (production-like)

Build and run both containers locally:
```bash
git clone https://github.com/jherforth/homeglow.git && cd homeglow
docker compose -f docker-compose-dev.yml up --build
```
- Frontend: `http://localhost:3001` (`DEV_FRONTEND_PORT`)
- Backend: `http://localhost:5001` (`DEV_BACKEND_PORT`)

Data persists under `./homeglowdev/data` and `./homeglowdev/uploads`. Rebuild after
code changes: `docker compose -f docker-compose-dev.yml up -d --build`.

## First-run experience

On first load, the dashboard shows a **welcome card** prompting you to open Settings
(the HomeGlow logo in the bottom dock) and enable widgets. Until you enable and
assign widgets to a tab, the dashboard is intentionally empty.

Remember: configuration is **per device**. Your browser gets a random device name in
`localStorage`; clearing storage creates a fresh, unconfigured device.

## Running tests

```bash
# Frontend (Vitest)
cd client && npm test

# Backend (node:test runner)
cd server && npm test
```

See [Contributing](contributing.md) for conventions and the migration workflow, and
[Configuration](../reference/configuration.md) for the full list of settings.
