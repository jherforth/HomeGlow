# HomeGlow

**A Smart, Self-Hosted Dashboard for Your Home**

HomeGlow is an open-source, self-hosted dashboard application designed for touch-enabled displays, drawing inspiration from projects like Magic Mirror. It offers a modular, browser-based interface to centralize and display essential home information, integrating with self-hosted services and providing custom modules for family management. Optimized for Linux environments (e.g., Raspberry Pi, Proxmox VMs), HomeGlow is lightweight, highly customizable, and perfect for creating a dynamic home hub.

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
    -   **Google Calendar Integration**: Connects directly to your Google Calendar via a shareable ICS link, fetching and displaying your events.
    -   **Sleek Month View**: A refined, less "boxy" calendar display with subtle borders and improved spacing.
    -   **Integrated Upcoming Events**: Eliminates the need for a separate agenda view by displaying a clean, non-scrolling list of events for the next 7 days directly below the main calendar.
    -   **Current Day Highlight**: Visually emphasizes the current day of the week in the calendar header for quick reference.
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
-   **Google Calendar ICS Link**: A shareable, public ICS link from your Google Calendar (or any other calendar service).
-   **OpenWeatherMap API Key**: For weather functionality (free tier available)
-   **Immich Instance** (Optional, for Photo Widget): A running Immich server with API access.

## 📦 Deployment Options

### Option 1: Portainer Stack Deployment (Recommended)

This is the easiest method for deploying HomeGlow using Portainer's Git integration.

#### Step 1: Create Environment Variables
In Portainer, go to **Stacks** → **Add Stack** → **Environment Variables** and add:

```env
# OpenWeatherMap API Key (get from https://openweathermap.org/api)
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here

# Backend API URL (use your server's IP or domain)
VITE_REACT_APP_API_URL=http://your-server-ip:5000

# Optional: Tailscale Auth Key for secure remote access
TS_AUTHKEY=your_tailscale_auth_key_here
```

#### Step 2: Deploy Stack from Git
1. **Stack Name**: `homeglow`
2. **Repository URL**: `https://github.com/jherforth/homeglow`
3. **Repository Reference**: `main`
4. **Compose Path**: `docker-compose.yml`
5. **Environment Variables**: Add the variables from Step 1
6. Click **Deploy the Stack**

#### Step 3: Access Your Application
- **HomeGlow Dashboard**: `http://your-server-ip:3000`
- **Backend API**: `http://your-server-ip:5000`

### Option 2: Manual Docker Compose Deployment

#### Step 1: Clone the Repository
```bash
git clone https://github.com/jherforth/homeglow.git
cd homeglow
```

#### Step 2: Create Environment File
Create a `.env` file in the root directory:

```env
# OpenWeatherMap API Key
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here

# Backend API URL
VITE_REACT_APP_API_URL=http://your-server-ip:5000

# Optional: Tailscale Auth Key
TS_AUTHKEY=your_tailscale_auth_key_here
```

#### Step 3: Deploy with Docker Compose
```bash
# Create required directories
sudo mkdir -p /apps/homeglow/{data,uploads,tailscale-state}
sudo chmod -R 777 /apps/homeglow

# Deploy the stack
docker-compose up -d
```

### Option 3: Development Setup

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

### Initial Setup via Admin Panel

Access the Admin Panel by clicking the gear icon (⚙️) on the main dashboard:

#### APIs Tab
1. **OpenWeatherMap API Key**: Enter your API key for weather functionality
2. **ICS Calendar URL**: Add your Google Calendar's public ICS link
3. **Proxy Whitelist**: Configure allowed domains for external API calls

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

#### Google Calendar ICS Link
1. Open Google Calendar
2. Click the three dots next to your calendar name
3. Select "Settings and sharing"
4. Scroll to "Integrate calendar"
5. Copy the "Secret address in iCal format"
6. Paste into Admin Panel → APIs tab

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
- **events**: Calendar events (if using local storage)
- **settings**: API keys and configuration
- **prizes**: Reward system items

## 🛠️ Troubleshooting

### Common Issues

#### Widgets Not Loading
- Check Admin Panel → Plugins → Debug for file status
- Verify widget HTML syntax and theme handling
- Check browser console for JavaScript errors

#### Calendar Not Showing Events
- Verify ICS URL is public and accessible
- Test the ICS URL in a browser
- Check Admin Panel → APIs for correct URL format

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