// client/src/app.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Container, Grid, IconButton, Box, Dialog, DialogContent, Button, TextField } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';

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
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      menu: { enabled: false, transparent: false },
      enableOnscreenKeyboard: true,
      textSize: 16,
      cardSize: 300,
      cardPadding: 20,
      cardHeight: 200, // Ensure cardHeight is part of default settings here
      keyboardPosition: 'bottom',
    };
    const savedSettings = localStorage.getItem('widgetSettings');
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
    // Removed widgetSettings logic from here, as it's handled in useState initializer
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

  const handlePageRefresh = () => {
    window.location.reload();
  };

  const toggleKeyboardPosition = () => {
    const newPosition = widgetSettings.keyboardPosition === 'bottom' ? 'top' : 'bottom';
    setWidgetSettings(prevSettings => ({ ...prevSettings, keyboardPosition: newPosition }));
    localStorage.setItem('widgetSettings', JSON.stringify({ ...widgetSettings, keyboardPosition: newPosition }));
  };

  const handleFocus = (e) => {
    setActiveInputName(e.target.name);
    setKeyboardInput(e.target.value);
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

        {/* Onscreen Keyboard */}
        {console.log('App.jsx widgetSettings.enableOnscreenKeyboard:', widgetSettings.enableOnscreenKeyboard)}
        <Box
          sx={{
            position: 'fixed',
            [widgetSettings.keyboardPosition]: 0,
            left: 0,
            width: '50%',
            height: '300px', // Changed for debugging
            zIndex: 1000,
            p: 2,
            bgcolor: 'red', // Changed for debugging
            display: widgetSettings.enableOnscreenKeyboard ? 'block' : 'none', // Control visibility with CSS
          }}
        >
          <Keyboard
            keyboardRef={r => (keyboardRef.current = r)}
            inputName={activeInputName}
            onChange={handleKeyboardChange}
            onKeyPress={handleKeyPress}
          />
        </Box>
      </Container>

      {/* Admin Panel as a Dialog (Popup) */}
      <Dialog open={showAdminPanel} onClose={toggleAdminPanel} maxWidth="300">
        <DialogContent>
          <AdminPanel setWidgetSettings={setWidgetSettings} handleFocus={handleFocus} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default App;
