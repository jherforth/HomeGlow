import React, { useState, useEffect } from 'react';
import { Container, Grid, IconButton } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import CalendarWidget from './components/CalendarWidget';
import PhotoWidget from './components/PhotoWidget';
import ChoreWidget from './components/ChoreWidget';
import AdminPanel from './components/AdminPanel';
import './index.css';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [widgetSettings, setWidgetSettings] = useState({
    chores: false,
    calendar: false,
    photos: false,
  });

  // Load theme and widget settings from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedSettings = localStorage.getItem('widgetSettings');
    if (savedSettings) {
      setWidgetSettings(JSON.parse(savedSettings));
    } else {
      // Default to all widgets disabled
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

  return (
    <Container className="container">
      <IconButton className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'light' ? <Brightness4 /> : <Brightness7 />}
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
        <Grid item xs={12} sm={6} md={3} className="grid-item">
          <AdminPanel setWidgetSettings={setWidgetSettings} />
        </Grid>
      </Grid>
    </Container>
  );
};

export default App;