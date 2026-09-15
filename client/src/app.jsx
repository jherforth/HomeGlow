// client/src/app.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { IconButton, Box, Dialog, DialogContent, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';

import axios from 'axios';
import PluginWidgetWrapper from './components/PluginWidgetWrapper.jsx';
import WidgetContainer from './components/WidgetContainer.jsx';
import MobileDashboard from './components/MobileDashboard.jsx';
import TabBar from './components/TabBar.jsx';
import ScreensaverCountdown from './components/ScreensaverCountdown.jsx';
import { API_BASE_URL } from './utils/apiConfig.js';
import { getDeviceApiBase } from './utils/deviceName.js';
import { unlockAudio } from './utils/choreSound.js';
import useChoreSoundScheduler from './hooks/useChoreSoundScheduler.js';
import useFetchTabs from './hooks/useFetchTabs.js';
import useIsMobile from './hooks/useIsMobile.js';
import useScreenActivity from './hooks/useScreenActivity.js';
import {
  readLocalInterfaceColors,
  readLocalScreensaverSettings,
  readLocalAutoDarkModeSettings,
  readLocalVacationModeSettings,
  isVacationModeActiveToday,
} from './utils/interfaceSettings.js';
import { normalizeWidgetSettings, BASE_WIDGET_SETTINGS } from './utils/widgetSettings.js';
import { buildMobileWidgetList } from './utils/mobileWidgets.js';
import { CORE_CONTROLS, resolveHiddenControls } from './utils/displayControls.js';
import './index.css';

const loadAdminPanel = () => import('./components/AdminPanel.jsx');
const loadCalendarWidget = () => import('./components/CalendarWidget.jsx');
const loadPhotoWidget = () => import('./components/PhotoWidget.jsx');
const loadWeatherWidget = () => import('./components/WeatherWidget.jsx');
const loadChoreWidget = () => import('./components/ChoreWidget.jsx');
const loadTabIconModal = () => import('./components/TabIconModal.jsx');
const loadScreenSaver = () => import('./components/ScreenSaver.jsx');
const loadVacationScreensaver = () => import('./components/VacationScreensaver.jsx');

const MAX_IDLE_WARM_IMPORTS = 3;
const WIDGETS_LOCKED_STORAGE_KEY = 'widgetsLocked';
const THEME_STORAGE_KEY = 'theme';
const THEME_MODE_STORAGE_KEY = 'themeMode';

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
const VacationScreensaver = lazy(loadVacationScreensaver);

// region #98 - expected to get removed in the future (localStorage migration bridge)
const DEVICE_SETTINGS_UPDATED_EVENT = 'homeglow:device-settings-updated';
const INTERFACE_SETTINGS_UPDATED_EVENT = 'homeglow:interface-settings-updated';
const DEVICE_SETTINGS_MIGRATION_KEY_PATTERN = /^(enabledWidgets|widgetSettings|pluginSettings|weatherZipCode|weatherTempUnit)$/;

const isAllowedDeviceSettingsMigrationKey = (key) => DEVICE_SETTINGS_MIGRATION_KEY_PATTERN.test(key);
// endRegion #98

const DEFAULT_WIDGET_SETTINGS = {
  ...BASE_WIDGET_SETTINGS,
  lightGradientStart: '#00ddeb',
  lightGradientEnd: '#ff6b6b',
  darkGradientStart: '#2e2767',
  darkGradientEnd: '#620808',
  lightButtonGradientStart: '#00ddeb',
  lightButtonGradientEnd: '#ff6b6b',
  darkButtonGradientStart: '#2e2767',
  darkButtonGradientEnd: '#620808',
};

const CORE_CONTROL_IDS = CORE_CONTROLS.map((control) => control.id);

// Backoff for the admin-PIN existence check. Four attempts over ~6s: long enough
// to ride out a server still coming up behind a kiosk that boots with it, short
// enough that nothing waits on it.
const ADMIN_PIN_EXISTS_RETRY_DELAYS_MS = [500, 1500, 4000];

// How long to wait before starting that ladder over, while the answer is still
// unknown. Minutes, not seconds: the ladder already covers the fast case, so
// anything still unresolved is an outage measured in minutes, and polling it
// quickly would only add load to a server that is evidently already struggling.
// The poll exists because the cost of an unresolved answer does not expire (see
// the recovery effect), and it stops the moment one lands.
const ADMIN_PIN_EXISTS_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Control Limits ids are namespaced in storage (`plugin:<pluginId>:<control>`)
 * so two plugins cannot collide. A plugin only ever knows its own unprefixed
 * ids, so the namespace is stripped here: it is core's storage concern and must
 * not leak into every plugin author's widget.
 */
const unprefixedHiddenControlsFor = (hiddenControls, pluginId) => {
  if (!pluginId || !Array.isArray(hiddenControls)) return [];
  const prefix = `plugin:${pluginId}:`;
  return hiddenControls
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
};

const readLocalTheme = () => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme === 'dark' ? 'dark' : 'light';
};

const readLocalThemeMode = (fallbackTheme) => {
  const savedThemeMode = localStorage.getItem(THEME_MODE_STORAGE_KEY);
  if (savedThemeMode === 'light' || savedThemeMode === 'dark' || savedThemeMode === 'auto') {
    return savedThemeMode;
  }

  return fallbackTheme === 'dark' ? 'dark' : 'light';
};

const readLocalWidgetsLocked = () => {
  const saved = localStorage.getItem(WIDGETS_LOCKED_STORAGE_KEY);
  if (saved === null) {
    return true;
  }

  try {
    const parsed = JSON.parse(saved);
    return typeof parsed === 'boolean' ? parsed : true;
  } catch {
    return true;
  }
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
  const isMobile = useIsMobile();
  const [theme, setTheme] = useState(readLocalTheme);
  const [themeMode, setThemeMode] = useState(() => readLocalThemeMode(readLocalTheme()));
  const [autoDarkModeSettings, setAutoDarkModeSettings] = useState(readLocalAutoDarkModeSettings);
  const [interfaceColors, setInterfaceColors] = useState(readLocalInterfaceColors);
  const [widgetsLocked, setWidgetsLocked] = useState(readLocalWidgetsLocked);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [screensaverSettings, setScreensaverSettings] = useState(readLocalScreensaverSettings);
  const [vacationModeSettings, setVacationModeSettings] = useState(readLocalVacationModeSettings);
  // Range-aware (issue #121 v2): with dates set, vacation activates/expires on
  // its own; recomputed each render, which the kiosk's periodic refreshes keep
  // current across midnight.
  const vacationActiveToday = isVacationModeActiveToday(vacationModeSettings);
  const inactivityTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const [widgetSettings, setWidgetSettings] = useState({ ...DEFAULT_WIDGET_SETTINGS });
  const [pluginSettings, setPluginSettings] = useState({});
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  // Household settings the dashboard reads directly (chore sound preferences).
  // Credentials are no longer among them — GET /api/settings redacts secrets,
  // and weather is fetched server-side.
  const [householdSettings, setHouseholdSettings] = useState({});
  // The raw device settings blob, kept alongside the hydrated view above:
  // Control Limits reads keys this component does not otherwise model
  // (`controlLimits`, `adminPinRemembered`), and resolveHiddenControls wants the
  // blob as stored, not a projection of it.
  const [rawDeviceSettings, setRawDeviceSettings] = useState(null);
  // null = the PIN check has not landed. Passed into displayControls as
  // `undefined`, never `false`: `false` states that no PIN exists, which makes a
  // remembered display stop being exempt. See isDisplayUnlocked.
  const [adminPinExists, setAdminPinExists] = useState(null);
  // Serializes runs of the PIN check. It is started from bootstrap, from every
  // device-settings-updated event and from the recovery poll, so a run sitting
  // in its backoff and a freshly started one can be in flight together; without
  // a token the older one can land last and publish the staler answer. Matches
  // how ControlsOnDisplay's loadLimits guards the same pattern.
  const adminPinExistsTokenRef = useRef(0);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [activeTab, setActiveTab] = useState(1);
  const { tabs, fetchTabs } = useFetchTabs(API_DEVICE_URL);
  const [widgetAssignments, setWidgetAssignments] = useState({});
  const [showTabIconModal, setShowTabIconModal] = useState(false);
  const [deviceSettingsLoaded, setDeviceSettingsLoaded] = useState(false);
  const [isFirstRunClient, setIsFirstRunClient] = useState(false);
  const [choreSoundDeviceEnabled, setChoreSoundDeviceEnabled] = useState(true);
  const [demoStatus, setDemoStatus] = useState({ demo: false, resetHours: null });

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
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }, []);

  const hydrateFromDeviceSettings = useCallback((settings) => {
    setRawDeviceSettings(settings || {});

    const widgetSettingsFromServer = normalizeWidgetSettings(settings?.widgetSettings, DEFAULT_WIDGET_SETTINGS);
    const pluginSettingsFromServer = settings?.pluginSettings && typeof settings.pluginSettings === 'object'
      ? settings.pluginSettings
      : {};

    setWidgetSettings(widgetSettingsFromServer);
    setPluginSettings(pluginSettingsFromServer);
    setChoreSoundDeviceEnabled(settings?.choreWidgetSettings?.soundEnabled !== false);

    const hasKnownDeviceSettings = [
      'widgetSettings',
      'pluginSettings',
    ].some((key) => Object.prototype.hasOwnProperty.call(settings || {}, key));

    setIsFirstRunClient(!hasKnownDeviceSettings);
    setDeviceSettingsLoaded(true);
  }, []);

  const fetchDeviceSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_DEVICE_URL}/settings`);
      hydrateFromDeviceSettings(response.data || {});
    } catch (error) {
      console.error('Error fetching device settings:', error);
    }
  }, [API_DEVICE_URL, hydrateFromDeviceSettings]);

  const fetchHouseholdSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/settings`);
      setHouseholdSettings(response.data || {});
    } catch (error) {
      console.error('Error fetching household settings:', error);
    }
  }, []);

  // Whether a household admin PIN is configured. Only a clean read may report
  // `false` — claiming "no PIN exists" on the strength of a request that did not
  // answer would make every remembered display drop its exemption and strip a
  // parent's controls. Control Limits is visibility, not access control, so an
  // unreadable check resolves the generous way.
  //
  // Retried because the generous way is not free: while this stays unresolved,
  // every display that remembers the PIN is exempt, which is the household-wide
  // disable that displayControls' `pinExists !== false` guard exists to prevent.
  // displayControls time-boxes that cost by obliging the caller to resolve the
  // value; a single failed request would leave it unresolved forever, so one
  // flaky response must not be the end of it. The ladder is bounded and loud
  // when it runs out, but it is not the last word: the recovery effect below
  // starts it again for as long as the answer stays unknown.
  const fetchAdminPinExists = useCallback(async () => {
    adminPinExistsTokenRef.current += 1;
    const token = adminPinExistsTokenRef.current;
    // A superseded run abandons both its write and its remaining backoff: a
    // newer run owns the answer, and an older one waking up mid-ladder would
    // otherwise overwrite it with a staler read.
    const superseded = () => token !== adminPinExistsTokenRef.current;

    for (let attempt = 0; attempt <= ADMIN_PIN_EXISTS_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
        if (superseded()) return;
        setAdminPinExists(response.data?.exists === true);
        return;
      } catch (error) {
        if (superseded()) return;
        const retryDelay = ADMIN_PIN_EXISTS_RETRY_DELAYS_MS[attempt];
        if (retryDelay === undefined) {
          console.error(
            'Admin PIN existence check failed after '
              + `${ADMIN_PIN_EXISTS_RETRY_DELAYS_MS.length + 1} attempts; Control Limits stay `
              + `disabled on displays that remember the PIN, retrying every ${
                ADMIN_PIN_EXISTS_RECOVERY_INTERVAL_MS / 60000} minutes:`,
            error,
          );
          return;
        }
        await new Promise((resolve) => { setTimeout(resolve, retryDelay); });
      }
    }
  }, []);

  // region #98 - expected to get removed in the future (one-time local-to-server settings migration)
  const migrateLocalDeviceSettingsToServer = useCallback(async () => {
    const localPayload = {};

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
      localPayload.widgetSettings = normalizeWidgetSettings(sanitizedWidgetSettings, DEFAULT_WIDGET_SETTINGS);
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
      ['enabledWidgets', 'widgetSettings', 'pluginSettings', 'weatherZipCode', 'weatherTempUnit']
        .filter(isAllowedDeviceSettingsMigrationKey)
        .forEach((key) => {
          localStorage.removeItem(key);
        });
    } catch (error) {
      console.error('Error migrating local device settings to server:', error);
    }
  }, [API_DEVICE_URL]);
  // endRegion #98

  // region #98 - expected to get removed in the future (invoke migration bridge during bootstrap)
  useEffect(() => {
    const fetchDemoStatus = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/demo`);
        if (response.data?.demo) setDemoStatus(response.data);
      } catch {
        // Older servers have no /api/demo; treat as non-demo.
      }
    };

    const initialize = async () => {
      // Started, not awaited: it retries on its own schedule and nothing else
      // here depends on the answer, so a slow or failing PIN endpoint must not
      // delay the settings, tabs and plugins this dashboard renders from.
      void fetchAdminPinExists();

      await migrateLocalDeviceSettingsToServer();
      await fetchDemoStatus();
      await fetchDeviceSettings();
      await Promise.all([
        fetchTabs(),
        fetchWidgetAssignments(),
        fetchInstalledPlugins(),
      ]);
      await fetchHouseholdSettings();
    };

    void initialize();
  }, [
    fetchDeviceSettings,
    migrateLocalDeviceSettingsToServer,
    fetchHouseholdSettings,
    fetchAdminPinExists,
  ]);
  // endRegion #98

  // Demo mode: each visitor's browser is a fresh "device", which normally
  // lands on the empty first-run welcome screen. Seed this device with the
  // chore + calendar widgets on the Home tab so the demo is instantly alive.
  useEffect(() => {
    if (!demoStatus.demo || !isFirstRunClient || !deviceSettingsLoaded) return;

    const seedDemoDevice = async () => {
      try {
        await axios.patch(`${API_DEVICE_URL}/settings`, {
          widgetSettings: {
            chores: { enabled: true },
            calendar: { enabled: true },
            photos: { enabled: false },
            // Weather renders from the server's static demo snapshot
            // (/api/demo/weather) — no OpenWeatherMap key needed.
            weather: { enabled: true },
          },
        });
        for (const widgetName of ['chores', 'calendar', 'weather']) {
          await axios.post(`${API_DEVICE_URL}/widget-assignments`, {
            widget_name: widgetName,
            tabNumber: 1,
          });
        }
        await fetchDeviceSettings();
        await fetchTabs();
        await fetchWidgetAssignments();
      } catch (error) {
        console.error('Error seeding demo device:', error);
      }
    };

    void seedDemoDevice();
  }, [demoStatus.demo, isFirstRunClient, deviceSettingsLoaded]);

  // Mobile first-run (issue #118): a phone's first visit is its own fresh
  // device and would land on the empty welcome screen. Seed it with chores +
  // calendar + weather on the Home tab so the phone is instantly useful; the
  // user can adjust everything in Settings afterward. Demo mode has its own
  // seeding above; the kiosk (≥600px) first-run flow is unchanged.
  useEffect(() => {
    if (!isMobile || demoStatus.demo || !isFirstRunClient || !deviceSettingsLoaded) return;

    const seedMobileDevice = async () => {
      try {
        await axios.patch(`${API_DEVICE_URL}/settings`, {
          widgetSettings: {
            chores: { enabled: true },
            calendar: { enabled: true },
            weather: { enabled: true },
            photos: { enabled: false },
          },
        });
        for (const widgetName of ['chores', 'calendar', 'weather']) {
          await axios.post(`${API_DEVICE_URL}/widget-assignments`, {
            widget_name: widgetName,
            tabNumber: 1,
          });
        }
        await fetchDeviceSettings();
        await fetchTabs();
        await fetchWidgetAssignments();
      } catch (error) {
        console.error('Error seeding mobile device defaults:', error);
      }
    };

    void seedMobileDevice();
  }, [isMobile, demoStatus.demo, isFirstRunClient, deviceSettingsLoaded]);

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

  // Sunrise and sunset are computed from coordinates server-side, so auto dark
  // mode no longer needs an OpenWeatherMap key — it works with Home Assistant
  // or with no weather provider configured at all.
  const resolveAutoTheme = useCallback(async () => {
    const hasCoordinates = typeof autoDarkModeSettings.lat === 'number' && typeof autoDarkModeSettings.lon === 'number';
    if (!autoDarkModeSettings.enabled || !hasCoordinates) {
      return null;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/sun`, {
        params: {
          lat: autoDarkModeSettings.lat,
          lon: autoDarkModeSettings.lon,
        },
      });

      const { sunrise, sunset, alwaysUp, alwaysDown } = response?.data || {};

      // Above the polar circles the sun may not cross the horizon at all.
      if (alwaysUp) return 'light';
      if (alwaysDown) return 'dark';

      if (typeof sunrise !== 'number' || typeof sunset !== 'number') {
        return null;
      }

      const nowUnix = Math.floor(Date.now() / 1000);
      return nowUnix >= sunrise && nowUnix < sunset ? 'light' : 'dark';
    } catch (error) {
      console.error('Error resolving auto theme:', error);
      return null;
    }
  }, [autoDarkModeSettings]);

  const applyAutoThemeNow = useCallback(async () => {
    const resolvedTheme = await resolveAutoTheme();
    if (resolvedTheme) {
      applyTheme(resolvedTheme);
    }
  }, [resolveAutoTheme, applyTheme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', interfaceColors.primary);
    document.documentElement.style.setProperty('--secondary', interfaceColors.secondary);
    document.documentElement.style.setProperty('--accent', interfaceColors.accent);
  }, [interfaceColors]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.style.setProperty('--background', interfaceColors.primary);
      return;
    }

    document.documentElement.style.removeProperty('--background');
  }, [theme, interfaceColors.primary]);

  useEffect(() => {
    const handleDeviceSettingsUpdated = () => {
      void fetchDeviceSettings();
      // Control Limits resolve from three inputs, and Admin can change any of
      // them: this display's own limits (device settings), the household default
      // (household settings) and whether a PIN exists at all — removing the PIN
      // re-applies limits to every remembered display. Refetching all three here
      // is what makes a change in Admin take effect on this screen without a
      // reload.
      void fetchHouseholdSettings();
      void fetchAdminPinExists();
    };

    const handleInterfaceSettingsUpdated = () => {
      setInterfaceColors(readLocalInterfaceColors());
      setScreensaverSettings(readLocalScreensaverSettings());
      setAutoDarkModeSettings(readLocalAutoDarkModeSettings());
      setVacationModeSettings(readLocalVacationModeSettings());

      const localTheme = readLocalTheme();
      const localThemeMode = readLocalThemeMode(localTheme);
      setTheme(localTheme);
      setThemeMode(localThemeMode);
    };

    window.addEventListener(DEVICE_SETTINGS_UPDATED_EVENT, handleDeviceSettingsUpdated);
    window.addEventListener(INTERFACE_SETTINGS_UPDATED_EVENT, handleInterfaceSettingsUpdated);
    return () => {
      window.removeEventListener(DEVICE_SETTINGS_UPDATED_EVENT, handleDeviceSettingsUpdated);
      window.removeEventListener(INTERFACE_SETTINGS_UPDATED_EVENT, handleInterfaceSettingsUpdated);
    };
  }, [fetchDeviceSettings, fetchHouseholdSettings, fetchAdminPinExists]);

  // Recovery for a PIN check that never landed.
  //
  // While adminPinExists is unresolved, every display that remembers the PIN is
  // exempt from Control Limits — the household-wide disable isDisplayUnlocked's
  // `pinExists !== false` guard exists to prevent, which is why its contract
  // puts the obligation to resolve the value on this caller. The ladder above
  // covers a server coming up a moment behind its kiosk; it does not cover an
  // API unreachable for the length of a migration after an LXC reboot. Past
  // that, the only other trigger is a device-settings-updated event from this
  // window's own Admin Panel, which nobody opens on a wall display — so the
  // exemption lasted until a human reloaded the page, i.e. indefinitely.
  //
  // A slow poll rather than re-attempting from the focus/visibilitychange
  // handlers the auto-theme effect uses: a kiosk is never backgrounded and
  // never blurred, so those are precisely the events the failing case does not
  // produce, and they are gated on `themeMode === 'auto'` besides. Keyed on
  // adminPinExists, so the first answer tears the interval down — unresolved is
  // the only state in which this polls at all, and nothing here ever asserts
  // `false` from a request that did not answer.
  useEffect(() => {
    if (adminPinExists !== null) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void fetchAdminPinExists();
    }, ADMIN_PIN_EXISTS_RECOVERY_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [adminPinExists, fetchAdminPinExists]);

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
    if (themeMode !== 'auto') {
      return;
    }

    // Auto mode needs only coordinates now — sunrise is computed, not fetched.
    const hasCoordinates = typeof autoDarkModeSettings.lat === 'number' && typeof autoDarkModeSettings.lon === 'number';
    const autoModeAvailable = autoDarkModeSettings.enabled && hasCoordinates;
    if (!autoModeAvailable) {
      const fallbackMode = theme === 'dark' ? 'dark' : 'light';
      setThemeMode(fallbackMode);
      localStorage.setItem(THEME_MODE_STORAGE_KEY, fallbackMode);
    }
  }, [themeMode, autoDarkModeSettings, theme]);

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
      !!screensaverSettings?.enabled && (vacationModeSettings?.enabled ? loadVacationScreensaver : loadScreenSaver),
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
    vacationModeSettings?.enabled,
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
    // The screensaver is a kiosk ambient feature — phones lock themselves, so
    // on mobile the inactivity timers never start (issue #118).
    if (!screensaverSettings.enabled || isMobile) {
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
  }, [screensaverSettings.enabled, screensaverSettings.timeout, startInactivityTimer, isMobile]);

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

  // "Could someone plausibly be looking at the widgets right now?" Combines
  // the Page Visibility API with app state the browser can't see on its own.
  // In photos-mode the screensaver fully covers the dashboard, so widget
  // refreshes are pure waste; tabs-mode displays the widgets, so they stay
  // active. Future signals (e.g. Home Assistant presence, issue #57) plug in
  // here as additional entries.
  const widgetsActive = useScreenActivity({
    widgetsVisible: !(screensaverActive && screensaverSettings.mode === 'photos'),
  });

  const toggleTheme = () => {
    const hasCoordinates = typeof autoDarkModeSettings.lat === 'number' && typeof autoDarkModeSettings.lon === 'number';
    const includeAutoMode = autoDarkModeSettings.enabled && hasCoordinates;
    const themeModes = includeAutoMode ? ['light', 'dark', 'auto'] : ['light', 'dark'];

    const currentIndex = themeModes.includes(themeMode) ? themeModes.indexOf(themeMode) : 0;
    const nextMode = themeModes[(currentIndex + 1) % themeModes.length];

    setThemeMode(nextMode);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);

    const nextTheme = nextMode === 'auto' ? theme : nextMode;

    if (nextMode === 'auto') {
      void applyAutoThemeNow();
      return;
    }

    applyTheme(nextMode);
  };

  const toggleWidgetsLock = () => {
    const newLockState = !widgetsLocked;
    setWidgetsLocked(newLockState);
    localStorage.setItem(WIDGETS_LOCKED_STORAGE_KEY, JSON.stringify(newLockState));
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

  // Every control id this dashboard can name: the core catalog plus whatever the
  // installed plugins declare. Only a source of candidates — a stored id for a
  // plugin that is not installed here still applies, which is the module's job,
  // not this list's.
  const knownControlIds = useMemo(() => {
    const ids = [...CORE_CONTROL_IDS];

    installedPlugins.forEach((plugin) => {
      const pluginId = plugin?.manifest?.id;
      const declared = plugin?.manifest?.hideableControls;
      if (!pluginId || !Array.isArray(declared)) return;

      declared.forEach((control) => {
        if (control && typeof control.id === 'string') {
          ids.push(`plugin:${pluginId}:${control.id}`);
        }
      });
    });

    return ids;
  }, [installedPlugins]);

  // Resolved once here and passed down, so every widget on this display agrees
  // about what it may render. Until the PIN check lands, adminPinExists is null
  // and must reach the module as `undefined` — `false` would assert that no PIN
  // is configured.
  const hiddenControls = useMemo(() => resolveHiddenControls({
    deviceSettings: rawDeviceSettings,
    householdSettings,
    pinExists: adminPinExists === null ? undefined : adminPinExists,
    knownControlIds,
  }), [rawDeviceSettings, householdSettings, adminPinExists, knownControlIds]);

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
              hiddenControls={hiddenControls}
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
              hiddenControls={hiddenControls}
              refreshInterval={widgetSettings.weather.refreshInterval || 0}
              activeTab={activeTab}
              activeTabConfigJson={tabs.find((tab) => tab.number === activeTab)?.config_json || null}
              allTabConfigs={tabs}
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
            <ChoreWidget hiddenControls={hiddenControls} />
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
            <PhotoWidget hiddenControls={hiddenControls} />
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
          events={plugin.manifest?.events || []}
          hiddenControls={unprefixedHiddenControlsFor(hiddenControls, plugin.manifest?.id)}
        />,
      });
    });

    return result;
  }, [widgetSettings, pluginSettings, activeTab, widgetAssignments, installedPlugins, theme, demoStatus.demo, hiddenControls]);

  // Mobile stack (issue #118): same widget content nodes, fixed order, photos
  // excluded, grid metadata ignored.
  const mobileWidgets = useMemo(
    () => (isMobile ? buildMobileWidgetList(widgets) : []),
    [isMobile, widgets]
  );

  const activeTabId = useMemo(() => {
    const active = tabs.find(tab => tab.number === activeTab);
    return active?.id ?? 1;
  }, [tabs, activeTab]);

  const shouldRunWeatherBackgroundPrefetch =
    widgetSettings.weather.enabled &&
    !isWidgetAssignedToTab('weather', activeTab);

  // Unlock audio on the first user interaction (kiosk autoplay policy).
  useEffect(() => {
    unlockAudio();
  }, []);

  // Chore due-time notification sounds: fire regardless of the active tab.
  // Gated by the global master switch AND this device not being muted AND the
  // chores feature being enabled.
  const choreSoundGlobalEnabled =
    householdSettings.CHORE_SOUND_ENABLED === 'true' || householdSettings.CHORE_SOUND_ENABLED === true;
  const parsedSoundVolume = Number(householdSettings.CHORE_SOUND_VOLUME);
  useChoreSoundScheduler({
    enabled:
      widgetSettings.chores.enabled &&
      choreSoundGlobalEnabled &&
      choreSoundDeviceEnabled &&
      // Vacation mode (issue #121) mutes chore due-time sounds while active.
      !(vacationActiveToday && vacationModeSettings.muteSounds),
    defaultSound: householdSettings.CHORE_SOUND_DEFAULT || null,
    volume: Number.isFinite(parsedSoundVolume) ? parsedSoundVolume / 100 : 1,
  });

  return (
    <>
      <Box sx={{ width: '100%', minHeight: '100vh', position: 'relative', pb: '80px' }}>
        {demoStatus.demo && (
          <Box
            sx={{
              position: 'fixed',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1200,
              px: 2,
              py: 0.5,
              borderRadius: '16px',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'none',
            }}
          >
            Demo Mode — sample data resets every {demoStatus.resetHours || 6} hours
          </Box>
        )}
        {vacationActiveToday && (
          <Box
            aria-label="Vacation mode active"
            sx={{
              position: 'fixed',
              top: 8,
              right: 8,
              zIndex: 1200,
              px: 1.5,
              py: 0.5,
              borderRadius: '16px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              color: 'var(--text-color)',
              fontSize: '0.8rem',
              fontWeight: 600,
              boxShadow: 'var(--shadow)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            🏖️ Vacation Mode
          </Box>
        )}
        {/* The one mobile/kiosk fork (issue #118): below 600px the grid —
            react-grid-layout, drag/resize, lock — never mounts. */}
        {isMobile && mobileWidgets.length > 0 && (
          <MobileDashboard widgets={mobileWidgets} />
        )}
        {!isMobile && widgets.length > 0 && (
          <WidgetContainer
            widgets={widgets}
            locked={widgetsLocked}
            activeTab={activeTab}
            activeTabId={activeTabId}
            deviceWidgetSettings={widgetSettings}
            devicePluginSettings={pluginSettings}
            isActive={widgetsActive}
          />
        )}
        {shouldRunWeatherBackgroundPrefetch && (
          <Box sx={{ display: 'none' }}>
            <Suspense fallback={null}>
              <WeatherWidget
                hiddenControls={hiddenControls}
                refreshInterval={widgetSettings.weather.refreshInterval || 0}
                activeTab={activeTab}
                activeTabConfigJson={tabs.find((tab) => tab.number === activeTab)?.config_json || null}
                allTabConfigs={tabs}
                prefetchOnly
                isActive={widgetsActive}
              />
            </Suspense>
          </Box>
        )}
        {deviceSettingsLoaded && widgets.length === 0 && isFirstRunClient && (
          <Box
            sx={{
              minHeight: 'calc(100vh - 80px)',
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
              <Typography variant="h5" sx={{ color: 'var(--text)', fontWeight: 700, mb: 1 }}>
                Welcome to HomeGlow
              </Typography>
              <Typography variant="body1" sx={{ color: 'var(--text-secondary)', mb: 1 }}>
                Click the HomeGlow logo in the dock below and open Settings to choose which widgets you want to see.
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                Once you enable widgets, this dashboard will fill in automatically.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={showAdminPanel} onClose={toggleAdminPanel} maxWidth="lg" fullScreen={isMobile}>
        <DialogContent sx={{ position: 'relative', '@media (max-width:599.95px)': { p: 1.5 } }}>
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
              onRequestClose={toggleAdminPanel}
              onPluginsChanged={fetchInstalledPlugins}
              onTabsChanged={async () => {
                await fetchTabs();
                await fetchWidgetAssignments();
              }}
            />
          </Suspense>
        </DialogContent>
      </Dialog>

      {/* Floating Dock TabBar. The dock renders above MUI dialogs, so hide it
          while the Admin Panel is open full-screen on mobile — otherwise it
          covers the bottom action buttons of the panel's dialogs. */}
      {!(isMobile && showAdminPanel) && (
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        widgetsLocked={widgetsLocked}
        onAddTab={handleAddTab}
        onDeleteTab={handleDeleteTab}
        onToggleTheme={toggleTheme}
        onToggleLock={toggleWidgetsLock}
        onOpenSettings={toggleAdminPanel}
        onRefresh={handlePageRefresh}
        theme={theme}
        themeMode={themeMode}
        screensaverCountdown={
          // No screensaver on mobile — don't show a countdown that never fires.
          isMobile ? null : (
            <ScreensaverCountdown
              enabled={screensaverSettings.enabled}
              timeoutMinutes={screensaverSettings.timeout}
              lastActivityRef={lastActivityRef}
              screensaverActive={screensaverActive}
            />
          )
        }
      />
      )}

      <Suspense fallback={null}>
        <TabIconModal
          open={showTabIconModal}
          onClose={() => setShowTabIconModal(false)}
          onSave={handleSaveTab}
        />
      </Suspense>

      {!isMobile && screensaverActive && screensaverSettings.enabled && (
        <Suspense fallback={null}>
          {vacationActiveToday ? (
            // Vacation mode (issue #121) replaces the standard screensaver
            // with the popcorn vacation-emoji one.
            <VacationScreensaver onExit={handleExitScreensaver} keepScreenAwake={screensaverSettings.keepScreenAwake} />
          ) : (
            <ScreenSaver
              mode={screensaverSettings.mode}
              slideshowInterval={screensaverSettings.slideshowInterval}
              tabs={tabs}
              onExit={handleExitScreensaver}
              onTabChange={handleScreensaverTabChange}
              keepScreenAwake={screensaverSettings.keepScreenAwake}
            />
          )}
        </Suspense>
      )}
    </>
  );
};

export default App;
