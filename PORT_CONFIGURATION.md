# Port Configuration Guide

## Overview
The application uses environment variables to configure ports for both the backend server and frontend client.

## Environment Variables

Edit the `.env` file in the project root to configure ports:

```env
# Backend Server Port
PORT=5001

# Frontend API URL (should match backend port)
VITE_REACT_APP_API_URL=http://localhost:5001
```

## How It Works

### Backend (Server)
- The server reads the `PORT` environment variable from `.env`
- Default port is 5001 if `PORT` is not set
- Server listens on `0.0.0.0` to accept connections from all interfaces

### Frontend (Client)
- The client reads `VITE_REACT_APP_API_URL` during build time
- This URL must match the backend server port
- **Important**: You must rebuild the client after changing this variable

## Changing Ports

1. Edit `.env` and update both variables to use the same port:
   ```env
   PORT=3000
   VITE_REACT_APP_API_URL=http://localhost:3000
   ```

2. Restart the backend server:
   ```bash
   cd server
   node index.js
   ```

3. Rebuild the frontend:
   ```bash
   cd client
   npm run build
   ```

## Quick Start

Use the provided startup script:
```bash
./start-server.sh
```

This script automatically loads environment variables and starts the server on the configured port.
