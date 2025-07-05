// client/src/app.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Container, Grid, IconButton, Box, Dialog, DialogContent, Button } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';

// GeoPattern import - CORRECTED LINE (trying named export for generate)
import { generate } from 'react-geopattern'; // Import 'generate' as a named export

import CalendarWidget from './components/CalendarWidget.jsx';
import PhotoWidget from './components/PhotoWidget.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WeatherWidget from './components/WeatherWidget.jsx';
import MenuWidget from './components/MenuWidget.jsx';
import ChoreWidget from './components/ChoreWidget.jsx';
import './index.css';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [widgetSettings, setWidgetSettings] = useState(() => {
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      menu: { enabled: false, transparent: false },
      textSize: 16,
      cardSize: 300,
      cardPadding: 20,
      cardHeight: 200,
      refreshInterval: 'manual', // NEW: Default refresh interval
      enableGeoPatternBackground: false, // NEW: Default for geometric background
      enableCardShuffle: false, // NEW: Default for card shuffle
    };
    const savedSettings = localStorage.getItem('widgetSettings');
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // State for shuffled widget order
  const [shuffledWidgetOrder, setShuffledWidgetOrder] = useState([]);

  // GeoPattern seed (consistent across light/dark mode)
  const geoPatternSeed = 'HomeGlowDashboard'; // Use a fixed string for consistent pattern

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Effect to apply dynamic CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--dynamic-text-size', `${widgetSettings.textSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-width', `${widgetSettings.cardSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-padding', `${widgetSettings.cardPadding}px`);
    document.documentElement.style.setProperty('--dynamic-card-height', `${widgetSettings.cardHeight}px`);
  }, [widgetSettings.textSize, widgetSettings.cardSize, widgetSettings.cardPadding, widgetSettings.cardHeight]);

  // NEW: Effect for automatic page refresh
  useEffect(() => {
    let intervalId;
    const intervalHours = parseInt(widgetSettings.refreshInterval);

    if (!isNaN(intervalHours) && intervalHours > 0) {
      const intervalMilliseconds = intervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
      intervalId = setInterval(() => {
        console.log(`Auto-refreshing page after ${intervalHours} hours.`);
        window.location.reload();
      }, intervalMilliseconds);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [widgetSettings.refreshInterval]);

  // NEW: Effect for GeoPattern background
  useEffect(() => {
    if (widgetSettings.enableGeoPatternBackground) {
      // Call generate directly as a named export
      const pattern = generate(geoPatternSeed);
      document.body.style.backgroundImage = pattern.toDataUrl();
      document.body.style.backgroundAttachment = 'fixed'; // Ensure it stays fixed
      document.body.style.backgroundSize = 'cover'; // Ensure it covers the whole body
    } else {
      // Revert to original background (from index.css)
      document.body.style.backgroundImage = 'var(--gradient)';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundSize = 'auto'; // Or whatever your default is
    }
  }, [widgetSettings.enableGeoPatternBackground, theme]); // Re-apply if theme changes

  // NEW: Effect for card shuffle
  useEffect(() => {
    const widgetsToShuffle = [];
    if (widgetSettings.calendar.enabled) widgetsToShuffle.push('calendar');
    if (widgetSettings.photos.enabled) widgetsToShuffle.push('photos');
    if (widgetSettings.weather.enabled) widgetsToShuffle.push('weather');
    if (widgetSettings.menu.enabled) widgetsToShuffle.push('menu');

    if (widgetSettings.enableCardShuffle && widgetsToShuffle.length > 0) {
      // Simple shuffle function (Fisher-Yates)
      const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
      };
      setShuffledWidgetOrder(shuffleArray([...widgetsToShuffle]));
    } else {
      // If shuffle is disabled or no widgets to shuffle, revert to default order
      setShuffledWidgetOrder(['calendar', 'photos', 'weather', 'menu'].filter(w => widgetSettings[w].enabled));
    }
  }, [widgetSettings.enableCardShuffle, widgetSettings.calendar.enabled, widgetSettings.photos.enabled, widgetSettings.weather.enabled, widgetSettings.menu.enabled]);


  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const toggleAdminPanel = () => {
    setShowAdminPanel(!showAdminPanel);
  };

  const handlePageRefresh = () => {
    window.location.reload();
  };

  // Helper function to render a widget based on its name
  const renderWidget = (widgetName) => {
    switch (widgetName) {
      case 'calendar':
        return widgetSettings.calendar.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <CalendarWidget transparentBackground={widgetSettings.calendar.transparent} />
          </Grid>
        );
      case 'photos':
        return widgetSettings.photos.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />
          </Grid>
        );
      case 'weather':
        return widgetSettings.weather.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <WeatherWidget transparentBackground={widgetSettings.weather.transparent} />
          </Grid>
        );
      case 'menu':
        return widgetSettings.menu.enabled && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <MenuWidget transparentBackground={widgetSettings.menu.transparent} />
          </Grid>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Theme Toggle Button */}
      <IconButton
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          color: theme === 'light' ? 'action.active' : 'white',
        }}
      >
        {theme === 'light' ? <Brightness4 /> : <Brightness7 />}
      </IconButton>

      {/* Admin Panel Toggle Button (Gear Icon) */}
      <IconButton
        className="admin-toggle"
        onClick={toggleAdminPanel}
        aria-label="Toggle Admin Panel"
        sx={{
          position: 'fixed',
          top: 16,
          right: 64,
          color: theme === 'light' ? 'action.active' : 'white',
        }}
      >
        <SettingsIcon />
      </IconButton>

      {/* Page Refresh Button */}
      <IconButton
        className="refresh-button"
        onClick={handlePageRefresh}
        aria-label="Refresh Page"
        sx={{
          position: 'fixed',
          top: 16,
          right: 112,
          color: theme === 'light' ? 'action.active' : 'white',
        }}
      >
        <RefreshIcon />
      </IconButton>

      <Container className="container">
        <Grid container spacing={2} justifyContent="space-evenly">
          {/* Render shuffled widgets */}
          {shuffledWidgetOrder.map(widgetName => (
            <React.Fragment key={widgetName}>
              {renderWidget(widgetName)}
            </React.Fragment>
          ))}

          {/* Chores Widget - Always in its own full-width row at the bottom, or top if shuffled */}
          {widgetSettings.chores.enabled && (
            <Grid item xs={12} className="grid-item">
              <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />
            </Grid>
          )}
        </Grid>
      </Container>

      {/* Admin Panel as a Dialog (Popup) */}
      <Dialog open={showAdminPanel} onClose={toggleAdminPanel} maxWidth="300">
        <DialogContent>
          <AdminPanel setWidgetSettings={setWidgetSettings} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default App;
