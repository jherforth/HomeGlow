// client/src/app.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Container, IconButton, Box, Dialog, DialogContent } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// GeoPattern import
import GeoPattern from 'geopattern';

import axios from 'axios';
import CalendarWidget from './components/CalendarWidget.jsx';
import PhotoWidget from './components/PhotoWidget.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WeatherWidget from './components/WeatherWidget.jsx';
import ChoreWidget from './components/ChoreWidget.jsx';
import WidgetGallery from './components/WidgetGallery.jsx';
import WidgetContainer from './components/WidgetContainer.jsx';
import './index.css';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [widgetSettings, setWidgetSettings] = useState(() => {
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      textSize: 16,
      cardSize: 300,
      cardPadding: 20,
      cardHeight: 200,
      refreshInterval: 'manual',
      enableGeoPatternBackground: false,
      // Color settings
      lightGradientStart: '#00ddeb',
      lightGradientEnd: '#ff6b6b',
      darkGradientStart: '#2e2767',
      darkGradientEnd: '#620808',
      lightButtonGradientStart: '#00ddeb',
      lightButtonGradientEnd: '#ff6b6b',
      darkButtonGradientStart: '#2e2767',
      darkButtonGradientEnd: '#620808',
    };
    const savedSettings = localStorage.getItem('widgetSettings');
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // State for dynamic GeoPattern seed
  const [currentGeoPatternSeed, setCurrentGeoPatternSeed] = useState('');

  // State for API keys fetched from backend
  const [apiKeys, setApiKeys] = useState({
    WEATHER_API_KEY: '',
    ICS_CALENDAR_URL: '',
  });

  // State for bottom bar collapse
  const [isBottomBarCollapsed, setIsBottomBarCollapsed] = useState(true);

  // State to trigger widget gallery refresh
  const [widgetGalleryKey, setWidgetGalleryKey] = useState(0);

  // Function to refresh widget gallery
  const refreshWidgetGallery = () => {
    setWidgetGalleryKey(prev => prev + 1);
  };

  useEffect(() => {
    const fetchApiKeys = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`);
        setApiKeys(response.data);
      } catch (error) {
        console.error('Error fetching API keys:', error);
      }
    };
    fetchApiKeys();
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Generate a random seed once on component mount
    setCurrentGeoPatternSeed(Math.random().toString());
  }, []);

  // Effect to apply dynamic CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--dynamic-text-size', `${widgetSettings.textSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-width', `${widgetSettings.cardSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-padding', `${widgetSettings.cardPadding}px`);
    document.documentElement.style.setProperty('--dynamic-card-height', `${widgetSettings.cardHeight}px`);

    // Apply custom color variables
    document.documentElement.style.setProperty('--light-gradient-start', widgetSettings.lightGradientStart);
    document.documentElement.style.setProperty('--light-gradient-end', widgetSettings.lightGradientEnd);
    document.documentElement.style.setProperty('--dark-gradient-start', widgetSettings.darkGradientStart);
    document.documentElement.style.setProperty('--dark-gradient-end', widgetSettings.darkGradientEnd);
    document.documentElement.style.setProperty('--light-button-gradient-start', widgetSettings.lightButtonGradientStart);
    document.documentElement.style.setProperty('--light-button-gradient-end', widgetSettings.lightButtonGradientEnd);
    document.documentElement.style.setProperty('--dark-button-gradient-start', widgetSettings.darkButtonGradientStart);
    document.documentElement.style.setProperty('--dark-button-gradient-end', widgetSettings.darkButtonGradientEnd);

  }, [widgetSettings]);

  // Effect for automatic page refresh
  useEffect(() => {
    let intervalId;
    const intervalHours = parseInt(widgetSettings.refreshInterval, 10);

    if (!isNaN(intervalHours) && intervalHours > 0) {
      const intervalMilliseconds = intervalHours * 60 * 60 * 1000;
      intervalId = setInterval(() => {
        console.log(`Auto-refreshing page after ${intervalHours} hours.`);
        setCurrentGeoPatternSeed(Math.random().toString());
        window.location.reload();
      }, intervalMilliseconds);
      console.log(`Auto-refresh set for ${intervalHours} hours (${intervalMilliseconds}ms)`);
    } else {
      console.log('Auto-refresh disabled or invalid interval:', widgetSettings.refreshInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log('Auto-refresh interval cleared');
      }
    };
  }, [widgetSettings.refreshInterval]);

  // Effect to update body padding based on bottom bar height
  useEffect(() => {
    const barHeight = isBottomBarCollapsed ? 40 : 100;
    document.documentElement.style.setProperty('--bottom-bar-height', `${barHeight}px`);
  }, [isBottomBarCollapsed]);

  // Effect for GeoPattern background and container transparency
  useEffect(() => {
    if (widgetSettings.enableGeoPatternBackground) {
      const pattern = GeoPattern.generate(currentGeoPatternSeed);
      document.body.style.backgroundImage = pattern.toDataUrl();
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundSize = 'cover';

      document.documentElement.style.setProperty('--container-background-override', 'transparent');
    } else {
      document.body.style.backgroundImage = 'var(--gradient)';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundSize = 'auto';

      document.documentElement.style.setProperty('--container-background-override', 'var(--gradient)');
    }
  }, [widgetSettings.enableGeoPatternBackground, theme, currentGeoPatternSeed]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const toggleAdminPanel = () => {
    if (showAdminPanel) {
      // Closing - reload settings from localStorage
      const savedSettings = localStorage.getItem('widgetSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setWidgetSettings(prev => ({ ...prev, ...parsed }));
      }
    }
    setShowAdminPanel(!showAdminPanel);
  };

  const handlePageRefresh = () => {
    window.location.reload();
  };

  const toggleBottomBar = () => {
    setIsBottomBarCollapsed(!isBottomBarCollapsed);
  };

  // Build widgets array for DraggableWidget system
  const buildWidgetsArray = () => {
    const widgets = [];

    if (widgetSettings.calendar.enabled) {
      widgets.push({
        id: 'calendar-widget',
        defaultPosition: { x: 0, y: 0 },
        defaultSize: { width: 6, height: 4 },
        minWidth: 4,
        minHeight: 3,
        content: <CalendarWidget
          transparentBackground={widgetSettings.calendar.transparent}
          icsCalendarUrl={apiKeys.ICS_CALENDAR_URL}
        />,
      });
    }

    if (widgetSettings.weather.enabled) {
      widgets.push({
        id: 'weather-widget',
        defaultPosition: { x: 6, y: 0 },
        defaultSize: { width: 3, height: 3 },
        minWidth: 2,
        minHeight: 2,
        content: <WeatherWidget
          transparentBackground={widgetSettings.weather.transparent}
          weatherApiKey={apiKeys.WEATHER_API_KEY}
        />,
      });
    }

    if (widgetSettings.chores.enabled) {
      widgets.push({
        id: 'chores-widget',
        defaultPosition: { x: 0, y: 4 },
        defaultSize: { width: 4, height: 3 },
        minWidth: 3,
        minHeight: 2,
        content: <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />,
      });
    }

    if (widgetSettings.photos.enabled) {
      widgets.push({
        id: 'photos-widget',
        defaultPosition: { x: 4, y: 4 },
        defaultSize: { width: 4, height: 3 },
        minWidth: 3,
        minHeight: 2,
        content: <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />,
      });
    }

    return widgets;
  };

  const widgets = buildWidgetsArray();

  return (
    <>
      <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative' }}>
        {/* Widget Container with Draggable Widgets */}
        {widgets.length > 0 && <WidgetContainer widgets={widgets} />}

        {/* Always show Widget Gallery */}
        <Container className="container">
          <WidgetGallery key={widgetGalleryKey} theme={theme} />
        </Container>
      </Box>

      {/* Admin Panel as a Dialog (Popup) */}
      <Dialog open={showAdminPanel} onClose={toggleAdminPanel} maxWidth="lg">
        <DialogContent>
          <AdminPanel setWidgetSettings={setWidgetSettings} onWidgetUploaded={refreshWidgetGallery} />
        </DialogContent>
      </Dialog>

      {/* Bottom Bar for Logo and Buttons */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: isBottomBarCollapsed ? '5px 0' : '10px 0',
          backgroundColor: 'var(--bottom-bar-bg)',
          borderTop: '1px solid var(--card-border)',
          backdropFilter: 'var(--backdrop-blur)',
          boxShadow: 'var(--shadow)',
          zIndex: 1000,
          transition: 'height 0.3s ease-in-out, padding 0.3s ease-in-out',
          height: isBottomBarCollapsed ? '40px' : '100px',
          overflow: 'hidden',
        }}
      >
        {/* Toggle Button for the bar */}
        <IconButton
          onClick={toggleBottomBar}
          aria-label={isBottomBarCollapsed ? 'Expand bottom bar' : 'Collapse bottom bar'}
          sx={{
            color: theme === 'light' ? 'action.active' : 'white',
            alignSelf: 'flex-end',
            marginRight: '10px',
            padding: '5px',
          }}
        >
          {isBottomBarCollapsed ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>

        {!isBottomBarCollapsed && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            {/* App Logo */}
            <img src="/HomeGlowLogo.png" alt="App Logo" style={{ height: '80px', marginRight: '20px' }} />

            {/* Theme Toggle Button */}
            <IconButton
              onClick={toggleTheme}
              aria-label="Toggle theme"
              sx={{
                color: theme === 'light' ? 'action.active' : 'white',
                margin: '0 5px',
              }}
            >
              {theme === 'light' ? <Brightness4 /> : <Brightness7 />}
            </IconButton>

            {/* Admin Panel Toggle Button */}
            <IconButton
              onClick={toggleAdminPanel}
              aria-label="Toggle Admin Panel"
              sx={{
                color: theme === 'light' ? 'action.active' : 'white',
                margin: '0 5px',
              }}
            >
              <SettingsIcon />
            </IconButton>

            {/* Page Refresh Button */}
            <IconButton
              onClick={handlePageRefresh}
              aria-label="Refresh Page"
              sx={{
                color: theme === 'light' ? 'action.active' : 'white',
                margin: '0 5px',
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        )}
      </Box>
    </>
  );
};

export default App;
