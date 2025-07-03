import React, { useState, useEffect, useRef } from 'react';
import { Container, Grid, IconButton, Box, Dialog, DialogContent, Button, TextField } from '@mui/material'; // Added TextField
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh'; // New import

// Keyboard imports
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css'; // Default keyboard CSS

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
    const savedSettings = localStorage.getItem('widgetSettings');
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      menu: { enabled: false, transparent: false },
      enableOnscreenKeyboard: false,
      textSize: 16, // Default text size
      cardSize: 300, // Default card width
      cardPadding: 20, // Default card padding
      cardHeight: 200, // Default card height
      keyboardPosition: 'bottom', // Default keyboard position
    };
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const [keyboardInput, setKeyboardInput] = useState('');
  const [activeInputName, setActiveInputName] = useState('');
  const keyboardRef = useRef(null);

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
          menu: { enabled: false, transparent: false },
          enableOnscreenKeyboard: false,
          textSize: 16, // Default text size
          cardSize: 300, // Default card width
          cardPadding: 20, // Default card padding
          cardHeight: 200, // Default card height
          keyboardPosition: 'bottom', // Default keyboard position
        };
        return { ...defaultSettings, ...JSON.parse(savedSettings) };
      });
    } else {
      localStorage.setItem('widgetSettings', JSON.stringify(widgetSettings));
    }
  }, []);

  // Effect to apply dynamic CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--dynamic-text-size', `${widgetSettings.textSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-width', `${widgetSettings.cardSize}px`);
    document.documentElement.style.setProperty('--dynamic-card-padding', `${widgetSettings.cardPadding}px`);
    document.documentElement.style.setProperty('--dynamic-card-height', `${widgetSettings.cardHeight}px`);
  }, [widgetSettings.textSize, widgetSettings.cardSize, widgetSettings.cardPadding, widgetSettings.cardHeight]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const toggleAdminPanel = () => {
    setShowAdminPanel(!showAdminPanel);
  };

  const handleKeyboardChange = (input) => {
    setKeyboardInput(input);
    if (activeInputName) {
      const activeInput = document.querySelector(`input[name="${activeInputName}"]`);
      if (activeInput) {
        activeInput.value = input;
      }
    }
  };

  const handleKeyPress = (button) => {
    if (button === "{enter}") {
      console.log("Enter pressed!");
    }
  };

  const handlePageRefresh = () => { // New function for page refresh
    window.location.reload();
  };

  const toggleKeyboardPosition = () => {
    const newPosition = widgetSettings.keyboardPosition === 'bottom' ? 'top' : 'bottom';
    setWidgetSettings(prevSettings => ({ ...prevSettings, keyboardPosition: newPosition }));
    localStorage.setItem('widgetSettings', JSON.stringify({ ...widgetSettings, keyboardPosition: newPosition }));
  };

  const handleFocus = (e) => {
    setActiveInputName(e.target.name);
  };

  return (
    <> {/* Use a React Fragment to wrap multiple top-level elements */}
      {/* Theme Toggle Button */}
      <IconButton
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        sx={{
          position: 'fixed', // Changed to fixed to ensure it stays in viewport
          top: 16,
          right: 16,
          // Explicitly set color based on theme for inversion effect
          color: theme === 'light' ? 'action.active' : 'white', // Dark icon for light theme, white for dark theme
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
          position: 'fixed', // Changed to fixed
          top: 16,
          right: 64,
          color: theme === 'light' ? 'action.active' : 'white', // Apply same color logic
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
          position: 'fixed', // Changed to fixed
          top: 16,
          right: 112, // Position next to others
          color: theme === 'light' ? 'action.active' : 'white', // Apply same color logic
        }}
      >
        <RefreshIcon />
      </IconButton>

      {/* Keyboard Position Toggle Button */}
      <Button
        onClick={toggleKeyboardPosition}
        sx={{
          position: 'fixed',
          top: 16,
          right: 160,
          color: theme === 'light' ? 'action.active' : 'white',
        }}
      >
        Toggle Keyboard Position
      </Button>

      {/* Removed rotation class from Container as OS will handle rotation */}
      <Container className="container">
        <Grid container spacing={2} justifyContent="space-evenly">
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
          {widgetSettings.weather.enabled && (
            <Grid item xs={12} sm={6} md={3} className="grid-item">
              <WeatherWidget transparentBackground={widgetSettings.weather.transparent} />
            </Grid>
          )}
          {widgetSettings.menu.enabled && (
            <Grid item xs={12} sm={6} md={3} className="grid-item">
              <MenuWidget transparentBackground={widgetSettings.menu.transparent} />
            </Grid>
          )}

          {/* Chores Widget - Always in its own full-width row at the bottom */}
          {widgetSettings.chores.enabled && (
            <Grid item xs={12} className="grid-item">
              <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />
            </Grid>
          )}
        </Grid>

        {/* Example Text Fields */}
        <TextField
          name="example1"
          label="Example 1"
          variant="outlined"
          onFocus={handleFocus}
          fullWidth
          margin="normal"
        />
        <TextField
          name="example2"
          label="Example 2"
          variant="outlined"
          onFocus={handleFocus}
          fullWidth
          margin="normal"
        />

        {/* Onscreen Keyboard */}
        {widgetSettings.enableOnscreenKeyboard && (
          <Box
            sx={{
              position: 'fixed',
              [widgetSettings.keyboardPosition]: 0,
              left: 0,
              width: '50%',
              height: '50%',
              zIndex: 1000,
              p: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Keyboard
              keyboardRef={r => (keyboardRef.current = r)}
              inputName={activeInputName}
              onChange={handleKeyboardChange}
              onKeyPress={handleKeyPress}
            />
          </Box>
        )}
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
