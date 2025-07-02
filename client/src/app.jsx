import React, { useState, useEffect } from 'react';
import { Container, Grid, IconButton } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import CalendarWidget from './components/CalendarWidget.jsx';
import PhotoWidget from './components/PhotoWidget.jsx';
import ChoreWidget from './components/ChoreWidget.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WeatherWidget from './components/WeatherWidget.jsx';
import MenuWidget from './components/MenuWidget.jsx'; // Import the new MenuWidget
import './index.css';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [widgetSettings, setWidgetSettings] = useState(() => {
    const savedSettings = localStorage.getItem('widgetSettings');
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      menu: { enabled: false, transparent: false }, // Add menu widget settings
    };
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Load theme and widget settings from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedSettings = localStorage.getItem('widgetSettings');
    if (savedSettings) {
      setWidgetSettings(prevSettings => {
        const defaultSettings = {
          chores: { enabled: false, transparent: false },
          calendar: { enabled: false, transparent: false },
          photos: { enabled: false, transparent: false },
          weather: { enabled: false, transparent: false },
          menu: { enabled: false, transparent: false }, // Add menu widget settings
        };
        return { ...defaultSettings, ...JSON.parse(savedSettings) };
      });
    } else {
      localStorage.setItem('widgetSettings', JSON.stringify(widgetSettings));
    }
  }, []);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Toggle Admin Panel visibility
  const toggleAdminPanel = () => {
    setShowAdminPanel(!showAdminPanel);
  };

  return (
    <Container className="container">
      {/* Theme Toggle Button */}
      <IconButton
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        sx={{ position: 'absolute', top: 16, right: 16 }}
        color="inherit" // ADDED: This will make the icon color inherit from the text color, which changes with the theme.
      >
        {theme === 'light' ? <Brightness4 /> : <Brightness7 />}
      </IconButton>

      {/* Admin Panel Toggle Button (Gear Icon) */}
      <IconButton
        className="admin-toggle"
        onClick={toggleAdminPanel}
        aria-label="Toggle Admin Panel"
        sx={{ position: 'absolute', top: 16, right: 64 }}
      >
        <SettingsIcon />
      </IconButton>

      <Grid container spacing={2}>
        {widgetSettings.calendar.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <CalendarWidget transparentBackground={widgetSettings.calendar.transparent} />
          </Grid>
        )}
        {widgetSettings.photos.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />
          </Grid>
        )}
        {widgetSettings.chores.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />
          </Grid>
        )}
        {widgetSettings.weather.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <WeatherWidget transparentBackground={widgetSettings.weather.transparent} />
          </Grid>
        )}
        {widgetSettings.menu.enabled && ( // Conditionally render MenuWidget
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <MenuWidget transparentBackground={widgetSettings.menu.transparent} />
          </Grid>
        )}
        {showAdminPanel && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <AdminPanel setWidgetSettings={setWidgetSettings} />
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default App;