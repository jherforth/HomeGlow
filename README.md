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
-   **Photo Widget**: Integrates with self-hosted Immich instances to display your personal photo library.
-   **Weather Widget**: Provides current weather conditions and a 3-day forecast for a specified zip code, including interactive temperature and precipitation graphs.

### Backend & Data Management
-   **SQLite Database**: Lightweight and efficient database for managing users, chores, and other application data.
-   **Fastify Backend**: A high-performance Node.js framework ensuring a fast and responsive API.

### Deployment
-   **Dockerized**: Easily deployable using Docker and Docker Compose, simplifying setup and management.
-   **Linux Optimized**: Ideal for deployment on Linux servers, including low-power devices like Raspberry Pi.

## 🚀 Getting Started

### Prerequisites
-   **Node.js** (v18 or higher)
-   **Docker** and **Docker Compose** (recommended for production deployment)
-   **Git** for cloning the repository
-   **Google Calendar ICS Link**: A shareable, public ICS link from your Google Calendar (or any other calendar service).
-   **Immich Instance** (Optional, for Photo Widget): A running Immich server with API access.

### Installation

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/jherforth/homeglow.git
    cd homeglow
    ```

2.  **Configure Environment Variables**:
    Create a `.env` file inside the `server/` directory (`homeglow/server/.env`) and populate it with your configurations.
    **Important Security Note**: Keep this file secure and **NEVER commit it to Git**. Add `server/.env` to your `.gitignore` file.

    ```dotenv
    # server/.env
    PORT=5000

    # Google Calendar ICS Integration
    # Obtain this from your Google Calendar settings: "Integrate calendar" -> "Secret address in iCal format"
    ICS_CALENDAR_URL=YOUR_GOOGLE_CALENDAR_ICS_LINK

    # Immich Integration (Optional, for Photo Widget)
    # If you use Immich, replace with your Immich instance URL and API Key
    IMMICH_URL=https://your-immich-instance.com
    IMMICH_API_KEY=your-immich-api-key

    # Nextcloud CalDAV (Deprecated in favor of ICS for simplicity, but variables remain if needed for other uses)
    # NEXTCLOUD_URL=https://your-nextcloud-instance.com
    # NEXTCLOUD_USERNAME=your-username
    # NEXTCLOUD_PASSWORD=your-password
    ```

    Create a `.env` file inside the `client/` directory (`homeglow/client/.env`) for client-side specific variables.

    ```dotenv
    # client/.env
    # This URL points to your backend API. If running in Docker, 'backend' is the service name.
    VITE_REACT_APP_API_URL=http://backend:5000

    # OpenWeatherMap API Key (for Weather Widget)
    # Obtain from OpenWeatherMap: https://openweathermap.org/api
    VITE_OPENWEATHER_API_KEY=YOUR_OPENWEATHER_API_KEY
    ```

3.  **Build and Run with Docker Compose** (Recommended for production):
    Ensure you are in the root `homeglow` directory.
    ```bash
    docker-compose up --build -d
    ```
    This command will build the Docker images for both your client and server, and then run them in detached mode.

4.  **Access Your Application**:
    Open your web browser and navigate to `http://your-server-ip:3000`.

5.  **Secure with Nginx and Certbot** (Optional, for production with SSL):
    ```bash
    sudo apt update
    sudo apt install nginx certbot python3-certbot-nginx
    ```
    Configure Nginx (e.g., `/etc/nginx/sites-available/homeglow`):
    ```nginx
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
    ```
    Enable and secure:
    ```bash
    sudo ln -s /etc/nginx/sites-available/homeglow /etc/nginx/sites-enabled/
    sudo systemctl restart nginx
    sudo certbot --nginx -d your-domain.com
    ```

### ⚙️ Configuration via Admin Panel

Access the Admin Panel by clicking the gear icon (⚙️) on the main dashboard. Here you can:
-   **Enable/Disable Widgets**: Turn individual widgets (Chores, Calendar, Photos, Weather, Menu) on or off.
-   **Widget Transparency**: Make individual widgets transparent to reveal the background.
-   **Screen Refresh Options**: Select an interval (1, 3, 6, 9, 12 hours, or Manual Only) for automatic page refreshes.
-   **Enable Geometric Background**: Toggle the dynamic geometric pattern background.
-   **Enable Card Shuffle**: Toggle the randomization of widget positions to prevent burn-in.
-   **Display Settings**: Adjust global text size, card width, and card padding.
-   **Manage Users**: Add new users, delete existing users, and reset clam totals.

## 👨‍💻 Local Development (Optional)

If you prefer to run the client and server separately for development:

1.  **Install Dependencies**:
    ```bash
    cd server
    npm install
    cd ../client
    npm install
    ```

2.  **Run Backend**:
    Ensure your `server/.env` is configured.
    ```bash
    cd server
    npm start
    ```

3.  **Run Frontend**:
    Ensure your `client/.env` is configured.
    ```bash
    cd client
    npm start
    ```

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
