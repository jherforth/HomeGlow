import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, Switch, FormControlLabel, Tooltip } from '@mui/material';
import { Refresh, Brightness4, Brightness7 } from '@mui/icons-material';
import WidgetContainer from '../components/WidgetContainer';
import CalendarWidget from '../components/CalendarWidget';
import WeatherWidget from '../components/WeatherWidget';
import ChoreWidget from '../components/ChoreWidget';
import PhotoWidget from '../components/PhotoWidget';
import axios from 'axios';

const Dashboard = () => {
  const [settings, setSettings] = useState({
    transparentBackground: false,
    icsCalendarUrl: ''
  });
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    fetchSettings();
    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setIsDarkMode(savedTheme === 'dark');
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`);
      setSettings({
        transparentBackground: response.data.TRANSPARENT_BACKGROUND === 'true',
        icsCalendarUrl: response.data.ICS_CALENDAR_URL || ''
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleTransparencyToggle = async (event) => {
    const newValue = event.target.checked;
    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`, {
        key: 'TRANSPARENT_BACKGROUND',
        value: newValue.toString()
      });
      setSettings(prev => ({ ...prev, transparentBackground: newValue }));
    } catch (error) {
      console.error('Error updating transparency setting:', error);
    }
  };

  const handleThemeToggle = () => {
    const newTheme = isDarkMode ? 'light' : 'dark';
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const widgets = [
    {
      id: 'calendar-widget',
      defaultPosition: { x: 0, y: 0 },
      defaultSize: { width: 8, height: 5 },
      minWidth: 6,
      minHeight: 4,
      content: <CalendarWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Calendar moved to:', pos),
      onSizeChange: (size) => console.log('Calendar resized to:', size),
    },
    {
      id: 'weather-widget',
      defaultPosition: { x: 8, y: 0 },
      defaultSize: { width: 4, height: 3 },
      minWidth: 3,
      minHeight: 2,
      content: <WeatherWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Weather moved to:', pos),
      onSizeChange: (size) => console.log('Weather resized to:', size),
    },
    {
      id: 'chores-widget',
      defaultPosition: { x: 0, y: 5 },
      defaultSize: { width: 6, height: 4 },
      minWidth: 4,
      minHeight: 3,
      content: <ChoreWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Chores moved to:', pos),
      onSizeChange: (size) => console.log('Chores resized to:', size),
    },
    {
      id: 'photos-widget',
      defaultPosition: { x: 6, y: 5 },
      defaultSize: { width: 6, height: 4 },
      minWidth: 4,
      minHeight: 3,
      content: <PhotoWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Photos moved to:', pos),
      onSizeChange: (size) => console.log('Photos resized to:', size),
    },
  ];

  return (
    <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative', paddingBottom: '40px' }}>
      {/* Widget Container */}
      <WidgetContainer widgets={widgets} />

      {/* Fixed Bottom Settings Bar */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40px',
          zIndex: 1100,
          backgroundColor: 'var(--bottom-bar-bg)',
          borderTop: '1px solid var(--border)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Left: Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <img 
            src="/HomeGlowLogo.png" 
            alt="HomeGlow Logo" 
            style={{ 
              height: '36px',
              width: 'auto',
              objectFit: 'contain'
            }} 
          />
        </Box>

        {/* Right: Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Transparent Widgets Toggle */}
          <Tooltip title="Toggle transparent widget backgrounds" arrow>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.transparentBackground}
                  onChange={handleTransparencyToggle}
                  color="primary"
                  size="small"
                />
              }
              label={
                <Typography variant="caption" sx={{ fontSize: '0.75rem', color: 'var(--text)' }}>
                  Transparent
                </Typography>
              }
              sx={{ margin: 0 }}
            />
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"} arrow>
            <IconButton
              onClick={handleThemeToggle}
              size="small"
              sx={{ 
                color: 'var(--text)',
                padding: '6px',
                '&:hover': {
                  backgroundColor: 'rgba(158, 127, 255, 0.1)',
                }
              }}
            >
              {isDarkMode ? <Brightness7 fontSize="small" /> : <Brightness4 fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Refresh Button */}
          <Tooltip title="Refresh dashboard" arrow>
            <IconButton
              onClick={handleRefresh}
              size="small"
              sx={{ 
                color: 'var(--text)',
                padding: '6px',
                '&:hover': {
                  backgroundColor: 'rgba(158, 127, 255, 0.1)',
                }
              }}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
