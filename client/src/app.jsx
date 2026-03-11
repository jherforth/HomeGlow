// client/src/app.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { IconButton, Box, Dialog, DialogContent } from '@mui/material';
import { Brightness4, Brightness7, Lock, LockOpen, Close } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';

import axios from 'axios';
import CalendarWidget from './components/CalendarWidget.jsx';
import PhotoWidget from './components/PhotoWidget.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WeatherWidget from './components/WeatherWidget.jsx';
import ChoreWidget from './components/ChoreWidget.jsx';
import PluginWidgetWrapper from './components/PluginWidgetWrapper.jsx';
import WidgetContainer from './components/WidgetContainer.jsx';
import TabBar from './components/TabBar.jsx';
import TabIconModal from './components/TabIconModal.jsx';
import { API_BASE_URL } from './utils/apiConfig.js';
import './index.css';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [widgetsLocked, setWidgetsLocked] = useState(() => {
    const saved = localStorage.getItem('widgetsLocked');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [widgetSettings, setWidgetSettings] = useState(() => {
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
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
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [activeTab, setActiveTab] = useState(1);
  const [tabs, setTabs] = useState([]);
  const [widgetAssignments, setWidgetAssignments] = useState({});
  const [showTabIconModal, setShowTabIconModal] = useState(false);

  const fetchInstalledPlugins = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/widgets`);
      setInstalledPlugins(Array.isArray(response.data) ? response.data : []);
    } catch {
      setInstalledPlugins([]);
    }
  };

  useEffect(() => {
    const oldEnabled = localStorage.getItem('enabledWidgets');
    if (oldEnabled) {
      try {
        const parsed = JSON.parse(oldEnabled);
        const existing = JSON.parse(localStorage.getItem('pluginSettings') || '{}');
        Object.entries(parsed).forEach(([filename, isEnabled]) => {
          if (!existing[filename]) {
            existing[filename] = { enabled: !!isEnabled, transparent: false, refreshInterval: 0 };
          }
        });
        localStorage.setItem('pluginSettings', JSON.stringify(existing));
      } catch {}
      localStorage.removeItem('enabledWidgets');
    }
    const ws = localStorage.getItem('widgetSettings');
    if (ws) {
      try {
        const parsed = JSON.parse(ws);
        if (parsed.widgetGallery) {
          delete parsed.widgetGallery;
          localStorage.setItem('widgetSettings', JSON.stringify(parsed));
        }
      } catch {}
    }
  }, []);

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
    fetchInstalledPlugins();
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
        groupedAssignments[assignment.widget_name].push({
          tab_id: assignment.tab_id,
          layout_x: assignment.layout_x,
          layout_y: assignment.layout_y,
          layout_w: assignment.layout_w,
          layout_h: assignment.layout_h,
        });
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

    if (savedTheme === 'light') {
      const savedSettings = localStorage.getItem('widgetSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        const primaryColor = parsed.primary || '#f5f5f5';
        document.documentElement.style.setProperty('--background', primaryColor);
      }
    }
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

    if (newTheme === 'light') {
      const savedSettings = localStorage.getItem('widgetSettings');
      const parsed = savedSettings ? JSON.parse(savedSettings) : {};
      const primaryColor = parsed.primary || '#f5f5f5';
      document.documentElement.style.setProperty('--background', primaryColor);
    } else {
      document.documentElement.style.removeProperty('--background');
    }
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
    return assignments.some(a => a.tab_id === tabId);
  };

  const getWidgetLayoutForTab = (widgetName, tabId) => {
    const assignments = widgetAssignments[widgetName];
    if (!assignments) return null;
    const match = assignments.find(a => a.tab_id === tabId);
    if (!match || match.layout_x == null) return null;
    return { x: match.layout_x, y: match.layout_y, w: match.layout_w, h: match.layout_h };
  };

  const widgets = useMemo(() => {
    const result = [];

    if (widgetSettings.calendar.enabled && isWidgetAssignedToTab('calendar', activeTab)) {
      const dbLayout = getWidgetLayoutForTab('calendar', activeTab);
      result.push({
        id: 'calendar-widget',
        defaultPosition: { x: 0, y: 0 },
        defaultSize: { width: 8, height: 5 },
        minWidth: 2,
        minHeight: 2,
        savedLayout: dbLayout,
        content: <CalendarWidget
          transparentBackground={widgetSettings.calendar.transparent}
          icsCalendarUrl={apiKeys.ICS_CALENDAR_URL}
        />,
      });
    }

    if (widgetSettings.weather.enabled && isWidgetAssignedToTab('weather', activeTab)) {
      const dbLayout = getWidgetLayoutForTab('weather', activeTab);
      result.push({
        id: 'weather-widget',
        defaultPosition: { x: 8, y: 0 },
        defaultSize: { width: 4, height: 3 },
        minWidth: 2,
        minHeight: 2,
        savedLayout: dbLayout,
        content: <WeatherWidget
          transparentBackground={widgetSettings.weather.transparent}
          weatherApiKey={apiKeys.WEATHER_API_KEY}
        />,
      });
    }

    if (widgetSettings.chores.enabled && isWidgetAssignedToTab('chores', activeTab)) {
      const dbLayout = getWidgetLayoutForTab('chores', activeTab);
      result.push({
        id: 'chores-widget',
        defaultPosition: { x: 0, y: 5 },
        defaultSize: { width: 6, height: 4 },
        minWidth: 2,
        minHeight: 2,
        savedLayout: dbLayout,
        content: <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />,
      });
    }

    if (widgetSettings.photos.enabled && isWidgetAssignedToTab('photos', activeTab)) {
      const dbLayout = getWidgetLayoutForTab('photos', activeTab);
      result.push({
        id: 'photos-widget',
        defaultPosition: { x: 6, y: 5 },
        defaultSize: { width: 6, height: 4 },
        minWidth: 2,
        minHeight: 2,
        savedLayout: dbLayout,
        content: <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />,
      });
    }

    const pluginSettings = JSON.parse(localStorage.getItem('pluginSettings') || '{}');
    installedPlugins.forEach((plugin, index) => {
      const pSettings = pluginSettings[plugin.filename] || {};
      if (!pSettings.enabled) return;

      const pluginWidgetName = `plugin:${plugin.filename}`;
      if (!isWidgetAssignedToTab(pluginWidgetName, activeTab)) return;

      const dbLayout = getWidgetLayoutForTab(pluginWidgetName, activeTab);
      result.push({
        id: `plugin-${plugin.filename}`,
        defaultPosition: { x: 0, y: 0 },
        defaultSize: { width: 6, height: 4 },
        minWidth: 2,
        minHeight: 2,
        savedLayout: dbLayout,
        content: <PluginWidgetWrapper
          filename={plugin.filename}
          name={plugin.name}
          theme={theme}
          transparentBackground={pSettings.transparent || false}
        />,
      });
    });

    return result;
  }, [widgetSettings, activeTab, apiKeys, widgetAssignments, installedPlugins, theme]);

  return (
    <>
      <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative', pb: '60px' }}>
        {widgets.length > 0 && <WidgetContainer widgets={widgets} locked={widgetsLocked} activeTab={activeTab} />}
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
          <AdminPanel setWidgetSettings={setWidgetSettings} onPluginsChanged={fetchInstalledPlugins} />
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
