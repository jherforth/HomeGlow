// client/src/app.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Container, IconButton, Box, Dialog, DialogContent, Button } from '@mui/material';
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

  // NEW: Refs and state for JavaScript masonry layout
  const masonryContainerRef = useRef(null);
  const [masonryLayout, setMasonryLayout] = useState([]);
  const [containerWidth, setContainerWidth] = useState(0);

  // Add a flag to prevent multiple simultaneous calculations
  const [isCalculating, setIsCalculating] = useState(false);

  // NEW: Calculate masonry layout function
  const calculateMasonryLayout = async () => {
    if (isCalculating || !masonryContainerRef.current) {
      console.log('Skipping calculation - already calculating or no container');
      return;
    }
    
    setIsCalculating(true);
    console.log('=== Starting masonry calculation ===');
    
    try {
      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (!masonryContainerRef.current) {
        setIsCalculating(false);
        return;
      }

      const container = masonryContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      
      console.log('Container width:', containerWidth);
      
      // Calculate number of columns based on screen width
      let columns = 1;
      if (containerWidth >= 1600) columns = 5;
      else if (containerWidth >= 1200) columns = 4;
      else if (containerWidth >= 900) columns = 3;
      else if (containerWidth >= 600) columns = 2;
      else columns = 1;

      console.log('Using', columns, 'columns');

      const gap = 16;
      const columnWidth = (containerWidth - (gap * (columns - 1))) / columns;
      console.log('Column width:', columnWidth, 'Gap:', gap);
      
      // Get all widget elements
      const widgets = container.querySelectorAll('.masonry-widget');
      console.log('Found', widgets.length, 'widgets');
      
      if (widgets.length === 0) {
        setIsCalculating(false);
        return;
      }
      
      const columnHeights = new Array(columns).fill(0);

      // Reset all widgets to get accurate measurements
      widgets.forEach((widget) => {
        widget.style.position = 'static';
        widget.style.width = 'auto';
        widget.style.left = 'auto';
        widget.style.top = 'auto';
        widget.style.transform = 'none';
      });

      // Force a reflow to ensure measurements are accurate
      container.offsetHeight;

      widgets.forEach((widget, index) => {
        // Find the shortest column
        const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
        const currentColumnHeight = columnHeights[shortestColumnIndex];
        
        // Calculate position
        const x = shortestColumnIndex * (columnWidth + gap);
        const y = currentColumnHeight; // THIS WAS THE BUG - y should be currentColumnHeight, not 0
        
        // Set width first, then measure height
        widget.style.width = `${columnWidth}px`;
        
        // Force reflow and get accurate height
        container.offsetHeight;
        const widgetHeight = widget.offsetHeight;
        
        // Now position absolutely
        widget.style.position = 'absolute';
        widget.style.left = `${x}px`;
        widget.style.top = `${y}px`; // Use the calculated y position
        widget.style.zIndex = '1';
        
        console.log(`Widget ${index}:`);
        console.log(`  Position: x=${x}, y=${y}`);
        console.log(`  Size: width=${columnWidth}, height=${widgetHeight}`);
        console.log(`  Placed in column ${shortestColumnIndex} (was ${currentColumnHeight}px tall)`);
        
        // Update column height - THIS IS THE KEY FIX
        columnHeights[shortestColumnIndex] = currentColumnHeight + widgetHeight + gap;
        console.log(`  Column ${shortestColumnIndex} now ${columnHeights[shortestColumnIndex]}px tall`);
      });

      // Set container height to the tallest column
      const maxHeight = Math.max(...columnHeights);
      container.style.height = `${maxHeight}px`;
      container.style.position = 'relative';
      
      console.log('Final column heights:', columnHeights);
      console.log('Container height set to:', maxHeight);
      console.log('=== Masonry calculation complete ===');
      
    } catch (error) {
      console.error('Error in masonry calculation:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  // Debounced version to prevent excessive calls
  const debouncedCalculateMasonryLayout = React.useCallback(() => {
    clearTimeout(window.masonryTimeout);
    window.masonryTimeout = setTimeout(() => {
      calculateMasonryLayout();
    }, 300);
  }, []);

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
  const renderWidget = (widgetName, index) => {
    switch (widgetName) {
      case 'calendar':
        return widgetSettings.calendar.enabled && 
          <CalendarWidget key={`calendar-${index}`} transparentBackground={widgetSettings.calendar.transparent} icsCalendarUrl={apiKeys.ICS_CALENDAR_URL} />;
      case 'photos':
        return widgetSettings.photos.enabled && 
          <PhotoWidget key={`photos-${index}`} transparentBackground={widgetSettings.photos.transparent} />;
      case 'weather':
        return widgetSettings.weather.enabled && 
          <WeatherWidget key={`weather-${index}`} transparentBackground={widgetSettings.weather.transparent} weatherApiKey={apiKeys.WEATHER_API_KEY} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Container className="container">
        {/* Horizontal widget layout */}
        <Box sx={{ width: '100%', padding: '8px' }}>
          {/* Calendar Widget - Full width horizontal */}
          {widgetSettings.calendar.enabled && (
            <Box sx={{ mb: 2 }}>
              <CalendarWidget transparentBackground={widgetSettings.calendar.transparent} icsCalendarUrl={apiKeys.ICS_CALENDAR_URL} />
            </Box>
          )}

          {/* Weather Widget - Full width horizontal */}
          {widgetSettings.weather.enabled && (
            <Box sx={{ mb: 2 }}>
              <WeatherWidget transparentBackground={widgetSettings.weather.transparent} weatherApiKey={apiKeys.WEATHER_API_KEY} />
            </Box>
          )}

          {/* Chores Widget - Full width horizontal */}
          {widgetSettings.chores.enabled && (
            <Box sx={{ mb: 2 }}>
              <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />
            </Box>
          )}

          {/* Photos Widget - Full width horizontal */}
          {widgetSettings.photos.enabled && (
            <Box sx={{ mb: 2 }}>
              <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />
            </Box>
          )}
        </Box>
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