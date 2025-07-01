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

  // Load theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Toggle theme and save to localStorage
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
        <Grid item xs={12} sm={6} md={3} className="grid-item">
          <CalendarWidget />
        </Grid>
        <Grid item xs={12} sm={6} md={3} className="grid-item">
          <PhotoWidget />
        </Grid>
        <Grid item xs={12} sm={6} md={3} className="grid-item">
          <ChoreWidget />
        </Grid>
        <Grid item xs={12} sm={6} md={3} className="grid-item">
          <AdminPanel />
        </Grid>
      </Grid>
    </Container>
  );
};

export default App;