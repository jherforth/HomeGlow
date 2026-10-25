<img width="233" height="181" alt="HomeGlowLogo" src="https://github.com/user-attachments/assets/6442af5c-f6a0-44d6-83b3-4c2767bc36bb" />

Discord: https://discord.gg/Ea5kbC5wFv | Demo: https://demo.homeglow.dev

# HomeGlow

**A Smart, Self-Hosted Dashboard for Your Home**

HomeGlow is an open-source, self-hosted dashboard application designed for touch-enabled displays, drawing inspiration from projects like Magic Mirror. It offers a modular, browser-based interface to centralize and display essential home information, integrating with self-hosted services and providing custom modules for family management. Optimized for Linux environments (e.g., Raspberry Pi, Proxmox VMs), HomeGlow is lightweight, highly customizable, and perfect for creating a dynamic home hub.

<img width="1892" height="981" alt="Screenshot 2026-10-22 193024" src="https://github.com/user-attachments/assets/91160ec9-7af3-4ba4-814a-c49cd4bb54bc" />


## ✨ Features

HomeGlow is built with a focus on modern aesthetics, user experience, and practical utility, incorporating advanced features to prevent screen burn-in and enhance daily interactions.

### Core Design & Experience
-   **Dynamic Theming**: Seamlessly toggle between beautiful Light and Dark modes, with your preference intelligently saved in local storage.
-   **Touch-Friendly Interface**: Designed from the ground up for touchscreens, allowing intuitive interaction with all widgets and controls.
-   **Customizable Widget Layout**:
    -   **Drag-and-Drop Positioning**: Choose **Move/Resize** in the dock to arrange widgets freely, then tap **Save layout** in the bottom-right corner when you're done
    -   **Flexible Resizing**: Click or tap widgets to select, then use +/- buttons on each edge to resize
    -   **Grid-Based System**: Responsive 12-column grid that adapts to mobile, tablet, and desktop screens
    -   **Persistent Layouts**: Your custom arrangement is automatically saved and restored
    -   **Touch & Mouse Support**: Full support for both touch gestures and traditional mouse interactions

### Enhanced Widgets
-   **Widget Refresh System**: Configure auto-refresh rates for each widget independently (5, 15, 30 minutes, or 1-6 hours)
-   **Calendar Widget**:
    -   **Multi-Source Calendar Support**: Connect multiple calendars simultaneously from different sources.
    -   **ICS & CalDAV Integration**: Supports both public ICS links (Google Calendar, Apple Calendar, etc.) and private CalDAV servers with authentication.
    -   **Month & Week Views**: Seamlessly toggle between a traditional month view and a dynamic week view with intuitive navigation controls.
-   **Menu Widget**: Add multiple menu items per day, allowing for detailed meal planning.
-   **Chores Widget**:
    -   **User-Centric Task Management**: Assign and track chores for multiple users, with visual progress indicators.
    -   **Clam Reward System**: Users earn "clams" (a customizable reward currency) upon completing all their daily chores.
    -   **Swipe-to-Complete**: Mark chores as complete with a simple swipe gesture (on touch-enabled devices).
    -   **Sticky Chores (Until-Completed)**: Keep chores visible until they are completed, perfect for flexible schedules and ongoing tasks.
    -   **Bonus Chore System**: Create special bonus chores with custom clam rewards.
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

## 📦 Installation

### Prerequisites
-   **Docker** and **Docker Compose** (required for all supported deployment methods)
-   **OpenWeatherMap API Key**: (Optional, for Weather widget): free license
-   **Calendar Source** (Optional, for Calendar widget): ICS link from any calendar service (Google Calendar, Apple Calendar, etc.) or CalDAV server credentials
-   **Immich Instance** (Optional, for Photo widget): A running Immich server with API access

Get HomeGlow running with these simple commands:

### Docker Compose with Pre-built Images (Recommended)


```bash
# 1. Download docker-compose file
wget https://raw.githubusercontent.com/jherforth/HomeGlow/main/docker-compose.yml

# 2. Create config in .env (change the values as appropriate)
FRONTEND_PORT=3000
# Optional: HomeGlow follows the host's time zone. Set TZ only to use a different one
# (https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), e.g.:
# TZ=America/New_York

# 3. Start HomeGlow
docker compose up -d

# 4. Access at http://your-server-ip:3000
```
Configure API keys and widgets in the Admin Panel (⚙️ icon).

**Time zone:** HomeGlow uses the host machine's time zone unless `TZ` is set. To change it without editing `.env` or recreating the container, use Admin Panel → System → Language & time. A zone set there takes priority over both, and resetting it goes back to `TZ`, or to the host's zone if `TZ` isn't set. Installs from before this change that never set `TZ` were running on New York time; they keep it, saved as their chosen zone.

**Updating:** `docker compose pull && docker compose up -d`

### Build from Source for Development

```bash
git clone https://github.com/jherforth/homeglow.git && cd homeglow
docker compose -f docker-compose.dev.yml up --build
```

## ⚙️ Configuration

### Admin Panel Setup

Click the gear icon (⚙️) to access settings:

- **APIs**: Add OpenWeatherMap API key for weather
- **Widgets**: Enable/disable widgets, set refresh intervals
- **Users**: Add family members, manage clam rewards
- **Chores**: Manage chores, schedules, and history
- **Prizes**: Create rewards for the clam system
- **Calendar**: Add ICS/CalDAV sources in the Calendar Widget settings
- **Plugins**: Upload custom HTML widgets

### API Keys

**OpenWeatherMap**: Sign up for a free API key at [openweathermap.org](https://openweathermap.org/api).

**Calendar Integration**:
- **Google Calendar**: Settings → Integrate calendar → Copy "Secret address in iCal format"
- **Apple Calendar**: Share calendar publicly, copy URL
- **CalDAV**: Use your server URL with username/password

## 🔧 Custom Widgets

Create HTML widgets with theme support. See `server/widgets/README.md` for details.

## 🔒 Security

**HomeGlow is not secure, and it is not designed to be exposed to the internet.** It's a local-only app for a trusted home network. It has no logins or user accounts, so any device that can reach it can read and change its data.

- **Keep it on your home network.** Don't port-forward it or publish it. To reach it away from home, connect to your network with a VPN (WireGuard, Tailscale).
- **The admin PIN is tamper resistance, not access control.** It keeps household members who shouldn't make changes, such as children at a wall display or guests, out of the Admin Panel. It doesn't stop someone on your network who knows how to call HomeGlow's API directly.
- **What HomeGlow does enforce:**
  - downloading a backup, restoring one, and Home Assistant unlock actions need the PIN on the server too;
  - wrong PINs are rate-limited;
  - other websites can't use a browser on your network to read or change HomeGlow's data.

DISCLAIMER: This project uses AI in its development process. While you are right to generally be skeptical about AI coding security, this project doesn't have any secure endpoints or credentials for AI to mishandle. Because there is no security implicitly or explicitly provided by this project, there cannot be any security failures from AI. When in doubt, don't expose services to the internet.

**Reverse Proxy**: A reverse proxy can add HTTPS and a custom name on your network. If yours reaches the internet (a Cloudflare Tunnel, for example), put a login in front of HomeGlow there, such as Cloudflare Access, because HomeGlow has none of its own.

## 🗂️ Data

**Backup**: Admin → System → Connections → Backup & restore downloads one file with everything, and restores from one (or backs up to Google Drive nightly). By hand: copy `./homeglow/data/` (database and encryption key) and `./homeglow/uploads/` (photos)

**Database**: SQLite with tables for users, chores, calendars, settings, prizes, and menus

## 🛠️ Troubleshooting

**Widgets not loading**: Check Admin Panel → Dashboard → Plugins and browser console for errors

**Calendar issues**: Verify calendar sources are enabled, test ICS URLs in browser

**Weather not working**: Check OpenWeatherMap API key validity and rate limits

**Help**: GitHub Issues or check container logs for details

## 🤝 Contributing

Read our [contributing](CONTRIBUTING.md) guidelines.

## 📄 License

This project is open-source and available under the [AGPL v3.0](LICENSE).

## 🙏 Acknowledgments

- **Magic Mirror**: Inspiration for the dashboard concept
- **React Big Calendar**: Calendar widget functionality
- **Material-UI**: Component library and theming
- **Fastify**: High-performance backend framework
- **Docker**: Containerization and deployment

---

**HomeGlow** - Transform your home with a beautiful, intelligent dashboard that grows with your family's needs.

<img width="1899" height="990" alt="Screenshot 2026-10-22 194212" src="https://github.com/user-attachments/assets/7b764a25-24a9-414f-a702-a1c2aa6c21e7" />

ENJOY!
