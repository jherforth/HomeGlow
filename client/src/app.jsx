import React, { useState, useEffect } from 'react';
import { Container, Grid, IconButton } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings'; // New import for the gear icon
import CalendarWidget from './components/CalendarWidget.jsx';
import PhotoWidget from './components/PhotoWidget.jsx';
import ChoreWidget from './components/ChoreWidget.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WeatherWidget from './components/WeatherWidget.jsx';
import './index.css';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [widgetSettings, setWidgetSettings] = useState(() => {
    const savedSettings = localStorage.getItem('widgetSettings');
    return savedSettings ? JSON.parse(savedSettings) : { chores: false, calendar: false, photos: false, weather: false };
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false); // New state for Admin Panel visibility

  // Load theme and widget settings from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedSettings = localStorage.getItem('widgetSettings');
    if (savedSettings) {
      setWidgetSettings(prevSettings => ({
        ...{ chores: false, calendar: false, photos: false, weather: false },
        ...JSON.parse(savedSettings)
      }));
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
        {widgetSettings.calendar && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <CalendarWidget />
          </Grid>
        )}
        {widgetSettings.photos && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <PhotoWidget />
          </Grid>
        )}
        {widgetSettings.chores && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <ChoreWidget />
          </Grid>
        )}
        {widgetSettings.weather && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <WeatherWidget />
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