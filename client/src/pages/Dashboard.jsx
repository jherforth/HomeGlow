import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, Switch, FormControlLabel } from '@mui/material';
import { Settings } from '@mui/icons-material';
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
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchSettings();
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

  const widgets = [
    {
      id: 'calendar-widget',
      defaultPosition: { x: 0, y: 0 },
      defaultSize: { width: 6, height: 5 },
      minWidth: 4,
      minHeight: 3,
      content: <CalendarWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Calendar moved to:', pos),
      onSizeChange: (size) => console.log('Calendar resized to:', size),
    },
    {
      id: 'weather-widget',
      defaultPosition: { x: 6, y: 0 },
      defaultSize: { width: 3, height: 3 },
      minWidth: 2,
      minHeight: 2,
      content: <WeatherWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Weather moved to:', pos),
      onSizeChange: (size) => console.log('Weather resized to:', size),
    },
    {
      id: 'chores-widget',
      defaultPosition: { x: 0, y: 5 },
      defaultSize: { width: 4, height: 4 },
      minWidth: 3,
      minHeight: 2,
      content: <ChoreWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Chores moved to:', pos),
      onSizeChange: (size) => console.log('Chores resized to:', size),
    },
    {
      id: 'photos-widget',
      defaultPosition: { x: 4, y: 5 },
      defaultSize: { width: 4, height: 4 },
      minWidth: 3,
      minHeight: 2,
      content: <PhotoWidget transparentBackground={settings.transparentBackground} />,
      onPositionChange: (pos) => console.log('Photos moved to:', pos),
      onSizeChange: (size) => console.log('Photos resized to:', size),
    },
  ];

  return (
    <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative' }}>
      {/* Header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'var(--text)' }}>
            🏠 HomeGlow Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Click any widget to select, drag to move, resize from corners
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.transparentBackground}
                onChange={handleTransparencyToggle}
                color="primary"
              />
            }
            label="Transparent Widgets"
          />
          <IconButton
            onClick={() => setShowSettings(!showSettings)}
            sx={{ color: 'var(--text)' }}
          >
            <Settings />
          </IconButton>
        </Box>
      </Box>

      {/* Widget Container */}
      <WidgetContainer widgets={widgets} />
    </Box>
  );
};

export default Dashboard;
