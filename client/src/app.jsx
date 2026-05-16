// client/src/app.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { IconButton, Box, Dialog, DialogContent, Typography } from '@mui/material';
import { Brightness4, Brightness6, Brightness7, Lock, LockOpen, Close } from '@mui/icons-material';
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

// region #98 - expected to get removed in the future (localStorage migration bridge)
const AUTO_DARK_MODE_STORAGE_KEY = 'autoDarkModeSettings';
const DEVICE_SETTINGS_UPDATED_EVENT = 'homeglow:device-settings-updated';
const DEVICE_SETTINGS_MIGRATION_KEY_PATTERN = /^(enabledWidgets|theme|themeMode|widgetsLocked|widgetSettings|pluginSettings|screensaverSettings|autoDarkModeSettings|weatherZipCode|weatherTempUnit)$/;

const isAllowedDeviceSettingsMigrationKey = (key) => DEVICE_SETTINGS_MIGRATION_KEY_PATTERN.test(key);
// endRegion #98

const DEFAULT_SCREENSAVER_SETTINGS = {
  enabled: false,
  mode: 'tabs',
  timeout: 5,
  slideshowInterval: 10,
};

const DEFAULT_WIDGET_SETTINGS = {
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

const normalizeWidgetSettings = (raw) => ({
  ...DEFAULT_WIDGET_SETTINGS,
  ...(raw && typeof raw === 'object' ? raw : {}),
  chores: { ...DEFAULT_WIDGET_SETTINGS.chores, ...(raw?.chores || {}) },
  calendar: { ...DEFAULT_WIDGET_SETTINGS.calendar, ...(raw?.calendar || {}) },
  photos: { ...DEFAULT_WIDGET_SETTINGS.photos, ...(raw?.photos || {}) },
  weather: { ...DEFAULT_WIDGET_SETTINGS.weather, ...(raw?.weather || {}) },
});

const normalizeScreensaverSettings = (raw) => ({
  ...DEFAULT_SCREENSAVER_SETTINGS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});
const DEFAULT_AUTO_DARK_MODE_SETTINGS = {
  enabled: false,
  locationQuery: '',
  lat: null,
  lon: null,
  resolvedName: '',
};

const normalizeAutoDarkModeSettings = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AUTO_DARK_MODE_SETTINGS };
  }

  return {
    ...DEFAULT_AUTO_DARK_MODE_SETTINGS,
    ...raw,
    locationQuery: (raw.locationQuery || '').trim(),
    lat: typeof raw.lat === 'number' ? raw.lat : null,
    lon: typeof raw.lon === 'number' ? raw.lon : null,
    resolvedName: raw.resolvedName || '',
  };
};

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
  const [themeMode, setThemeMode] = useState('light');
  const [autoDarkModeSettings, setAutoDarkModeSettings] = useState({ ...DEFAULT_AUTO_DARK_MODE_SETTINGS });
  const [widgetsLocked, setWidgetsLocked] = useState(true);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [screensaverSettings, setScreensaverSettings] = useState({ ...DEFAULT_SCREENSAVER_SETTINGS });
  const inactivityTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const [widgetSettings, setWidgetSettings] = useState({ ...DEFAULT_WIDGET_SETTINGS });
  const [pluginSettings, setPluginSettings] = useState({});
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [apiKeys, setApiKeys] = useState({
    WEATHER_API_KEY: '',
    ICS_CALENDAR_URL: '',
  });
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [activeTab, setActiveTab] = useState(1);
  const [tabs, setTabs] = useState([]);
  const [widgetAssignments, setWidgetAssignments] = useState({});
  const [showTabIconModal, setShowTabIconModal] = useState(false);
  const [deviceSettingsLoaded, setDeviceSettingsLoaded] = useState(false);
  const [isFirstRunClient, setIsFirstRunClient] = useState(false);

  const fetchInstalledPlugins = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/widgets`);
      setInstalledPlugins(Array.isArray(response.data) ? response.data : []);
    } catch {
      setInstalledPlugins([]);
    }
  };

  const applyTheme = useCallback((nextTheme) => {
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);

    if (nextTheme === 'light') {
      const primaryColor = widgetSettings.primary || '#f5f5f5';
      document.documentElement.style.setProperty('--background', primaryColor);
      return;
    }

    document.documentElement.style.removeProperty('--background');
  }, [widgetSettings.primary]);

  const hydrateFromDeviceSettings = useCallback((settings) => {
    const widgetSettingsFromServer = normalizeWidgetSettings(settings?.widgetSettings);
    const pluginSettingsFromServer = settings?.pluginSettings && typeof settings.pluginSettings === 'object'
      ? settings.pluginSettings
      : {};
    const screensaverFromServer = normalizeScreensaverSettings(settings?.screensaverSettings);
    const autoDarkFromServer = normalizeAutoDarkModeSettings(settings?.autoDarkModeSettings);
    const widgetsLockedFromServer = typeof settings?.widgetsLocked === 'boolean' ? settings.widgetsLocked : true;
    const themeFromServer = settings?.theme === 'dark' ? 'dark' : 'light';
    const themeModeFromServer = ['light', 'dark', 'auto'].includes(settings?.themeMode)
      ? settings.themeMode
      : themeFromServer;

    setWidgetSettings(widgetSettingsFromServer);
    setPluginSettings(pluginSettingsFromServer);
    setScreensaverSettings(screensaverFromServer);
    setAutoDarkModeSettings(autoDarkFromServer);
    setWidgetsLocked(widgetsLockedFromServer);
    setThemeMode(themeModeFromServer);
    applyTheme(themeFromServer);

    const hasKnownDeviceSettings = [
      'widgetSettings',
      'pluginSettings',
      'screensaverSettings',
      'autoDarkModeSettings',
      'theme',
      'themeMode',
      'widgetsLocked',
    ].some((key) => Object.prototype.hasOwnProperty.call(settings || {}, key));

    setIsFirstRunClient(!hasKnownDeviceSettings);
    setDeviceSettingsLoaded(true);
  }, [applyTheme]);

  const fetchDeviceSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_DEVICE_URL}/settings`);
      hydrateFromDeviceSettings(response.data || {});
    } catch (error) {
      console.error('Error fetching device settings:', error);
    }
  }, [API_DEVICE_URL, hydrateFromDeviceSettings]);

  // region #98 - expected to get removed in the future (one-time local-to-server settings migration)
  const migrateLocalDeviceSettingsToServer = useCallback(async () => {
    const localPayload = {};

    if (isAllowedDeviceSettingsMigrationKey('theme')) {
      const localTheme = localStorage.getItem('theme');
      if (localTheme === 'light' || localTheme === 'dark') {
        localPayload.theme = localTheme;
      }
    }

    if (isAllowedDeviceSettingsMigrationKey('themeMode')) {
      const localThemeMode = localStorage.getItem('themeMode');
      if (localThemeMode === 'light' || localThemeMode === 'dark' || localThemeMode === 'auto') {
        localPayload.themeMode = localThemeMode;
      }
    }

    if (isAllowedDeviceSettingsMigrationKey('widgetsLocked')) {
      const widgetsLockedRaw = localStorage.getItem('widgetsLocked');
      if (widgetsLockedRaw !== null) {
        try {
          localPayload.widgetsLocked = JSON.parse(widgetsLockedRaw);
        } catch {
          // Ignore malformed local value.
        }
      }
    }

    const parseJsonKey = (key) => {
      if (!isAllowedDeviceSettingsMigrationKey(key)) return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    };

    const widgetSettingsRaw = parseJsonKey('widgetSettings');
    if (widgetSettingsRaw) {
      const sanitizedWidgetSettings = { ...widgetSettingsRaw };
      if (Object.prototype.hasOwnProperty.call(sanitizedWidgetSettings, 'widgetGallery')) {
        delete sanitizedWidgetSettings.widgetGallery;
      }
      localPayload.widgetSettings = normalizeWidgetSettings(sanitizedWidgetSettings);
    }

    const pluginSettingsRaw = parseJsonKey('pluginSettings');
    let mergedPluginSettings = pluginSettingsRaw && typeof pluginSettingsRaw === 'object'
      ? { ...pluginSettingsRaw }
      : null;

    if (isAllowedDeviceSettingsMigrationKey('enabledWidgets')) {
      const enabledWidgetsRaw = localStorage.getItem('enabledWidgets');
      if (enabledWidgetsRaw) {
        try {
          const parsedEnabledWidgets = JSON.parse(enabledWidgetsRaw);
          if (parsedEnabledWidgets && typeof parsedEnabledWidgets === 'object') {
            const nextPluginSettings = mergedPluginSettings ? { ...mergedPluginSettings } : {};
            Object.entries(parsedEnabledWidgets).forEach(([filename, isEnabled]) => {
              if (!nextPluginSettings[filename]) {
                nextPluginSettings[filename] = { enabled: !!isEnabled, transparent: false, refreshInterval: 0 };
              }
            });
            mergedPluginSettings = nextPluginSettings;
          }
        } catch {
          // Ignore malformed local value.
        }
      }
    }

    if (mergedPluginSettings && Object.keys(mergedPluginSettings).length > 0) {
      localPayload.pluginSettings = mergedPluginSettings;
    }

    const screensaverRaw = parseJsonKey('screensaverSettings');
    if (screensaverRaw) {
      localPayload.screensaverSettings = normalizeScreensaverSettings(screensaverRaw);
    }

    const autoDarkRaw = parseJsonKey(AUTO_DARK_MODE_STORAGE_KEY);
    if (autoDarkRaw) {
      localPayload.autoDarkModeSettings = normalizeAutoDarkModeSettings(autoDarkRaw);
    }

    if (isAllowedDeviceSettingsMigrationKey('weatherZipCode') || isAllowedDeviceSettingsMigrationKey('weatherTempUnit')) {
      const weatherLegacySettings = {};

      if (isAllowedDeviceSettingsMigrationKey('weatherZipCode')) {
        const weatherZipCode = (localStorage.getItem('weatherZipCode') || '').trim();
        if (weatherZipCode) {
          weatherLegacySettings.locationQuery = weatherZipCode;
          weatherLegacySettings.zipCode = weatherZipCode;
        }
      }

      if (isAllowedDeviceSettingsMigrationKey('weatherTempUnit')) {
        const weatherTempUnit = localStorage.getItem('weatherTempUnit');
        if (weatherTempUnit === 'C' || weatherTempUnit === 'F') {
          weatherLegacySettings.tempUnit = weatherTempUnit;
        }
      }

      if (Object.keys(weatherLegacySettings).length > 0) {
        localPayload.weatherLegacySettings = weatherLegacySettings;
      }
    }

    const keysToMigrate = Object.keys(localPayload);
    if (keysToMigrate.length === 0) {
      return;
    }

    try {
      await axios.put(`${API_DEVICE_URL}/settings`, localPayload);

      // Remove only known migrated keys.
      ['enabledWidgets', 'theme', 'themeMode', 'widgetsLocked', 'widgetSettings', 'pluginSettings', 'screensaverSettings', AUTO_DARK_MODE_STORAGE_KEY, 'weatherZipCode', 'weatherTempUnit']
        .filter(isAllowedDeviceSettingsMigrationKey)
        .forEach((key) => {
          localStorage.removeItem(key);
        });
    } catch (error) {
      console.error('Error migrating local device settings to server:', error);
    }
  }, [API_DEVICE_URL]);
  // endRegion #98

  const patchDeviceSettings = useCallback(async (partialSettings) => {
    try {
      await axios.patch(`${API_DEVICE_URL}/settings`, partialSettings);
    } catch (error) {
      console.error('Error updating device settings:', error);
    }
  }, [API_DEVICE_URL]);

  // region #98 - expected to get removed in the future (invoke migration bridge during bootstrap)
  useEffect(() => {
    const fetchApiKeys = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/settings`);
        setApiKeys(response.data);
      } catch (error) {
        console.error('Error fetching API keys:', error);
      } finally {
        setApiKeysLoaded(true);
      }
    };

    const initialize = async () => {
      await migrateLocalDeviceSettingsToServer();
      await fetchDeviceSettings();
      await Promise.all([
        fetchTabs(),
        fetchWidgetAssignments(),
        fetchInstalledPlugins(),
      ]);
      await fetchApiKeys();
    };

    void initialize();
  }, [fetchDeviceSettings, migrateLocalDeviceSettingsToServer]);
  // endRegion #98

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

  const resolveAutoTheme = useCallback(async () => {
    const hasCoordinates = typeof autoDarkModeSettings.lat === 'number' && typeof autoDarkModeSettings.lon === 'number';
    if (!autoDarkModeSettings.enabled || !apiKeys.WEATHER_API_KEY || !hasCoordinates) {
      return null;
    }

    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          lat: autoDarkModeSettings.lat,
          lon: autoDarkModeSettings.lon,
          appid: apiKeys.WEATHER_API_KEY,
        },
      });

      const sunrise = response?.data?.sys?.sunrise;
      const sunset = response?.data?.sys?.sunset;
      if (typeof sunrise !== 'number' || typeof sunset !== 'number') {
        return null;
      }

      const nowUnix = Math.floor(Date.now() / 1000);
      return nowUnix >= sunrise && nowUnix < sunset ? 'light' : 'dark';
    } catch (error) {
      console.error('Error resolving auto theme:', error);
      return null;
    }
  }, [autoDarkModeSettings, apiKeys.WEATHER_API_KEY]);

  const applyAutoThemeNow = useCallback(async () => {
    const resolvedTheme = await resolveAutoTheme();
    if (resolvedTheme) {
      applyTheme(resolvedTheme);
    }
  }, [resolveAutoTheme, applyTheme]);

  useEffect(() => {
    applyTheme('light');
  }, [applyTheme]);

  useEffect(() => {
    const handleDeviceSettingsUpdated = () => {
      void fetchDeviceSettings();
    };

    window.addEventListener(DEVICE_SETTINGS_UPDATED_EVENT, handleDeviceSettingsUpdated);
    return () => {
      window.removeEventListener(DEVICE_SETTINGS_UPDATED_EVENT, handleDeviceSettingsUpdated);
    };
  }, [fetchDeviceSettings]);

  useEffect(() => {
    if (themeMode !== 'auto') {
      return;
    }

    let isMounted = true;
    const refresh = async () => {
      const resolvedTheme = await resolveAutoTheme();
      if (!isMounted || !resolvedTheme) {
        return;
      }
      applyTheme(resolvedTheme);
    };

    void refresh();
    const intervalId = setInterval(() => {
      void refresh();
    }, 15 * 60 * 1000);

    const handleFocus = () => {
      void refresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [themeMode, resolveAutoTheme, applyTheme]);

  useEffect(() => {
    if (!apiKeysLoaded || themeMode !== 'auto') {
      return;
    }

    const hasCoordinates = typeof autoDarkModeSettings.lat === 'number' && typeof autoDarkModeSettings.lon === 'number';
    const autoModeAvailable = autoDarkModeSettings.enabled && Boolean(apiKeys.WEATHER_API_KEY) && hasCoordinates;
    if (!autoModeAvailable) {
      const fallbackMode = theme === 'dark' ? 'dark' : 'light';
      setThemeMode(fallbackMode);
      void patchDeviceSettings({
        themeMode: fallbackMode,
        theme: fallbackMode,
      });
    }
  }, [apiKeysLoaded, themeMode, autoDarkModeSettings, apiKeys.WEATHER_API_KEY, theme, patchDeviceSettings]);

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
    const hasCoordinates = typeof autoDarkModeSettings.lat === 'number' && typeof autoDarkModeSettings.lon === 'number';
    const includeAutoMode = autoDarkModeSettings.enabled && hasCoordinates && (Boolean(apiKeys.WEATHER_API_KEY) || !apiKeysLoaded);
    const themeModes = includeAutoMode ? ['light', 'dark', 'auto'] : ['light', 'dark'];

    const currentIndex = themeModes.includes(themeMode) ? themeModes.indexOf(themeMode) : 0;
    const nextMode = themeModes[(currentIndex + 1) % themeModes.length];

    setThemeMode(nextMode);

    const nextTheme = nextMode === 'auto' ? theme : nextMode;
    void patchDeviceSettings({
      themeMode: nextMode,
      theme: nextTheme,
    });

    if (nextMode === 'auto') {
      void applyAutoThemeNow();
      return;
    }

    applyTheme(nextMode);
  };

  const toggleWidgetsLock = () => {
    const newLockState = !widgetsLocked;
    setWidgetsLocked(newLockState);
    void patchDeviceSettings({ widgetsLocked: newLockState });
  };

  const toggleAdminPanel = () => {
    if (showAdminPanel) {
      void fetchDeviceSettings();
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
    if (!assignments || assignments.length === 0) return false;
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
              refreshInterval={widgetSettings.calendar.refreshInterval || 0}
              activeTab={activeTab}
              activeTabConfigJson={tabs.find((tab) => tab.number === activeTab)?.config_json || null}
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
              refreshInterval={widgetSettings.weather.refreshInterval || 0}
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
            <ChoreWidget
              transparentBackground={widgetSettings.chores.transparent}
              refreshInterval={widgetSettings.chores.refreshInterval || 0}
            />
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
            <PhotoWidget
              transparentBackground={widgetSettings.photos.transparent}
              refreshInterval={widgetSettings.photos.refreshInterval || 0}
            />
          </Suspense>
        ),
      });
    }

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
  }, [widgetSettings, pluginSettings, activeTab, apiKeys, widgetAssignments, installedPlugins, theme]);

  const activeTabId = useMemo(() => {
    const active = tabs.find(tab => tab.number === activeTab);
    return active?.id ?? 1;
  }, [tabs, activeTab]);

  return (
    <>
      <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative', pb: '60px' }}>
        {widgets.length > 0 && (
          <WidgetContainer
            widgets={widgets}
            locked={widgetsLocked}
            activeTab={activeTab}
            activeTabId={activeTabId}
            deviceWidgetSettings={widgetSettings}
            devicePluginSettings={pluginSettings}
          />
        )}
        {deviceSettingsLoaded && widgets.length === 0 && isFirstRunClient && (
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
            aria-label="Cycle theme mode"
            sx={{
              color: theme === 'light' ? 'action.active' : 'white',
            }}
          >
            {themeMode === 'auto' ? <Brightness6 /> : (theme === 'light' ? <Brightness4 /> : <Brightness7 />)}
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
