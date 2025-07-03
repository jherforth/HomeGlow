import React, { useState, useEffect, useRef } from 'react';
import { Container, Grid, IconButton, Box } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';

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
      enableOnscreenKeyboard: false, // Add new setting for onscreen keyboard
    };
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // State for the onscreen keyboard
  const [keyboardInput, setKeyboardInput] = useState('');
  const [activeInputName, setActiveInputName] = useState(''); // Tracks which input field is active
  const keyboardRef = useRef(null);

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
          menu: { enabled: false, transparent: false },
          enableOnscreenKeyboard: false, // Ensure this default is present
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

  // Keyboard handlers
  const handleKeyboardChange = (input) => {
    setKeyboardInput(input);
    // Here, you would typically update the value of the active input field
    // This requires a mechanism to pass the updated value to the specific TextField
    // For now, it just updates the keyboard's internal input state.
  };

  const handleKeyPress = (button) => {
    // Optional: Handle special keys like {enter}, {shift}, etc.
    if (button === "{enter}") {
      console.log("Enter pressed!");
      // You might want to blur the active input or submit a form here
    }
  };

  // Function to update the active input field's value from the keyboard
  // This function will be passed down to components containing TextField inputs
  const updateActiveInputValue = (value) => {
    // This is a placeholder. Actual implementation will depend on how
    // you manage input states in child components.
    // For example, if you have a map of input values:
    // setInputValues(prev => ({ ...prev, [activeInputName]: value }));
  };

  return (
    <Container className="container">
      {/* Theme Toggle Button */}
      <IconButton
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        sx={{ position: 'absolute', top: 16, right: 16 }}
        color="inherit"
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

      <Grid container spacing={2} justifyContent="space-evenly"> {/* Added justifyContent here */}
        {/* Other widgets */}
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
        {showAdminPanel && (
          <Grid item xs={12} sm={6} md={3} className="grid-item">
            <AdminPanel setWidgetSettings={setWidgetSettings} />
          </Grid>
        )}

        {/* Chores Widget - Always in its own full-width row at the bottom */}
        {widgetSettings.chores.enabled && (
          <Grid item xs={12} className="grid-item"> {/* xs={12} makes it full width */}
            <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />
          </Grid>
        )}
      </Grid>

      {/* Onscreen Keyboard */}
      {widgetSettings.enableOnscreenKeyboard && (
        <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, p: 2, bgcolor: 'background.paper' }}>
          <Keyboard
            keyboardRef={r => (keyboardRef.current = r)}
            inputName={activeInputName}
            onChange={handleKeyboardChange}
            onKeyPress={handleKeyPress}
          />
        </Box>
      )}
    </Container>
  );
};

export default App;
