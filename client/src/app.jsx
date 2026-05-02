// client/src/app.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { IconButton, Box, Dialog, DialogContent, Typography } from '@mui/material';
import { Brightness4, Brightness7, Lock, LockOpen, Close } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';

import axios from 'axios';
import PluginWidgetWrapper from './components/PluginWidgetWrapper.jsx';
import WidgetContainer from './components/WidgetContainer.jsx';
import TabBar from './components/TabBar.jsx';
import ScreensaverCountdown from './components/ScreensaverCountdown.jsx';
import { API_BASE_URL } from './utils/apiConfig.js';
import { getDeviceApiBase } from './utils/deviceName.js';
import './index.css';

const loadAdminPanel = () => import('./components/AdminPanel.jsx');
const loadCalendarWidget = () => import('./components/CalendarWidget.jsx');
const loadPhotoWidget = () => import('./components/PhotoWidget.jsx');
const loadWeatherWidget = () => import('./components/WeatherWidget.jsx');
const loadChoreWidget = () => import('./components/ChoreWidget.jsx');
const loadTabIconModal = () => import('./components/TabIconModal.jsx');
const loadScreenSaver = () => import('./components/ScreenSaver.jsx');

const MAX_IDLE_WARM_IMPORTS = 3;

const shouldSkipWarmupForConnection = () => {
  if (typeof navigator === 'undefined') return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;

  if (connection.saveData) return true;

  const effectiveType = connection.effectiveType;
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return true;

  if (typeof connection.downlink === 'number' && connection.downlink > 0 && connection.downlink < 1.2) {
    return true;
  }

  return false;
};

const scheduleIdleWarmup = (work) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(work, { timeout: 1500 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = setTimeout(work, 400);
  return () => clearTimeout(timeoutId);
};

const AdminPanel = lazy(loadAdminPanel);
const CalendarWidget = lazy(loadCalendarWidget);
const PhotoWidget = lazy(loadPhotoWidget);
const WeatherWidget = lazy(loadWeatherWidget);
const ChoreWidget = lazy(loadChoreWidget);
const TabIconModal = lazy(loadTabIconModal);
const ScreenSaver = lazy(loadScreenSaver);

const WidgetLoadingFallback = ({ label }) => (
  <Box
    sx={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      p: 2,
    }}
  >
    <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
      Loading {label}...
    </Typography>
  </Box>
);

const App = () => {
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const [theme, setTheme] = useState('light');
  const [widgetsLocked, setWidgetsLocked] = useState(() => {
    const saved = localStorage.getItem('widgetsLocked');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [screensaverSettings, setScreensaverSettings] = useState(() => {
    const saved = localStorage.getItem('screensaverSettings');
    return saved ? JSON.parse(saved) : {
      enabled: false,
      mode: 'tabs',
      timeout: 5,
      slideshowInterval: 10
    };
  });
  const inactivityTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
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
      } catch { }
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
      } catch { }
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
      const response = await axios.get(`${API_DEVICE_URL}/tabs`);
      setTabs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching tabs:', error);
      setTabs([]);
    }
  };

  const fetchWidgetAssignments = async () => {
    try {
      const response = await axios.get(`${API_DEVICE_URL}/widget-assignments`);
      const assignments = Array.isArray(response.data) ? response.data : [];

      const groupedAssignments = {};
      assignments.forEach(assignment => {
        if (!groupedAssignments[assignment.widget_name]) {
          groupedAssignments[assignment.widget_name] = [];
        }
        groupedAssignments[assignment.widget_name].push({
          tabNumber: assignment.tab_number,
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

  useEffect(() => {
    if (shouldSkipWarmupForConnection()) return;

    const warmLoaders = [
      !!widgetSettings?.calendar?.enabled && loadCalendarWidget,
      !!widgetSettings?.chores?.enabled && loadChoreWidget,
      !!widgetSettings?.weather?.enabled && loadWeatherWidget,
      !!widgetSettings?.photos?.enabled && loadPhotoWidget,
      !!screensaverSettings?.enabled && loadScreenSaver,
    ]
      .filter(Boolean)
      .slice(0, MAX_IDLE_WARM_IMPORTS);

    if (warmLoaders.length === 0) return;

    return scheduleIdleWarmup(() => {
      warmLoaders.forEach((loadWidget) => {
        void loadWidget();
      });
    });
  }, [
    widgetSettings?.calendar?.enabled,
    widgetSettings?.chores?.enabled,
    widgetSettings?.weather?.enabled,
    widgetSettings?.photos?.enabled,
    screensaverSettings?.enabled,
  ]);

  const screensaverActiveRef = useRef(false);
  const screensaverSettingsRef = useRef(screensaverSettings);
  const showAdminPanelRef = useRef(showAdminPanel);
  const tabsRef = useRef(tabs);

  useEffect(() => { screensaverSettingsRef.current = screensaverSettings; }, [screensaverSettings]);
  useEffect(() => { showAdminPanelRef.current = showAdminPanel; }, [showAdminPanel]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const startInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    const settings = screensaverSettingsRef.current;
    if (!settings.enabled || showAdminPanelRef.current) return;

    lastActivityRef.current = Date.now();

    inactivityTimerRef.current = setTimeout(() => {
      screensaverActiveRef.current = true;
      setScreensaverActive(true);
      if (settings.mode === 'tabs' && tabsRef.current.length > 0) {
        document.documentElement.requestFullscreen?.().catch(() => { });
      }
    }, settings.timeout * 60 * 1000);
  }, []);

  useEffect(() => {
    const savedScreensaverSettings = localStorage.getItem('screensaverSettings');
    if (savedScreensaverSettings) {
      setScreensaverSettings(JSON.parse(savedScreensaverSettings));
    }
  }, []);

  useEffect(() => {
    if (!screensaverSettings.enabled) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      return;
    }

    const handleActivity = () => {
      if (screensaverActiveRef.current) return;
      lastActivityRef.current = Date.now();
      startInactivityTimer();
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    startInactivityTimer();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [screensaverSettings.enabled, screensaverSettings.timeout, startInactivityTimer]);

  const handleExitScreensaver = useCallback(() => {
    screensaverActiveRef.current = false;
    setScreensaverActive(false);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { });
    }
    setTimeout(() => startInactivityTimer(), 500);
  }, [startInactivityTimer]);

  const handleScreensaverTabChange = useCallback((tabNumber) => {
    setActiveTab(tabNumber);
  }, []);

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
      const savedScreensaver = localStorage.getItem('screensaverSettings');
      if (savedScreensaver) {
        setScreensaverSettings(JSON.parse(savedScreensaver));
      }
    }
    setShowAdminPanel(!showAdminPanel);
  };

  const handlePageRefresh = () => {
    window.location.reload();
  };

  const handleTabChange = (tabNumber) => {
    setActiveTab(tabNumber);
  };

  const handleAddTab = () => {
    setShowTabIconModal(true);
  };

  const handleSaveTab = async (tabData) => {
    try {
      const response = await axios.post(`${API_DEVICE_URL}/tabs`, tabData);
      await fetchTabs();
      setShowTabIconModal(false);
    } catch (error) {
      console.error('Error creating tab:', error);
      alert('Failed to create tab. Please try again.');
    }
  };

  const handleDeleteTab = async (tabNumber) => {
    if (!window.confirm('Are you sure you want to delete this tab? Widgets will be moved to the Home tab.')) {
      return;
    }

    try {
      await axios.delete(`${API_DEVICE_URL}/tabs/${tabNumber}`);
      await fetchTabs();
      await fetchWidgetAssignments();

      if (activeTab === tabNumber) {
        setActiveTab(1);
      }
    } catch (error) {
      console.error('Error deleting tab:', error);
      alert('Failed to delete tab. Please try again.');
    }
  };

  const isWidgetAssignedToTab = (widgetName, tabNumber) => {
    const assignments = widgetAssignments[widgetName];
    if (!assignments || assignments.length === 0) {
      return tabNumber === 1;
    }
    return assignments.some(a => a.tabNumber === tabNumber);
  };

  const getWidgetLayoutForTab = (widgetName, tabNumber) => {
    const assignments = widgetAssignments[widgetName];
    if (!assignments) return null;
    const match = assignments.find(a => a.tabNumber === tabNumber);
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
        content: (
          <Suspense fallback={<WidgetLoadingFallback label="calendar" />}>
            <CalendarWidget
              transparentBackground={widgetSettings.calendar.transparent}
              icsCalendarUrl={apiKeys.ICS_CALENDAR_URL}
            />
          </Suspense>
        ),
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
        content: (
          <Suspense fallback={<WidgetLoadingFallback label="weather" />}>
            <WeatherWidget
              transparentBackground={widgetSettings.weather.transparent}
              weatherApiKey={apiKeys.WEATHER_API_KEY}
            />
          </Suspense>
        ),
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
        content: (
          <Suspense fallback={<WidgetLoadingFallback label="chores" />}>
            <ChoreWidget transparentBackground={widgetSettings.chores.transparent} />
          </Suspense>
        ),
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
        content: (
          <Suspense fallback={<WidgetLoadingFallback label="photos" />}>
            <PhotoWidget transparentBackground={widgetSettings.photos.transparent} />
          </Suspense>
        ),
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

  const activeTabId = useMemo(() => {
    const active = tabs.find(tab => tab.number === activeTab);
    return active?.id ?? 1;
  }, [tabs, activeTab]);

  const isFirstRunClient = useMemo(() => {
    return localStorage.getItem('widgetSettings') === null;
  }, []);

  return (
    <>
      <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative', pb: '60px' }}>
        {widgets.length > 0 && <WidgetContainer widgets={widgets} locked={widgetsLocked} activeTab={activeTab} activeTabId={activeTabId} />}
        {widgets.length === 0 && isFirstRunClient && (
          <Box
            sx={{
              minHeight: 'calc(100vh - 60px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 3,
              background: 'radial-gradient(circle at 50% 20%, rgba(var(--accent-rgb), 0.16), transparent 55%)',
            }}
          >
            <Box
              sx={{
                width: '100%',
                maxWidth: 620,
                borderRadius: 3,
                border: '1px solid var(--card-border)',
                backgroundColor: 'var(--card-bg)',
                boxShadow: 'var(--shadow)',
                backdropFilter: 'var(--backdrop-blur)',
                textAlign: 'center',
                px: { xs: 3, sm: 5 },
                py: { xs: 3, sm: 4 },
              }}
            >
              <SettingsIcon sx={{ fontSize: 48, color: 'var(--accent)', mb: 1 }} />
              <Typography variant="h5" sx={{ color: 'var(--text)', fontWeight: 700, mb: 1 }}>
                Welcome to HomeGlow
              </Typography>
              <Typography variant="body1" sx={{ color: 'var(--text-secondary)', mb: 1 }}>
                Use the settings gear in the bottom bar to choose which widgets you want to see.
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                Once you enable widgets, this dashboard will fill in automatically.
              </Typography>
            </Box>
          </Box>
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
          <Suspense fallback={<Typography sx={{ py: 2 }}>Loading settings...</Typography>}>
            <AdminPanel
              setWidgetSettings={setWidgetSettings}
              onPluginsChanged={fetchInstalledPlugins}
              onTabsChanged={async () => {
                await fetchTabs();
                await fetchWidgetAssignments();
              }}
            />
          </Suspense>
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

        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: '50px', justifyContent: 'flex-end' }}>
          <ScreensaverCountdown
            enabled={screensaverSettings.enabled}
            timeoutMinutes={screensaverSettings.timeout}
            lastActivityRef={lastActivityRef}
            screensaverActive={screensaverActive}
          />
        </Box>
      </Box>

      <Suspense fallback={null}>
        <TabIconModal
          open={showTabIconModal}
          onClose={() => setShowTabIconModal(false)}
          onSave={handleSaveTab}
        />
      </Suspense>

      {screensaverActive && screensaverSettings.enabled && (
        <Suspense fallback={null}>
          <ScreenSaver
            mode={screensaverSettings.mode}
            slideshowInterval={screensaverSettings.slideshowInterval}
            tabs={tabs}
            onExit={handleExitScreensaver}
            onTabChange={handleScreensaverTabChange}
          />
        </Suspense>
      )}
    </>
  );
};

export default App;
