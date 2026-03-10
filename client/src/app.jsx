// client/src/app.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Container, IconButton, Box, Dialog, DialogContent } from '@mui/material';
import { Brightness4, Brightness7, Lock, LockOpen, Close } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';

import axios from 'axios';
import CalendarWidget from './components/CalendarWidget.jsx';
import PhotoWidget from './components/PhotoWidget.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WeatherWidget from './components/WeatherWidget.jsx';
import ChoreWidget from './components/ChoreWidget.jsx';
import WidgetGallery from './components/WidgetGallery.jsx';
import WidgetContainer from './components/WidgetContainer.jsx';
import TabBar from './components/TabBar.jsx';
import TabIconModal from './components/TabIconModal.jsx';
import { API_BASE_URL } from './utils/apiConfig.js';
import './index.css';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [widgetsLocked, setWidgetsLocked] = useState(() => {
    const saved = localStorage.getItem('widgetsLocked');
    return saved !== null ? JSON.parse(saved) : true; // Default to locked
  });
  const [widgetSettings, setWidgetSettings] = useState(() => {
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      widgetGallery: { enabled: true, transparent: false },
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
  const [currentGeoPatternSeed, setCurrentGeoPatternSeed] = useState('');
  const [apiKeys, setApiKeys] = useState({
    WEATHER_API_KEY: '',
    ICS_CALENDAR_URL: '',
  });
  const [widgetGalleryKey, setWidgetGalleryKey] = useState(0);
  const [activeTab, setActiveTab] = useState(1);
  const [tabs, setTabs] = useState([]);
  const [widgetAssignments, setWidgetAssignments] = useState({});
  const [showTabIconModal, setShowTabIconModal] = useState(false);

  const refreshWidgetGallery = () => {
    setWidgetGalleryKey(prev => prev + 1);
  };

  useEffect(() => {
    const fetchApiKeys = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/settings`);
        setApiKeys(response.data);
      } catch (error) {
        console.error('Error fetching API keys:', error);
      }
    };
    fetchApiKeys();
    fetchTabs();
    fetchWidgetAssignments();
  }, []);

  const fetchTabs = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tabs`);
      setTabs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching tabs:', error);
      setTabs([]);
    }
  };

  const fetchWidgetAssignments = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/widget-assignments`);
      const assignments = Array.isArray(response.data) ? response.data : [];

      const groupedAssignments = {};
      assignments.forEach(assignment => {
        if (!groupedAssignments[assignment.widget_name]) {
          groupedAssignments[assignment.widget_name] = [];
        }
        groupedAssignments[assignment.widget_name].push(assignment.tab_id);
      });

      setWidgetAssignments(groupedAssignments);
    } catch (error) {
      console.error('Error fetching widget assignments:', error);
      setWidgetAssignments({});
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
    setCurrentGeoPatternSeed(Math.random().toString());
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--light-gradient-start', widgetSettings.lightGradientStart);
    document.documentElement.style.setProperty('--light-gradient-end', widgetSettings.lightGradientEnd);
    document.documentElement.style.setProperty('--dark-gradient-start', widgetSettings.darkGradientStart);
    document.documentElement.style.setProperty('--dark-gradient-end', widgetSettings.darkGradientEnd);
    document.documentElement.style.setProperty('--light-button-gradient-start', widgetSettings.lightButtonGradientStart);
    document.documentElement.style.setProperty('--light-button-gradient-end', widgetSettings.lightButtonGradientEnd);
    document.documentElement.style.setProperty('--dark-button-gradient-start', widgetSettings.darkButtonGradientStart);
    document.documentElement.style.setProperty('--dark-button-gradient-end', widgetSettings.darkButtonGradientEnd);
    document.documentElement.style.setProperty('--bottom-bar-height', '60px');
  }, [widgetSettings]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const toggleWidgetsLock = () => {
    const newLockState = !widgetsLocked;
    setWidgetsLocked(newLockState);
    localStorage.setItem('widgetsLocked', JSON.stringify(newLockState));
  };

  const toggleAdminPanel = () => {
    if (showAdminPanel) {
      const savedSettings = localStorage.getItem('widgetSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setWidgetSettings(prev => ({ ...prev, ...parsed }));
      }
    }
    setShowAdminPanel(!showAdminPanel);
  };

  const handlePageRefresh = () => {
    window.location.reload();
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  const handleAddTab = () => {
    setShowTabIconModal(true);
  };

  const handleSaveTab = async (tabData) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/tabs`, tabData);
      await fetchTabs();
      setShowTabIconModal(false);
    } catch (error) {
      console.error('Error creating tab:', error);
      alert('Failed to create tab. Please try again.');
    }
  };

  const handleDeleteTab = async (tabId) => {
    if (!window.confirm('Are you sure you want to delete this tab? Widgets will be moved to the Home tab.')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/tabs/${tabId}`);
      await fetchTabs();
      await fetchWidgetAssignments();

      if (activeTab === tabId) {
        setActiveTab(1);
      }
    } catch (error) {
      console.error('Error deleting tab:', error);
      alert('Failed to delete tab. Please try again.');
    }
  };

  const isWidgetAssignedToTab = (widgetName, tabId) => {
    const assignments = widgetAssignments[widgetName];
    if (!assignments || assignments.length === 0) {
      return tabId === 1;
    }
    return assignments.includes(tabId);
  };

  const widgets = useMemo(() => {
    const result = [];

    if (widgetSettings.calendar.enabled && isWidgetAssignedToTab('calendar', activeTab)) {
      result.push({
        id: 'calendar-widget',
        defaultPosition: { x: 0, y: 0 },
        defaultSize: { width: 8, height: 5 },
        minWidth: 2,
        minHeight: 2,
        content: <CalendarWidget
          transparentBackground={widgetSettings.calendar.transparent}
          icsCalendarUrl={apiKeys.ICS_CALENDAR_URL}
        />,
      });
    }

    if (widgetSettings.weather.enabled && isWidgetAssignedToTab('weather', activeTab)) {
      result.push({
        id: 'weather-widget',
        defaultPosition: { x: 8, y: 0 },
        defaultSize: { width: 4, height: 3 },
        minWidth: 2,
        minHeight: 2,
        content: <WeatherWidget
          transparentBackground={widgetSettings.weather.transparent}
          weatherApiKey={apiKeys.WEATHER_API_KEY}
        />,
      });
    }

    if (widgetSettings.chores.enabled && isWidgetAssignedToTab('chores', activeTab)) {
      result.push({
        id: 'chores-widget',
        defaultPosition: { x: 0, y: 5 },
        defaultSize: { width: 6, height: 4 },
        minWidth: 2,
        minHeight: 2,
        content: <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />,
      });
    }

    if (widgetSettings.photos.enabled && isWidgetAssignedToTab('photos', activeTab)) {
      result.push({
        id: 'photos-widget',
        defaultPosition: { x: 6, y: 5 },
        defaultSize: { width: 6, height: 4 },
        minWidth: 2,
        minHeight: 2,
        content: <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />,
      });
    }

    return result;
  }, [widgetSettings, activeTab, apiKeys, widgetAssignments]);

  return (
    <>
      <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative', pb: '60px' }}>
        {widgets.length > 0 && <WidgetContainer widgets={widgets} locked={widgetsLocked} activeTab={activeTab} />}

        {widgetSettings.widgetGallery?.enabled && activeTab === 1 && (
          <Container className="container" sx={{ mt: widgets.length > 0 ? 1 : 0 }}>
            <WidgetGallery
              key={widgetGalleryKey}
              theme={theme}
              transparentBackground={widgetSettings.widgetGallery?.transparent || false}
            />
          </Container>
        )}
      </Box>

      <Dialog open={showAdminPanel} onClose={toggleAdminPanel} maxWidth="lg">
        <DialogContent sx={{ position: 'relative' }}>
          <IconButton
            onClick={toggleAdminPanel}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: 'text.secondary',
              zIndex: 1,
              '&:hover': {
                color: 'error.main',
              },
            }}
          >
            <Close />
          </IconButton>
          <AdminPanel setWidgetSettings={setWidgetSettings} onWidgetUploaded={refreshWidgetGallery} />
        </DialogContent>
      </Dialog>

      {/* Fixed Bottom Bar */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: '50px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 20px',
          backgroundColor: 'var(--bottom-bar-bg)',
          borderTop: '1px solid var(--card-border)',
          backdropFilter: 'var(--backdrop-blur)',
          boxShadow: 'var(--shadow)',
          zIndex: 1000,
        }}
      >
        {/* Left: TabBar */}
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          widgetsLocked={widgetsLocked}
          onAddTab={handleAddTab}
          onDeleteTab={handleDeleteTab}
        />

        {/* Center: Control Buttons */}
        <Box sx={{ 
          display: 'flex', 
          gap: 1,
          alignItems: 'center',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)'
        }}>
          <IconButton
            onClick={toggleTheme}
            aria-label="Toggle theme"
            sx={{
              color: theme === 'light' ? 'action.active' : 'white',
            }}
          >
            {theme === 'light' ? <Brightness4 /> : <Brightness7 />}
          </IconButton>

          <IconButton
            onClick={toggleWidgetsLock}
            aria-label={widgetsLocked ? "Unlock widgets" : "Lock widgets"}
            sx={{
              color: widgetsLocked 
                ? (theme === 'light' ? 'action.active' : 'white')
                : 'var(--accent)',
              transition: 'color 0.2s ease',
            }}
          >
            {widgetsLocked ? <Lock /> : <LockOpen />}
          </IconButton>

          <IconButton
            onClick={toggleAdminPanel}
            aria-label="Toggle Admin Panel"
            sx={{
              color: theme === 'light' ? 'action.active' : 'white',
            }}
          >
            <SettingsIcon />
          </IconButton>

          <IconButton
            onClick={handlePageRefresh}
            aria-label="Refresh Page"
            sx={{
              color: theme === 'light' ? 'action.active' : 'white',
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>

        {/* Right: Empty space for balance */}
        <Box sx={{ width: '50px' }} />
      </Box>

      <TabIconModal
        open={showTabIconModal}
        onClose={() => setShowTabIconModal(false)}
        onSave={handleSaveTab}
      />
    </>
  );
};

export default App;
