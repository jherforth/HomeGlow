<img width="252" height="199" alt="Image" src="https://github.com/user-attachments/assets/b75dbb9d-8abc-4c86-b5a3-c0083395e413" />

Discord: https://discord.gg/wFJEna8AdC

# HomeGlow

**A Smart, Self-Hosted Dashboard for Your Home**

HomeGlow is an open-source, self-hosted dashboard application designed for touch-enabled displays, drawing inspiration from projects like Magic Mirror. It offers a modular, browser-based interface to centralize and display essential home information, integrating with self-hosted services and providing custom modules for family management. Optimized for Linux environments (e.g., Raspberry Pi, Proxmox VMs), HomeGlow is lightweight, highly customizable, and perfect for creating a dynamic home hub.

<img width="1610" height="946" alt="Image" src="https://github.com/user-attachments/assets/65796c77-b095-481f-a92e-180f0689378b" />

## ✨ Features

HomeGlow is built with a focus on modern aesthetics, user experience, and practical utility, incorporating advanced features to prevent screen burn-in and enhance daily interactions.

### Core Design & Experience
-   **Web 3.0 Inspired Design**: A futuristic interface featuring glassmorphism effects, vibrant neon gradients, and bold typography for a visually stunning experience.
-   **Dynamic Theming**: Seamlessly toggle between beautiful Light and Dark modes, with your preference intelligently saved in local storage.
-   **Touch-Friendly Interface**: Designed from the ground up for touchscreens, allowing intuitive interaction with all widgets and controls.
-   **Burn-in Prevention**: Advanced features to protect your display from static image burn-in:
    -   **Configurable Screen Refresh**: Set automatic page refreshes at intervals of 1, 3, 6, 9, or 12 hours, or opt for manual-only refresh. This ensures dynamic content updates and prevents static elements from remaining on screen too long.
    -   **Random Geometric Backgrounds**: Enable a toggle in the Admin Panel to display unique, randomly generated geometric patterns as the background. These patterns are consistent across light/dark modes and regenerate on each page refresh.
    -   **Dynamic Card Shuffle**: Randomize the layout of your main widgets (Calendar, Photos, Weather, Menu) to prevent static element placement. The Chores Widget intelligently shifts its position (top or bottom) to further mitigate burn-in.

### Enhanced Widgets
-   **Calendar Widget**:
    -   **Multi-Source Calendar Support**: Connect multiple calendars simultaneously from different sources.
    -   **ICS & CalDAV Integration**: Supports both public ICS links (Google Calendar, Apple Calendar, etc.) and private CalDAV servers with authentication.
    -   **Individual Calendar Management**: Enable/disable specific calendars, customize colors for each source, and test connections independently.
    -   **Color-Coded Events**: Each calendar source displays with its own custom color for easy identification.
    -   **Month & Week Views**: Seamlessly toggle between a traditional month view and a dynamic week view with intuitive navigation controls.
    -   **Sleek Week View**: Clean, organized 7-day view with colored bullet indicators showing calendar source, equalized row heights, and hover effects for better usability.
    -   **Current Day Highlight**: Visually emphasizes the current day in both month and week views for quick reference.
    -   **Interactive Event Details**: Click any event to view detailed information including time, location, and description.
    -   **Customizable Event Styling**: Set default colors for events in the settings panel with live preview.
-   **Menu Widget**:
    -   **Intuitive Edit/View Modes**: Easily switch between a clean display mode and an interactive editing mode for managing your weekly meal plans.
    -   **Multi-Item Support**: Add multiple menu items per day, allowing for detailed meal planning.
    -   **Current Day Emphasis**: Highlights the current day's menu for immediate focus.
-   **Chores Widget**:
    -   **User-Centric Task Management**: Assign and track chores for multiple users, with visual progress indicators.
    -   **Clam Reward System**: Users earn "clams" (a customizable reward currency) upon completing all their daily chores.
    -   **Swipe-to-Complete**: Mark chores as complete with a simple swipe gesture (on touch-enabled devices).
    -   **Bonus Chore System**: Create special bonus chores with custom clam rewards that users can claim and complete for extra rewards.
-   **Photo Widget**: Integrates with self-hosted Immich instances to display your personal photo library.
-   **Weather Widget**: Provides current weather conditions and a 3-day forecast for a specified zip code, including interactive temperature and precipitation graphs.
-   **Custom Widget System**: Upload and manage custom HTML widgets through the Admin Panel, with full theme integration and transparency support.

### Backend & Data Management
-   **SQLite Database**: Lightweight and efficient database for managing users, chores, and other application data.
-   **Fastify Backend**: A high-performance Node.js framework ensuring a fast and responsive API.
-   **Widget Gallery**: Dynamic loading and management of custom widgets with theme and transparency support.

### Deployment
-   **Dockerized**: Easily deployable using Docker and Docker Compose, simplifying setup and management.
-   **Portainer Compatible**: Full support for deployment via Portainer stacks with Git integration.
-   **Linux Optimized**: Ideal for deployment on Linux servers, including low-power devices like Raspberry Pi.

## 🚀 Getting Started

### Prerequisites
-   **Docker** and **Docker Compose** (required for all deployment methods)
-   **Git** for cloning the repository (if not using Portainer Git integration)
-   **OpenWeatherMap API Key**: For weather functionality (free tier available)
-   **Calendar Source** (Optional, for Calendar Widget): ICS link from any calendar service (Google Calendar, Apple Calendar, etc.) or CalDAV server credentials
-   **Immich Instance** (Optional, for Photo Widget): A running Immich server with API access

## 📦 Deployment Options

### Option 1: Production Deployment with Pre-Built Images (Recommended)

This is the fastest and easiest method using pre-built Docker images from GitHub Container Registry.

#### Step 1: Download Docker Compose File
```bash
# Download the production docker-compose file
wget https://raw.githubusercontent.com/jherforth/HomeGlow/main/docker-compose.yml

# Or for Tailscale support
wget https://raw.githubusercontent.com/jherforth/HomeGlow/main/docker-compose-tailscale.yml
```

#### Step 2: Create Data Directories
```bash
sudo mkdir -p /apps/homeglow/{data,uploads}
sudo chmod -R 777 /apps/homeglow

# If using Tailscale variant
sudo mkdir -p /apps/homeglow/tailscale-state
```

#### Step 3: Configure Environment Variables
Create a `.env` file or edit the docker-compose.yml directly:

```env
# Port Configuration (customize as needed)
BACKEND_PORT=5000
FRONTEND_PORT=3000

# OpenWeatherMap API Key (get from https://openweathermap.org/api)
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here

# Optional: Tailscale Auth Key (only needed for docker-compose-tailscale.yml)
TS_AUTHKEY=your_tailscale_auth_key_here
```

#### Step 4: Deploy
```bash
# Pull the latest images and start services
docker-compose pull
docker-compose up -d

# Or for Tailscale variant
docker-compose -f docker-compose-tailscale.yml pull
docker-compose -f docker-compose-tailscale.yml up -d
```

#### Step 5: Access Your Application
- **HomeGlow Dashboard**: `http://your-server-ip:3000` (or your configured `FRONTEND_PORT`)
- **Backend API**: `http://your-server-ip:5000` (or your configured `BACKEND_PORT`)

#### Updating to Latest Version
```bash
# Pull latest images and restart services
docker-compose pull && docker-compose up -d
```

**Benefits:**
- Zero build time - images are pre-built
- Multi-architecture support (AMD64, ARM64/Raspberry Pi)
- Consistent, tested images
- Simple updates with `docker-compose pull`

### Option 2: Portainer Stack Deployment

Deploy HomeGlow using Portainer's Git integration with pre-built images.

#### Step 1: Create Environment Variables
In Portainer, go to **Stacks** → **Add Stack** → **Environment Variables** and add:

```env
# Port Configuration (customize as needed)
BACKEND_PORT=5000
FRONTEND_PORT=3000

# OpenWeatherMap API Key (get from https://openweathermap.org/api)
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here

# Optional: Tailscale Auth Key for secure remote access
TS_AUTHKEY=your_tailscale_auth_key_here
```

#### Step 2: Deploy Stack from Git
1. **Stack Name**: `homeglow`
2. **Repository URL**: `https://github.com/jherforth/homeglow`
3. **Repository Reference**: `main`
4. **Compose Path**: `docker-compose.yml` (or `docker-compose-tailscale.yml` for Tailscale)
5. **Environment Variables**: Add the variables from Step 1
6. Click **Deploy the Stack**

#### Step 3: Create Data Directories
```bash
sudo mkdir -p /apps/homeglow/{data,uploads}
sudo chmod -R 777 /apps/homeglow
```

#### Step 4: Access Your Application
- **HomeGlow Dashboard**: `http://your-server-ip:3000` (or your configured `FRONTEND_PORT`)
- **Backend API**: `http://your-server-ip:5000` (or your configured `BACKEND_PORT`)

> **Note**: The production docker-compose files use pre-built images from GHCR. For development builds from source, use `docker-compose.dev.yml`.

### Option 3: Manual Docker Compose Deployment (Build from Source)

Use this option if you want to build images locally from source code (for development or customization).

#### Step 1: Clone the Repository
```bash
git clone https://github.com/jherforth/homeglow.git
cd homeglow
```

#### Step 2: Create Environment File
Create a `.env` file in the root directory:

```env
# Port Configuration (customize as needed)
BACKEND_PORT=5000
FRONTEND_PORT=3000

# OpenWeatherMap API Key
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here

# Backend API URL (use configured backend port)
VITE_REACT_APP_API_URL=http://your-server-ip:5000

# Optional: Tailscale Auth Key
TS_AUTHKEY=your_tailscale_auth_key_here
```

#### Step 3: Create Data Directories
```bash
sudo mkdir -p /apps/homeglow/{data,uploads,tailscale-state}
sudo chmod -R 777 /apps/homeglow
```

#### Step 4: Build and Deploy
```bash
# Build and start services (standard deployment)
docker-compose -f docker-compose.dev.yml up -d --build

# Or with Tailscale support
docker-compose -f docker-compose-tailscale.dev.yml up -d --build
```

> **Note**: The `.dev.yml` files build images locally from source. This takes longer but allows for code modifications.

### Option 4: Local Development Setup

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

## ⚙️ Configuration

### Port Configuration

HomeGlow allows you to customize the ports used by the frontend and backend services via environment variables. This is particularly useful when deploying multiple instances or when standard ports are already in use.

#### Default Ports
- **Backend (API)**: 5000 (or 5001 for test environment)
- **Frontend (Dashboard)**: 3000 (or 3001 for test environment)

#### Customizing Ports

Set these environment variables in your `.env` file or Portainer stack:

```env
BACKEND_PORT=8080   # Your custom backend port
FRONTEND_PORT=8081  # Your custom frontend port
```

The configuration automatically applies to:
- Docker container port mappings
- Internal service communication
- EXPOSE directives in Dockerfiles
- Tailscale serve configuration (if using docker-compose-tailscale.yml)

If not specified, the system falls back to sensible defaults based on which docker-compose file is used.

### Initial Setup via Admin Panel

Access the Admin Panel by clicking the gear icon (⚙️) on the main dashboard:

#### APIs Tab
1. **OpenWeatherMap API Key**: Enter your API key for weather functionality
2. **Proxy Whitelist**: Configure allowed domains for external API calls

#### Calendar Configuration
Configure calendar sources directly from the Calendar Widget settings:
1. Click the **Settings** icon (⚙️) on the Calendar Widget
2. Click **Add Calendar** to create a new calendar source
3. **For ICS Calendars** (Google, Apple, etc.):
   - Enter a display name
   - Select "ICS" as the type
   - Paste your calendar's public ICS link
   - Choose a custom color
4. **For CalDAV Calendars** (Private servers):
   - Enter a display name
   - Select "CalDAV" as the type
   - Enter your CalDAV server URL
   - Provide username and password
   - Choose a custom color
   - Test connection before saving
5. **Manage Calendars**:
   - Toggle calendars on/off without deleting them
   - Edit calendar settings anytime
   - Delete calendars you no longer need

#### Widgets Tab
Enable/disable and configure transparency for:
- **Chores Widget**: Task management with reward system
- **Calendar Widget**: Google Calendar integration
- **Photos Widget**: Immich photo display
- **Weather Widget**: Weather forecasts and graphs
- **Menu Widget**: Weekly meal planning

#### Interface Tab
- **Screen Refresh Options**: Automatic page refresh intervals (1-12 hours)
- **Geometric Background**: Dynamic pattern backgrounds
- **Card Shuffle**: Randomize widget positions
- **Display Settings**: Text size, card width, padding adjustments
- **Custom Colors**: Personalize gradients for light/dark themes

#### Users Tab
- **Add Users**: Create family member profiles with photos
- **Manage Clam Totals**: Adjust reward currency
- **View User Tasks**: See all assigned chores per user

#### Prizes Tab
- **Create Rewards**: Set up prizes users can "purchase" with clams
- **Manage Prize Costs**: Adjust clam values for different rewards

#### Plugins Tab
- **Upload Custom Widgets**: Add your own HTML widgets
- **Manage Widget Library**: Enable/disable custom widgets

### Getting API Keys

#### OpenWeatherMap API Key
1. Visit [OpenWeatherMap](https://openweathermap.org/api)
2. Sign up for a free account
3. Navigate to API Keys section
4. Copy your API key to the Admin Panel → APIs tab

#### Calendar Integration

**For Google Calendar (ICS Link)**:
1. Open Google Calendar
2. Click the three dots next to your calendar name
3. Select "Settings and sharing"
4. Scroll to "Integrate calendar"
5. Copy the "Secret address in iCal format"
6. In HomeGlow, click Settings on the Calendar Widget
7. Add a new calendar, select "ICS" type, and paste the URL

**For Apple Calendar (ICS Link)**:
1. Open Calendar app on Mac
2. Right-click the calendar you want to share
3. Select "Share Calendar" and make it public
4. Copy the public URL
5. Add to HomeGlow Calendar Widget as an ICS source

**For CalDAV Servers** (Nextcloud, Radicale, etc.):
1. Get your CalDAV server URL from your provider
2. Obtain your calendar-specific endpoint
3. In HomeGlow, add a new calendar with "CalDAV" type
4. Enter your server URL, username, and password
5. Use the "Test Connection" button to verify settings

## 🔧 Custom Widget Development

HomeGlow supports custom HTML widgets that integrate seamlessly with the app's theming system.

### Quick Start
1. **Read the Guide**: Check `server/widgets/README.md` for complete development instructions
2. **Use the Template**: Start with the provided widget template
3. **Test Locally**: Develop with theme parameters (`?theme=dark&transparent=true`)
4. **Upload**: Use Admin Panel → Plugins tab to upload your widget
5. **Enable**: Toggle your widget in the Widget Gallery

### Widget Features
- **Theme Integration**: Automatic light/dark mode support
- **Transparency Support**: Widgets can be made transparent
- **Responsive Design**: Works on all screen sizes
- **Local Storage**: Persistent settings per widget
- **Sandboxed**: Secure iframe execution

## 🔒 Security & Access

### Tailscale Integration (Optional)
HomeGlow includes optional Tailscale integration for secure remote access:

1. **Get Tailscale Auth Key**: Visit [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)
2. **Add to Environment**: Set `TS_AUTHKEY` in your environment variables
3. **Access Remotely**: Use your Tailscale network to access HomeGlow securely

### Reverse Proxy Setup (Optional)
For HTTPS and custom domains:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🗂️ Data Management

### Backup Your Data
Important data is stored in `/apps/homeglow/data/`:
```bash
# Backup database
sudo cp /apps/homeglow/data/tasks.db /path/to/backup/

# Backup uploaded photos
sudo cp -r /apps/homeglow/uploads /path/to/backup/
```

### Database Schema
HomeGlow uses SQLite with tables for:
- **users**: Family member profiles and clam totals
- **chores**: Task assignments and completion status
- **calendar_sources**: Calendar connection configurations (ICS/CalDAV)
- **calendar_events**: Cached calendar events from all sources
- **settings**: API keys and configuration
- **prizes**: Reward system items
- **menu_items**: Weekly meal planning entries

## 🛠️ Troubleshooting

### Common Issues

#### Widgets Not Loading
- Check Admin Panel → Plugins → Debug for file status
- Verify widget HTML syntax and theme handling
- Check browser console for JavaScript errors

#### Calendar Not Showing Events
- **Check Calendar Sources**: Open Calendar Widget Settings to verify calendars are enabled
- **Test ICS URLs**: For ICS calendars, paste the URL in a browser to verify it's accessible
- **Test CalDAV Connection**: For CalDAV calendars, use the "Test Connection" button in the calendar editor
- **Verify Credentials**: Ensure username/password are correct for CalDAV sources
- **Check URL Format**: ICS URLs should end with `.ics` or `.ical`, CalDAV URLs should point to your calendar endpoint
- **Enable Calendars**: Make sure calendar sources are toggled on (enabled) in the settings

#### Weather Widget Not Working
- Confirm OpenWeatherMap API key is valid
- Check API key hasn't exceeded rate limits
- Verify zip code format in widget settings

#### Docker Container Issues
```bash
# Check container logs
docker logs homeglow-backend
docker logs homeglow-frontend

# Restart containers
docker-compose restart

# Rebuild containers
docker-compose up --build -d
```

#### Permission Issues
```bash
# Fix data directory permissions
sudo chmod -R 777 /apps/homeglow/data
sudo chmod -R 777 /apps/homeglow/uploads
```

### Getting Help
- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check `server/widgets/README.md` for widget development
- **Logs**: Always check container logs for error details

## 🏗️ Building and Publishing Docker Images

For maintainers who want to build and publish Docker images to GitHub Container Registry.

### Automated Publishing via GitHub Actions

Docker images are automatically built and published when:
- You push a version tag (e.g., `v1.2.0`)
- You push to the main branch
- You manually trigger the workflow

**To create a release:**
```bash
# Update version in package.json files
# Create and push a git tag
git tag v1.2.0
git push origin v1.2.0
```

GitHub Actions will automatically build multi-architecture images (AMD64 and ARM64) and push them to GHCR.

### Manual Build and Push

For local builds and testing:

```bash
# Build and push with 'latest' tag
./scripts/build-and-push.sh

# Build and push with specific version
./scripts/build-and-push.sh 1.2.0
```

**Prerequisites:**
1. Docker with buildx support
2. GitHub Personal Access Token with package permissions
3. Authenticated with GHCR: `echo $GITHUB_TOKEN | docker login ghcr.io -u jherforth --password-stdin`

For detailed instructions on building, publishing, and configuring GHCR, see [GHCR_SETUP.md](GHCR_SETUP.md).

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the Repository**
2. **Create a Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Make Your Changes**: Follow the existing code style
4. **Test Thoroughly**: Ensure both light/dark themes work
5. **Submit a Pull Request**: Describe your changes clearly

### Development Guidelines
- **Follow existing patterns** for consistency
- **Test on multiple screen sizes** (mobile, tablet, desktop)
- **Verify theme compatibility** (light/dark modes)
- **Update documentation** for new features
- **Add error handling** for robust operation

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- **Magic Mirror**: Inspiration for the dashboard concept
- **React Big Calendar**: Calendar widget functionality
- **Material-UI**: Component library and theming
- **Fastify**: High-performance backend framework
- **Docker**: Containerization and deployment
- **Tailscale**: Secure networking solution

---

**HomeGlow** - Transform your home with a beautiful, intelligent dashboard that grows with your family's needs.

![Image](https://github.com/user-attachments/assets/a3b72db0-510b-4da8-a1bc-e2257dca2799)
ENJOY!
