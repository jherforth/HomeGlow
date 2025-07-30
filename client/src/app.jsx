// client/src/app.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Container, Grid, IconButton, Box, Dialog, DialogContent, Button } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// GeoPattern import - CORRECTED LINE (using the direct geopattern library)
import GeoPattern from 'geopattern'; // Import GeoPattern from the 'geopattern' package

import axios from 'axios';
import CalendarWidget from './components/CalendarWidget.jsx';
import PhotoWidget from './components/PhotoWidget.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WeatherWidget from './components/WeatherWidget.jsx';
import ChoreWidget from './components/ChoreWidget.jsx';
import WidgetGallery from './components/WidgetGallery.jsx';
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
      enableCardShuffle: false,
      // NEW: Color settings
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

  // State for shuffled widget order
  const [shuffledWidgetOrder, setShuffledWidgetOrder] = useState([]);

  // NEW: State for dynamic GeoPattern seed
  const [currentGeoPatternSeed, setCurrentGeoPatternSeed] = useState('');

  // NEW: State for API keys fetched from backend
  const [apiKeys, setApiKeys] = useState({
    WEATHER_API_KEY: '',
    ICS_CALENDAR_URL: '',
  });

  // NEW: State for bottom bar collapse
  const [isBottomBarCollapsed, setIsBottomBarCollapsed] = useState(true);

  // NEW: State to trigger widget gallery refresh
  const [widgetGalleryKey, setWidgetGalleryKey] = useState(0);

  // NEW: Function to refresh widget gallery
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
  }, []); // Run once on mount

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // NEW: Generate a random seed once on component mount
    // This ensures a new pattern on each full page refresh
    setCurrentGeoPatternSeed(Math.random().toString());
  }, []);

  // Effect to apply dynamic CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--dynamic-text-size', `${widgetSettings.textSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-width', `${widgetSettings.cardSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-padding', `${widgetSettings.cardPadding}px`);
    document.documentElement.style.setProperty('--dynamic-card-height', `${widgetSettings.cardHeight}px`);

    // NEW: Apply custom color variables
    document.documentElement.style.setProperty('--light-gradient-start', widgetSettings.lightGradientStart);
    document.documentElement.style.setProperty('--light-gradient-end', widgetSettings.lightGradientEnd);
    document.documentElement.style.setProperty('--dark-gradient-start', widgetSettings.darkGradientStart);
    document.documentElement.style.setProperty('--dark-gradient-end', widgetSettings.darkGradientEnd);
    document.documentElement.style.setProperty('--light-button-gradient-start', widgetSettings.lightButtonGradientStart);
    document.documentElement.style.setProperty('--light-button-gradient-end', widgetSettings.lightButtonGradientEnd);
    document.documentElement.style.setProperty('--dark-button-gradient-start', widgetSettings.darkButtonGradientStart);
    document.documentElement.style.setProperty('--dark-button-gradient-end', widgetSettings.darkButtonGradientEnd);

  }, [widgetSettings]); // Depend on all widgetSettings to re-apply colors when they change

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

  // NEW: Effect to update body padding based on bottom bar height
  useEffect(() => {
    const barHeight = isBottomBarCollapsed ? 40 : 100; // Approximate height of collapsed/expanded bar
    document.documentElement.style.setProperty('--bottom-bar-height', `${barHeight}px`);
  }, [isBottomBarCollapsed]);

  // NEW: Effect for GeoPattern background and container transparency
  useEffect(() => {
    if (widgetSettings.enableGeoPatternBackground) {
      // Call generate directly from the imported GeoPattern using the dynamic seed
      const pattern = GeoPattern.generate(currentGeoPatternSeed);
      document.body.style.backgroundImage = pattern.toDataUrl();
      document.body.style.backgroundAttachment = 'fixed'; // Ensure it stays fixed
      document.body.style.backgroundSize = 'cover'; // Ensure it covers the whole body

      // Make the main container transparent to reveal the body background
      document.documentElement.style.setProperty('--container-background-override', 'transparent');
    } else {
      // Revert to original background (from index.css)
      document.body.style.backgroundImage = 'var(--gradient)';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundSize = 'auto'; // Or whatever your default is

      // Revert container background
      document.documentElement.style.setProperty('--container-background-override', 'var(--gradient)');
    }
  }, [widgetSettings.enableGeoPatternBackground, theme, currentGeoPatternSeed]); // Re-apply if theme or seed changes

  // NEW: Effect for card shuffle
  useEffect(() => {
    const widgetsToShuffle = [];
    if (widgetSettings.calendar.enabled) widgetsToShuffle.push('calendar');
    if (widgetSettings.photos.enabled) widgetsToShuffle.push('photos');
    if (widgetSettings.weather.enabled) widgetsToShuffle.push('weather');

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
      setShuffledWidgetOrder(['calendar', 'photos', 'weather'].filter(w => widgetSettings[w].enabled));
    }
  }, [widgetSettings.enableCardShuffle, widgetSettings.calendar.enabled, widgetSettings.photos.enabled, widgetSettings.weather.enabled]);


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

  const toggleBottomBar = () => {
    setIsBottomBarCollapsed(!isBottomBarCollapsed);
  };
  // Helper function to render a widget based on its name
  const renderWidget = (widgetName) => {
    // Calculate responsive breakpoints based on enabled widgets count
    const enabledWidgetsCount = shuffledWidgetOrder.length;
    let breakpoints = { xs: 12, sm: 6, md: 4, lg: 3, xl: 3 }; // Default
    
    // Dynamic breakpoints based on widget count for optimal space usage
    if (enabledWidgetsCount === 1) {
      breakpoints = { xs: 12, sm: 12, md: 12, lg: 12, xl: 12 };
    } else if (enabledWidgetsCount === 2) {
      breakpoints = { xs: 12, sm: 6, md: 6, lg: 6, xl: 6 };
    } else if (enabledWidgetsCount === 3) {
      breakpoints = { xs: 12, sm: 6, md: 4, lg: 4, xl: 4 };
    } else if (enabledWidgetsCount >= 4) {
      breakpoints = { xs: 12, sm: 6, md: 4, lg: 3, xl: 3 };
    }

    switch (widgetName) {
      case 'calendar':
        return widgetSettings.calendar.enabled && (
          <Grid item {...breakpoints} className="grid-item">
            <CalendarWidget transparentBackground={widgetSettings.calendar.transparent} icsCalendarUrl={apiKeys.ICS_CALENDAR_URL} />
          </Grid>
        );
      case 'photos':
        return widgetSettings.photos.enabled && (
          <Grid item {...breakpoints} className="grid-item">
            <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />
          </Grid>
        );
      case 'weather':
        return widgetSettings.weather.enabled && (
          <Grid item {...breakpoints} className="grid-item">
            <WeatherWidget transparentBackground={widgetSettings.weather.transparent} weatherApiKey={apiKeys.WEATHER_API_KEY} />
          </Grid>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Container className="container">
        <Grid container spacing={2} justifyContent="center" alignItems="flex-start">
        <Grid container spacing={1} sx={{ 
          width: '100%',
          margin: 0,
          '& .MuiGrid-item': {
            paddingLeft: '4px !important',
            paddingTop: '4px !important'
          }
        }}>
          {/* Render shuffled widgets */}
          {shuffledWidgetOrder.map(widgetName => (
            <React.Fragment key={widgetName}>
              {renderWidget(widgetName)}
            </React.Fragment>
          ))}

          {/* Chores Widget - Always in its own full-width row at the bottom, or top if shuffled */}
          {widgetSettings.chores.enabled && (
            <Grid item xs={12} className="grid-item chores-widget" sx={{ width: '100%' }}>
              <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />
            </Grid>
          )}
        </Grid>
        </Grid>
      </Container>

      <WidgetGallery key={widgetGalleryKey} theme={theme} />

      {/* Admin Panel as a Dialog (Popup) */}
      <Dialog open={showAdminPanel} onClose={toggleAdminPanel} maxWidth="lg"> {/* CHANGED maxWidth to "lg" */}
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
          height: isBottomBarCollapsed ? '40px' : '100px', // Fixed height for collapsed, 100px for expanded
          overflow: 'hidden', // Hide overflowing content when collapsed
        }}
      >
        {/* Toggle Button for the bar */}
        <IconButton
          onClick={toggleBottomBar}
          aria-label={isBottomBarCollapsed ? 'Expand bottom bar' : 'Collapse bottom bar'}
          sx={{
            color: theme === 'light' ? 'action.active' : 'white',
            alignSelf: 'flex-end', // Position to the right
            marginRight: '10px',
            padding: '5px',
          }}
        >
          {isBottomBarCollapsed ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>

        {!isBottomBarCollapsed && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            {/* App Logo Placeholder */}
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

            {/* Admin Panel Toggle Button (Gear Icon) */}
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
