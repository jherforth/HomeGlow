# Contributing

We welcome contributions! Here's how to get started:

1. **Fork the Repository**
2. **Create a Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Make Your Changes**: Follow the existing code style
4. **Test Thoroughly**: Ensure both light/dark themes work
5. **Submit a Pull Request**: Describe your changes clearly

## Development Guidelines
- **Follow existing patterns** for consistency
- **Test on multiple screen sizes** (mobile, tablet, desktop)
- **Verify theme compatibility** (light/dark modes)
- **Update documentation** for new features
- **Add error handling** for robust operation

## Workflow

You can use docker compose like building from source, or you can run the app directly with npm.


For local development with hot reloading:

#### Step 1: Install Dependencies
```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

#### Step 2: Configure Environment
Create `server/.env`:
```env
PORT=5000
```

Create `client/.env`:
```env
VITE_REACT_APP_API_URL=http://localhost:5000
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here
```

#### Step 3: Run Development Servers
```bash
# Terminal 1 - Backend
cd server
npm start

# Terminal 2 - Frontend
cd client
npm run dev
```

You'll want to edit the env variable PORT and set it to 5001 since the client on port 3001 will look for a server existing on port 5001
