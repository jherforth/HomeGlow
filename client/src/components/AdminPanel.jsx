import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Avatar,
  Grid,
  Divider,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Backdrop,
  RadioGroup,
  Radio,
  Autocomplete,
  Tooltip,
  Slider
} from '@mui/material';
import {
  Delete,
  ContentCopy,
  Edit,
  Save,
  Cancel,
  Add,
  Upload,
  CloudDownload,
  Refresh,
  Warning,
  RestartAlt,
  Timer,
  Lock,
  Nightlight,
  Tab as TabIcon,
  DragIndicator,
  PhotoLibrary,
  Info,
  OpenInNew
} from '@mui/icons-material';
import ColorPickerPopover from './ColorPickerPopover';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase, getDeviceName, setDeviceName } from '../utils/deviceName.js';
import PinModal from './PinModal';
import ChoreSchedulesTab from './ChoreSchedulesTab';
import ChoreHistoryTab from './ChoreHistoryTab';
import TabIconModal from './TabIconModal';
import GoogleAccountConnection from './GoogleAccountConnection';
import ClamValueModal from './ClamValueModal';
import SoundPicker from './SoundPicker';
import useIsMobile from '../hooks/useIsMobile.js';
import { stackableTableSx } from '../utils/responsiveTable.js';

const USERS_UPDATED_EVENT = 'homeglow:users-updated';
const DEVICE_SETTINGS_UPDATED_EVENT = 'homeglow:device-settings-updated';
const INTERFACE_SETTINGS_UPDATED_EVENT = 'homeglow:interface-settings-updated';
const INTERFACE_COLORS_STORAGE_KEY = 'interfaceColors';
const INTERFACE_SCREENSAVER_STORAGE_KEY = 'screensaverSettings';
const INTERFACE_AUTO_DARK_MODE_STORAGE_KEY = 'autoDarkModeSettings';
const DEFAULT_AUTO_DARK_MODE_SETTINGS = {
  enabled: false,
  locationQuery: '',
  lat: null,
  lon: null,
  resolvedName: '',
};

const DEFAULT_WIDGET_SETTINGS = {
  chores: { enabled: false, transparent: false, refreshInterval: 0 },
  calendar: { enabled: false, transparent: false, refreshInterval: 0 },
  photos: { enabled: false, transparent: false, refreshInterval: 0 },
  weather: { enabled: false, transparent: false, refreshInterval: 0 },
};

const DEFAULT_INTERFACE_COLORS = {
  primary: '#f5f5f5',
  secondary: '#38bdf8',
  accent: '#f472b6',
};

const DEFAULT_SCREENSAVER_SETTINGS = {
  enabled: false,
  mode: 'tabs',
  timeout: 5,
  slideshowInterval: 10
};

const normalizeWidgetSettings = (raw) => ({
  ...DEFAULT_WIDGET_SETTINGS,
  chores: { ...DEFAULT_WIDGET_SETTINGS.chores, ...(raw?.chores || {}) },
  calendar: { ...DEFAULT_WIDGET_SETTINGS.calendar, ...(raw?.calendar || {}) },
  photos: { ...DEFAULT_WIDGET_SETTINGS.photos, ...(raw?.photos || {}) },
  weather: { ...DEFAULT_WIDGET_SETTINGS.weather, ...(raw?.weather || {}) },
});

const normalizeScreensaverSettings = (raw) => ({
  ...DEFAULT_SCREENSAVER_SETTINGS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});

const normalizeInterfaceColors = (raw) => ({
  ...DEFAULT_INTERFACE_COLORS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});

const readLocalInterfaceColors = () => {
  try {
    const raw = localStorage.getItem(INTERFACE_COLORS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INTERFACE_COLORS };
    return normalizeInterfaceColors(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_INTERFACE_COLORS };
  }
};

const readLocalScreensaverSettings = () => {
  try {
    const raw = localStorage.getItem(INTERFACE_SCREENSAVER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCREENSAVER_SETTINGS };
    return normalizeScreensaverSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SCREENSAVER_SETTINGS };
  }
};

const readLocalAutoDarkModeSettings = () => {
  try {
    const raw = localStorage.getItem(INTERFACE_AUTO_DARK_MODE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUTO_DARK_MODE_SETTINGS };
    return {
      ...DEFAULT_AUTO_DARK_MODE_SETTINGS,
      ...JSON.parse(raw),
    };
  } catch {
    return { ...DEFAULT_AUTO_DARK_MODE_SETTINGS };
  }
};

const DEFAULT_HOMEGLOW_REPOSITORY = 'jherforth/HomeGlow';
const FRONTEND_VERSION = (import.meta.env.VITE_APP_VERSION || 'dev').trim();
const FRONTEND_GIT_COMMIT = (import.meta.env.VITE_GIT_COMMIT || '').trim() || null;
const FRONTEND_GITHUB_REPOSITORY = (import.meta.env.VITE_GITHUB_REPOSITORY || DEFAULT_HOMEGLOW_REPOSITORY).trim();

const isValidRepositorySlug = (repository) => typeof repository === 'string' && /^[^/\s]+\/[^/\s]+$/.test(repository);

const splitRepositorySlug = (repository) => {
  if (!isValidRepositorySlug(repository)) {
    return null;
  }
  const [owner, name] = repository.split('/');
  return { owner, name };
};

const normalizeCommit = (commitSha) => (typeof commitSha === 'string' ? commitSha.trim().toLowerCase() : '');

const commitMatches = (left, right) => {
  const normalizedLeft = normalizeCommit(left);
  const normalizedRight = normalizeCommit(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight || normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft);
};

const buildCommitUrl = (repository, commitSha) => {
  if (!isValidRepositorySlug(repository) || !commitSha) {
    return null;
  }
  return `https://github.com/${repository}/commit/${commitSha}`;
};

const buildTagUrl = (repository, tagName) => {
  if (!isValidRepositorySlug(repository) || !tagName) {
    return null;
  }
  return `https://github.com/${repository}/releases/tag/${encodeURIComponent(tagName)}`;
};

const toShortCommit = (commitSha) => (commitSha ? commitSha.slice(0, 7) : 'Unknown');

const AdminPanel = ({ setWidgetSettings, onPluginsChanged, onTabsChanged }) => {
  const isMobile = useIsMobile();
  const [currentDeviceName, setCurrentDeviceName] = useState(() => getDeviceName());
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const CORE_WIDGET_DEFAULT_SIZES = {
    calendar: { w: 8, h: 5 },
    weather: { w: 4, h: 3 },
    chores: { w: 6, h: 4 },
    photos: { w: 6, h: 4 },
  };
  const [activeTab, setActiveTab] = useState(0);
  const [choresSubTab, setChoresSubTab] = useState(0);
  const [widgetsSubTab, setWidgetsSubTab] = useState(0);
  const [settings, setSettings] = useState({
    WEATHER_API_KEY: '',
    PROXY_WHITELIST: '',
    daily_completion_clam_reward: '2',
    CHORE_SOUND_ENABLED: 'false',
    CHORE_SOUND_DEFAULT: '',
    CHORE_SOUND_VOLUME: '100'
  });
  const [widgetSettings, setLocalWidgetSettings] = useState({
    ...DEFAULT_WIDGET_SETTINGS
  });
  const [interfaceColors, setInterfaceColors] = useState(readLocalInterfaceColors);
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [clamModalUser, setClamModalUser] = useState(null);
  const [editingPrize, setEditingPrize] = useState(null);
  const [newUser, setNewUser] = useState({ username: '', email: '', profile_picture: '' });
  const [newPrize, setNewPrize] = useState({ name: '', clam_cost: 0 });
  const [uploadedWidgets, setUploadedWidgets] = useState([]);
  const [githubWidgets, setGithubWidgets] = useState([]);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState({ key: null, el: null });
  const [deleteUserDialog, setDeleteUserDialog] = useState({ open: false, user: null });
  const [choreModal, setChoreModal] = useState({ open: false, user: null, userChores: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ show: false, type: '', text: '' });
  const [pinExists, setPinExists] = useState(false);
  const [pinModal, setPinModal] = useState({ open: false, mode: 'verify', title: '' });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingPin, setCheckingPin] = useState(true);
  const [tabs, setTabs] = useState([]);
  const [widgetAssignments, setWidgetAssignments] = useState({});
  const [pluginSettings, setPluginSettings] = useState({});
  const [pluginAssignments, setPluginAssignments] = useState({});
  const [photoSources, setPhotoSources] = useState([]);
  const [screensaverSettings, setScreensaverSettings] = useState(readLocalScreensaverSettings);
  const [autoDarkModeSettings, setAutoDarkModeSettings] = useState(readLocalAutoDarkModeSettings);
  const [isSavingAutoDarkMode, setIsSavingAutoDarkMode] = useState(false);
  const [autoDarkModeSunTimes, setAutoDarkModeSunTimes] = useState({
    sunrise: null,
    sunset: null,
    timezoneOffset: 0,
  });
  const [autoDarkModeSunTimesLoading, setAutoDarkModeSunTimesLoading] = useState(false);
  const [autoDarkModeSunTimesError, setAutoDarkModeSunTimesError] = useState('');
  const [tabIconModalState, setTabIconModalState] = useState({
    open: false,
    mode: 'create',
    originalNumber: null,
    initialData: null,
  });
  const [deleteTabDialog, setDeleteTabDialog] = useState({ open: false, tab: null });
  const [draggingTabNumber, setDraggingTabNumber] = useState(null);
  const [devices, setDevices] = useState([]);
  const [copyDeviceDialog, setCopyDeviceDialog] = useState({ open: false, device: null });
  const [deleteDeviceDialog, setDeleteDeviceDialog] = useState({ open: false, device: null });
  const [renameDeviceDialog, setRenameDeviceDialog] = useState({
    open: false,
    currentName: '',
    newName: '',
    error: '',
  });
  const [backendStats, setBackendStats] = useState(null);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutTagsLoading, setAboutTagsLoading] = useState(false);
  const [aboutError, setAboutError] = useState('');
  const [frontendCommitTags, setFrontendCommitTags] = useState([]);
  const [backendCommitTags, setBackendCommitTags] = useState([]);

  // Refresh interval options in milliseconds
  const refreshIntervalOptions = [
    { label: 'Disabled', value: 0 },
    { label: '5 minutes', value: 5 * 60 * 1000 },
    { label: '15 minutes', value: 15 * 60 * 1000 },
    { label: '30 minutes', value: 30 * 60 * 1000 },
    { label: '1 hour', value: 60 * 60 * 1000 },
    { label: '2 hours', value: 2 * 60 * 60 * 1000 },
    { label: '6 hours', value: 6 * 60 * 60 * 1000 },
    { label: '12 hours', value: 12 * 60 * 60 * 1000 },
    { label: '24 hours', value: 24 * 60 * 60 * 1000 }
  ];

  useEffect(() => {
    checkPinStatus();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setInterfaceColors(readLocalInterfaceColors());
      setScreensaverSettings(readLocalScreensaverSettings());
      setAutoDarkModeSettings(readLocalAutoDarkModeSettings());
      fetchSettings();
      fetchDeviceSettings();
      fetchUsers();
      fetchChores();
      fetchPrizes();
      fetchUploadedWidgets();
      fetchTabs();
      fetchWidgetAssignments();
      fetchPhotoSources();
      fetchDevices();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== 7) {
      return;
    }

    if (backendStats || aboutLoading) {
      return;
    }

    void refreshAboutData();
  }, [activeTab, aboutLoading, backendStats, isAuthenticated]);

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/devices`);
      setDevices(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setDevices([]);
    }
  };

  const fetchPhotoSources = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/photo-sources`);
      setPhotoSources(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching photo sources:', error);
      setPhotoSources([]);
    }
  };

  const checkPinStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
      setPinExists(response.data.exists);

      if (response.data.exists) {
        setPinModal({ open: true, mode: 'verify', title: 'Enter Admin PIN' });
      } else {
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error checking PIN status:', error);
      setIsAuthenticated(true);
    } finally {
      setCheckingPin(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/settings/search`, ['*']);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchDeviceSettings = async () => {
    try {
      const response = await axios.get(`${API_DEVICE_URL}/settings`);
      const deviceSettings = response.data && typeof response.data === 'object' ? response.data : {};

      const nextWidgetSettings = normalizeWidgetSettings(deviceSettings.widgetSettings);
      const nextPluginSettings = deviceSettings.pluginSettings && typeof deviceSettings.pluginSettings === 'object'
        ? deviceSettings.pluginSettings
        : {};

      setLocalWidgetSettings(nextWidgetSettings);
      setWidgetSettings(nextWidgetSettings);
      setPluginSettings(nextPluginSettings);
    } catch (error) {
      console.error('Error fetching device settings:', error);
    }
  };

  const patchDeviceSettings = async (partialSettings) => {
    await axios.patch(`${API_DEVICE_URL}/settings`, partialSettings);
    window.dispatchEvent(new Event(DEVICE_SETTINGS_UPDATED_EVENT));
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users`);
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    }
  };

  const fetchChores = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chore-schedules`);
      setChores(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching chores:', error);
      setChores([]);
    }
  };

  const fetchPrizes = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/prizes`);
      setPrizes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching prizes:', error);
      setPrizes([]);
    }
  };

  const fetchUploadedWidgets = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/widgets`);
      setUploadedWidgets(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching uploaded widgets:', error);
      setUploadedWidgets([]);
    }
  };

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

      const coreAssignments = {};
      const pluginAssign = {};
      assignments.forEach(assignment => {
        if (assignment.widget_name.startsWith('plugin:')) {
          if (!pluginAssign[assignment.widget_name]) {
            pluginAssign[assignment.widget_name] = [];
          }
          pluginAssign[assignment.widget_name].push(assignment.tab_number);
        } else {
          if (!coreAssignments[assignment.widget_name]) {
            coreAssignments[assignment.widget_name] = [];
          }
          coreAssignments[assignment.widget_name].push(assignment.tab_number);
        }
      });

      setWidgetAssignments(coreAssignments);
      setPluginAssignments(pluginAssign);
    } catch (error) {
      console.error('Error fetching widget assignments:', error);
      setWidgetAssignments({});
      setPluginAssignments({});
    }
  };

  const fetchGithubWidgets = async () => {
    setLoadingGithub(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/widgets/github`);
      setGithubWidgets(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching GitHub widgets:', error);
      setGithubWidgets([]);
    } finally {
      setLoadingGithub(false);
    }
  };

  const fetchTagsForCommit = async (repository, commitSha) => {
    const repoParts = splitRepositorySlug(repository);
    if (!repoParts || !commitSha) {
      return [];
    }

    const response = await axios.get(`https://api.github.com/repos/${repoParts.owner}/${repoParts.name}/tags`, {
      params: { per_page: 100 },
      timeout: 10000,
    });

    const tags = Array.isArray(response.data) ? response.data : [];
    const matchingTags = tags
      .filter((tag) => commitMatches(tag?.commit?.sha, commitSha))
      .map((tag) => tag?.name)
      .filter((tagName) => typeof tagName === 'string' && tagName.trim().length > 0);

    return Array.from(new Set(matchingTags));
  };

  const refreshAboutData = async () => {
    setAboutLoading(true);
    setAboutError('');

    try {
      const statsResponse = await axios.get(`${API_BASE_URL}/api/stats`);
      const backend = statsResponse?.data?.backend && typeof statsResponse.data.backend === 'object'
        ? statsResponse.data.backend
        : null;
      setBackendStats(backend);

      setAboutTagsLoading(true);
      try {
        const [frontendTags, backendTags] = await Promise.all([
          fetchTagsForCommit(FRONTEND_GITHUB_REPOSITORY, FRONTEND_GIT_COMMIT),
          fetchTagsForCommit(backend?.repository, backend?.commit),
        ]);
        setFrontendCommitTags(frontendTags);
        setBackendCommitTags(backendTags);
      } catch (tagError) {
        console.error('Error fetching commit tags:', tagError);
        setFrontendCommitTags([]);
        setBackendCommitTags([]);
      } finally {
        setAboutTagsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching build metadata:', error);
      setBackendStats(null);
      setFrontendCommitTags([]);
      setBackendCommitTags([]);
      setAboutError('Failed to load version information.');
      setAboutTagsLoading(false);
    } finally {
      setAboutLoading(false);
    }
  };

  const saveSetting = async (key, value, showMessage = true) => {
    try {
      await axios.post(`${API_BASE_URL}/api/settings`, { key, value });
      setSettings(prev => ({ ...prev, [key]: value }));
      if (showMessage) {
        setSaveMessage({ show: true, type: 'success', text: 'Setting saved successfully!' });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      }
    } catch (error) {
      console.error(`Error saving ${key}:`, error);
      if (showMessage) {
        setSaveMessage({ show: true, type: 'error', text: 'Failed to save setting. Please try again.' });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      }
      throw error;
    }
  };

  const saveDailyClamReward = async () => {
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/api/settings`, {
        key: 'daily_completion_clam_reward',
        value: settings.daily_completion_clam_reward || '2',
      });
      setSaveMessage({ show: true, type: 'success', text: 'Daily completion clam reward saved.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving clam reward:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save clam reward. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const saveChoreSoundSettings = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'CHORE_SOUND_ENABLED', value: settings.CHORE_SOUND_ENABLED || 'false' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'CHORE_SOUND_DEFAULT', value: settings.CHORE_SOUND_DEFAULT || '' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'CHORE_SOUND_VOLUME', value: String(settings.CHORE_SOUND_VOLUME ?? '100') }),
      ]);
      setSaveMessage({ show: true, type: 'success', text: 'Chore sound settings saved.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving chore sound settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save chore sound settings.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAllApiSettings = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'WEATHER_API_KEY', value: settings.WEATHER_API_KEY || '' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'PROXY_WHITELIST', value: settings.PROXY_WHITELIST || '' })
      ]);
      setSaveMessage({ show: true, type: 'success', text: 'All settings saved successfully!' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving API settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save some settings. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const getMissingEnabledCoreWidgetAssignments = (settingsToValidate, assignmentsToValidate) => {
    const normalizedSettings = normalizeWidgetSettings(settingsToValidate);

    return Object.keys(DEFAULT_WIDGET_SETTINGS).filter((widgetName) => {
      const isEnabled = Boolean(normalizedSettings?.[widgetName]?.enabled);
      const selectedTabNumbers = assignmentsToValidate?.[widgetName];
      return isEnabled && (!Array.isArray(selectedTabNumbers) || selectedTabNumbers.length === 0);
    });
  };

  const getMissingEnabledPluginAssignments = (pluginSettingsToValidate, assignmentsToValidate, uploadedWidgetsToValidate) => {
    const uploadedPluginFilenames = new Set((uploadedWidgetsToValidate || []).map((widget) => widget.filename));

    return Object.entries(pluginSettingsToValidate || {}).reduce((missing, [filename, config]) => {
      if (!uploadedPluginFilenames.has(filename)) {
        return missing;
      }

      if (!config?.enabled) {
        return missing;
      }

      const pluginWidgetName = `plugin:${filename}`;
      const selectedTabNumbers = assignmentsToValidate?.[pluginWidgetName];
      if (!Array.isArray(selectedTabNumbers) || selectedTabNumbers.length === 0) {
        missing.push(pluginWidgetName);
      }

      return missing;
    }, []);
  };

  const saveWidgetSettings = async () => {
    const missingEnabledWidgets = getMissingEnabledCoreWidgetAssignments(widgetSettings, widgetAssignments);
    if (missingEnabledWidgets.length > 0) {
      setSaveMessage({ show: true, type: 'error', text: 'Each enabled widget must have at least one tab selected.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
      return;
    }

    setIsLoading(true);
    try {
      const normalizedWidgetSettings = normalizeWidgetSettings(widgetSettings);
      setLocalWidgetSettings(normalizedWidgetSettings);
      setWidgetSettings(normalizedWidgetSettings);
      await patchDeviceSettings({ widgetSettings: normalizedWidgetSettings });

      const currentResponse = await axios.get(`${API_DEVICE_URL}/widget-assignments`);
      const currentAssignments = Array.isArray(currentResponse.data) ? currentResponse.data : [];

      for (const [widgetName, desiredTabNumbers] of Object.entries(widgetAssignments)) {
        const existing = currentAssignments.filter(a => a.widget_name === widgetName);
        const existingTabNumbers = existing.map(a => a.tab_number);

        const toRemove = existing.filter(a => !desiredTabNumbers.includes(a.tab_number));
        const toAdd = desiredTabNumbers.filter(number => !existingTabNumbers.includes(number));

        for (const assignment of toRemove) {
          await axios.delete(`${API_DEVICE_URL}/widget-assignments/${assignment.id}`);
        }

        for (const tabNumber of toAdd) {
          await axios.post(`${API_DEVICE_URL}/widget-assignments`, {
            widget_name: widgetName,
            tabNumber: tabNumber,
          });
        }
      }

      if (onTabsChanged) {
        await onTabsChanged();
      }

      setSaveMessage({ show: true, type: 'success', text: 'Widget settings saved successfully.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving widget settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save widget settings. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const savePluginSettings = async () => {
    const missingEnabledPlugins = getMissingEnabledPluginAssignments(pluginSettings, pluginAssignments, uploadedWidgets);
    if (missingEnabledPlugins.length > 0) {
      setSaveMessage({ show: true, type: 'error', text: 'Each enabled plugin must have at least one tab selected.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
      return;
    }

    setIsLoading(true);
    try {
      await patchDeviceSettings({ pluginSettings });

      const currentResponse = await axios.get(`${API_DEVICE_URL}/widget-assignments`);
      const currentAssignments = Array.isArray(currentResponse.data) ? currentResponse.data : [];

      for (const [pluginWidgetName, desiredTabNumbers] of Object.entries(pluginAssignments)) {
        const existing = currentAssignments.filter(a => a.widget_name === pluginWidgetName);
        const existingTabNumbers = existing.map(a => a.tab_number);

        const toRemove = existing.filter(a => !desiredTabNumbers.includes(a.tab_number));
        const toAdd = desiredTabNumbers.filter(number => !existingTabNumbers.includes(number));

        for (const assignment of toRemove) {
          await axios.delete(`${API_DEVICE_URL}/widget-assignments/${assignment.id}`);
        }

        for (const tabNumber of toAdd) {
          await axios.post(`${API_DEVICE_URL}/widget-assignments`, {
            widget_name: pluginWidgetName,
            tabNumber: tabNumber,
          });
        }
      }

      if (onTabsChanged) {
        await onTabsChanged();
      }

      if (onPluginsChanged) onPluginsChanged();
      setSaveMessage({ show: true, type: 'success', text: 'Plugin settings saved successfully.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving plugin settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save plugin settings. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWidgetAssignmentChange = (widgetName, selectedTabNumbers) => {
    setWidgetAssignments(prev => ({
      ...prev,
      [widgetName]: selectedTabNumbers
    }));
  };

  const openCreateTabDialog = () => {
    setTabIconModalState({
      open: true,
      mode: 'create',
      originalNumber: null,
      initialData: null,
    });
  };

  const openEditTabDialog = (tab) => {
    setTabIconModalState({
      open: true,
      mode: 'edit',
      originalNumber: tab.number,
      initialData: {
        label: tab.label || '',
        icon: tab.icon || 'star',
        show_label: Boolean(tab.show_label),
      },
    });
  };

  const closeTabEditorDialog = () => {
    setTabIconModalState(prev => ({ ...prev, open: false }));
  };

  const saveTabDefinition = async (tabData) => {
    const trimmedLabel = (tabData.label || '').trim();
    if (!trimmedLabel) {
      setSaveMessage({ show: true, type: 'error', text: 'Tab label is required.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      return;
    }

    try {
      setIsLoading(true);
      if (tabIconModalState.mode === 'edit') {
        await axios.patch(`${API_DEVICE_URL}/tabs/${tabIconModalState.originalNumber}`, {
          label: trimmedLabel,
          icon: tabData.icon,
          show_label: tabData.show_label,
        });
      } else {
        await axios.post(`${API_DEVICE_URL}/tabs`, {
          label: trimmedLabel,
          icon: tabData.icon,
          show_label: tabData.show_label,
        });
      }

      closeTabEditorDialog();
      await fetchTabs();
      if (onTabsChanged) {
        await onTabsChanged();
      }
      setSaveMessage({ show: true, type: 'success', text: `Tab ${tabIconModalState.mode === 'edit' ? 'updated' : 'created'} successfully.` });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving tab:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save tab. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteTab = (tab) => {
    setDeleteTabDialog({ open: true, tab });
  };

  const confirmDeleteTab = async () => {
    if (!deleteTabDialog.tab) {
      return;
    }

    try {
      setIsLoading(true);
      await axios.delete(`${API_DEVICE_URL}/tabs/${deleteTabDialog.tab.number}`);
      setDeleteTabDialog({ open: false, tab: null });
      await fetchTabs();
      await fetchWidgetAssignments();
      if (onTabsChanged) {
        await onTabsChanged();
      }
      setSaveMessage({ show: true, type: 'success', text: 'Tab deleted successfully.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error deleting tab:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to delete tab. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTabOrder = async (orderedTabNumbers) => {
    try {
      setIsLoading(true);
      await axios.patch(`${API_DEVICE_URL}/tabs/reorder`, { orderedTabNumbers });
      await fetchTabs();
      await fetchWidgetAssignments();
      if (onTabsChanged) {
        await onTabsChanged();
      }
    } catch (error) {
      console.error('Error reordering tabs:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to reorder tabs. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTabShowLabel = async (tab) => {
    try {
      setIsLoading(true);
      await axios.patch(`${API_DEVICE_URL}/tabs/${tab.number}`, {
        label: tab.label,
        icon: tab.icon,
        show_label: !Boolean(tab.show_label),
      });

      await fetchTabs();
      if (onTabsChanged) {
        await onTabsChanged();
      }

      setSaveMessage({ show: true, type: 'success', text: 'Tab label visibility updated.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error updating tab label visibility:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to update tab label visibility.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabDragStart = (tabNumber) => {
    setDraggingTabNumber(tabNumber);
  };

  const handleTabDrop = async (targetTabNumber) => {
    if (draggingTabNumber == null || draggingTabNumber === targetTabNumber) {
      setDraggingTabNumber(null);
      return;
    }

    const draggableTabs = tabs
      .filter(tab => tab.number !== 1)
      .sort((a, b) => a.number - b.number);

    const fromIndex = draggableTabs.findIndex(tab => tab.number === draggingTabNumber);
    const toIndex = draggableTabs.findIndex(tab => tab.number === targetTabNumber);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggingTabNumber(null);
      return;
    }

    const next = [...draggableTabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const orderedTabNumbers = next.map(tab => tab.number);

    setDraggingTabNumber(null);
    await saveTabOrder(orderedTabNumbers);
  };

  const openCopyDeviceDialog = (device) => {
    setCopyDeviceDialog({ open: true, device });
  };

  const confirmCopyDeviceToCurrent = async () => {
    if (!copyDeviceDialog.device?.name) {
      return;
    }

    try {
      setIsLoading(true);
      await axios.post(`${API_DEVICE_URL}/copy-from/${encodeURIComponent(copyDeviceDialog.device.name)}`);

      setCopyDeviceDialog({ open: false, device: null });
      await fetchTabs();
      await fetchWidgetAssignments();
      await fetchDeviceSettings();
      await fetchDevices();
      if (onTabsChanged) {
        await onTabsChanged();
      }

      setSaveMessage({ show: true, type: 'success', text: 'Device tabs and widget settings copied successfully.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error copying device settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to copy device settings. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteDeviceDialog = (device) => {
    setDeleteDeviceDialog({ open: true, device });
  };

  const openRenameDeviceDialog = () => {
    setRenameDeviceDialog({
      open: true,
      currentName: currentDeviceName,
      newName: currentDeviceName,
      error: '',
    });
  };

  const confirmRenameDevice = async () => {
    const nextName = (renameDeviceDialog.newName || '').trim();
    if (!nextName) {
      setRenameDeviceDialog(prev => ({ ...prev, error: 'Device Name is required.' }));
      return;
    }

    if (nextName === renameDeviceDialog.currentName) {
      setRenameDeviceDialog(prev => ({ ...prev, open: false, error: '' }));
      return;
    }

    try {
      setIsLoading(true);
      await axios.patch(`${API_BASE_URL}/api/devices/${encodeURIComponent(renameDeviceDialog.currentName)}`, {
        name: nextName,
      });

      setDeviceName(nextName);
      setCurrentDeviceName(nextName);
      setRenameDeviceDialog({ open: false, currentName: '', newName: '', error: '' });
      await fetchDevices();
      setSaveMessage({ show: true, type: 'success', text: 'Device Name updated. Reloading to apply changes.' });
      setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (error) {
      console.error('Error renaming device:', error);
      const errorMessage = error?.response?.data?.error || 'Failed to update device name. Please try again.';
      setRenameDeviceDialog(prev => ({ ...prev, error: errorMessage }));
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDeleteDevice = async () => {
    const deviceName = deleteDeviceDialog.device?.name;
    if (!deviceName) {
      return;
    }

    if (deviceName === currentDeviceName) {
      setSaveMessage({ show: true, type: 'error', text: 'You cannot delete the current device.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      setDeleteDeviceDialog({ open: false, device: null });
      return;
    }

    try {
      setIsLoading(true);
      await axios.delete(`${API_BASE_URL}/api/devices/${encodeURIComponent(deviceName)}`);
      setDeleteDeviceDialog({ open: false, device: null });
      await fetchDevices();
      setSaveMessage({ show: true, type: 'success', text: 'Device deleted successfully.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error deleting device:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to delete device. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const saveInterfaceSettings = async () => {
    try {
      setIsLoading(true);
      const normalizedColors = normalizeInterfaceColors(interfaceColors);
      localStorage.setItem(INTERFACE_COLORS_STORAGE_KEY, JSON.stringify(normalizedColors));

      // Apply CSS variables immediately
      applyAccentColors();
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));

      setSaveMessage({ show: true, type: 'success', text: 'Accent colors saved for this display.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving accent colors:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save accent colors. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const applyAccentColors = () => {
    const root = document.documentElement;
    const isLight = root.getAttribute('data-theme') === 'light';

    root.style.setProperty('--primary', interfaceColors.primary);
    root.style.setProperty('--secondary', interfaceColors.secondary);
    root.style.setProperty('--accent', interfaceColors.accent);

    if (isLight) {
      root.style.setProperty('--background', interfaceColors.primary);
    }
  };

  const resetToDefaults = () => {
    setInterfaceColors({ ...DEFAULT_INTERFACE_COLORS });
    setSaveMessage({ show: true, type: 'info', text: 'Reset to default colors. Click Save to apply.' });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
  };

  const saveScreensaverSettings = async () => {
    try {
      setIsLoading(true);
      const normalizedScreensaver = normalizeScreensaverSettings(screensaverSettings);
      localStorage.setItem(INTERFACE_SCREENSAVER_STORAGE_KEY, JSON.stringify(normalizedScreensaver));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      setSaveMessage({ show: true, type: 'success', text: 'Screensaver settings saved for this display.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving screensaver settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save screensaver settings. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const resolveAutoDarkModeLocation = async (locationQuery) => {
    const apiKey = settings.WEATHER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('Please save an OpenWeather API key in the Connections tab first.');
    }

    const normalized = locationQuery.trim();
    const directCandidates = [normalized];
    if (!normalized.includes(',') && /[a-zA-Z]/.test(normalized)) {
      directCandidates.push(`${normalized},US`);
    }

    for (const candidate of directCandidates) {
      const response = await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
        params: {
          q: candidate,
          limit: 1,
          appid: apiKey,
        },
      });

      const first = Array.isArray(response.data) ? response.data[0] : null;
      if (first && typeof first.lat === 'number' && typeof first.lon === 'number') {
        const nameParts = [first.name, first.state, first.country].filter(Boolean);
        return {
          lat: first.lat,
          lon: first.lon,
          resolvedName: nameParts.join(', '),
        };
      }
    }

    const zipPattern = /^[0-9]{3,10}(,[a-zA-Z]{2})?$/;
    if (zipPattern.test(normalized)) {
      const zipValue = normalized.includes(',') ? normalized : `${normalized},US`;
      const response = await axios.get('https://api.openweathermap.org/geo/1.0/zip', {
        params: {
          zip: zipValue,
          appid: apiKey,
        },
      });

      if (typeof response?.data?.lat === 'number' && typeof response?.data?.lon === 'number') {
        const nameParts = [response.data.name, response.data.country].filter(Boolean);
        return {
          lat: response.data.lat,
          lon: response.data.lon,
          resolvedName: nameParts.join(', '),
        };
      }
    }

    throw new Error('Location not found. Try a city, city/state, city/country, or ZIP code.');
  };

  const saveAutoDarkModeSettings = async () => {
    const trimmedLocation = autoDarkModeSettings.locationQuery.trim();

    if (!autoDarkModeSettings.enabled) {
      const nextSettings = {
        ...autoDarkModeSettings,
        locationQuery: trimmedLocation,
      };
      localStorage.setItem(INTERFACE_AUTO_DARK_MODE_STORAGE_KEY, JSON.stringify(nextSettings));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      setAutoDarkModeSettings(nextSettings);
      setSaveMessage({ show: true, type: 'success', text: 'Auto dark mode disabled for this display.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      return;
    }

    if (!settings.WEATHER_API_KEY?.trim()) {
      setSaveMessage({
        show: true,
        type: 'error',
        text: 'Add and save your OpenWeather API key in Connections before enabling auto dark mode.',
      });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3500);
      return;
    }

    if (!trimmedLocation) {
      setSaveMessage({
        show: true,
        type: 'error',
        text: 'Enter a location before enabling auto dark mode.',
      });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      return;
    }

    try {
      setIsSavingAutoDarkMode(true);
      const resolved = await resolveAutoDarkModeLocation(trimmedLocation);
      const nextSettings = {
        ...autoDarkModeSettings,
        enabled: true,
        locationQuery: trimmedLocation,
        lat: resolved.lat,
        lon: resolved.lon,
        resolvedName: resolved.resolvedName,
      };

      localStorage.setItem(INTERFACE_AUTO_DARK_MODE_STORAGE_KEY, JSON.stringify(nextSettings));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      setAutoDarkModeSettings(nextSettings);
      setSaveMessage({
        show: true,
        type: 'success',
        text: 'Auto dark mode saved for this display. Use the bottom-bar theme button until the half sun/half moon icon appears.',
      });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4500);
    } catch (error) {
      console.error('Error saving auto dark mode settings:', error);
      const message = error?.response?.data?.message || error.message || 'Failed to save auto dark mode settings.';
      setSaveMessage({ show: true, type: 'error', text: message });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3500);
    } finally {
      setIsSavingAutoDarkMode(false);
    }
  };

  useEffect(() => {
    const hasCoordinates = typeof autoDarkModeSettings.lat === 'number' && typeof autoDarkModeSettings.lon === 'number';
    const apiKey = settings.WEATHER_API_KEY?.trim();

    if (!autoDarkModeSettings.resolvedName || !hasCoordinates || !apiKey) {
      setAutoDarkModeSunTimes({ sunrise: null, sunset: null, timezoneOffset: 0 });
      setAutoDarkModeSunTimesError('');
      setAutoDarkModeSunTimesLoading(false);
      return;
    }

    let isCancelled = false;
    const fetchSunTimes = async () => {
      setAutoDarkModeSunTimesLoading(true);
      setAutoDarkModeSunTimesError('');

      try {
        const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
          params: {
            lat: autoDarkModeSettings.lat,
            lon: autoDarkModeSettings.lon,
            appid: apiKey,
          },
        });

        const sunrise = response?.data?.sys?.sunrise;
        const sunset = response?.data?.sys?.sunset;
        const timezoneOffset = response?.data?.timezone;

        if (typeof sunrise !== 'number' || typeof sunset !== 'number') {
          throw new Error('Sunrise and sunset are unavailable for this location.');
        }

        if (!isCancelled) {
          setAutoDarkModeSunTimes({
            sunrise,
            sunset,
            timezoneOffset: typeof timezoneOffset === 'number' ? timezoneOffset : 0,
          });
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error fetching auto dark mode sunrise/sunset:', error);
          setAutoDarkModeSunTimes({ sunrise: null, sunset: null, timezoneOffset: 0 });
          setAutoDarkModeSunTimesError('Unable to load today\'s sunrise and sunset.');
        }
      } finally {
        if (!isCancelled) {
          setAutoDarkModeSunTimesLoading(false);
        }
      }
    };

    void fetchSunTimes();

    return () => {
      isCancelled = true;
    };
  }, [autoDarkModeSettings.resolvedName, autoDarkModeSettings.lat, autoDarkModeSettings.lon, settings.WEATHER_API_KEY]);

  const formatAutoDarkModeLocationTime = (unixSeconds, timezoneOffsetSeconds = 0) => {
    if (typeof unixSeconds !== 'number') {
      return '--';
    }

    const shiftedTime = new Date((unixSeconds + timezoneOffsetSeconds) * 1000);
    return shiftedTime.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  };

  const hasImmichConfigured = photoSources.some(source => source.type === 'Immich' && source.enabled === 1);
  const hasTabsCreated = tabs.length > 0;

  const handleWidgetToggle = (widget, field) => {
    setLocalWidgetSettings(prev => ({
      ...prev,
      [widget]: {
        ...prev[widget],
        [field]: !prev[widget][field]
      }
    }));
  };

  const handleRefreshIntervalChange = (widget, interval) => {
    setLocalWidgetSettings(prev => ({
      ...prev,
      [widget]: {
        ...prev[widget],
        refreshInterval: interval
      }
    }));
  };

  const handleSettingChange = (setting, value) => {
    setInterfaceColors(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleColorChange = (colorKey, color) => {
    setInterfaceColors(prev => ({
      ...prev,
      [colorKey]: color.hex
    }));
  };

  const saveUser = async () => {
    try {
      setIsLoading(true);
      const isCreatingUser = !editingUser;
      if (editingUser) {
        await axios.patch(`${API_BASE_URL}/api/users/${editingUser.id}`, editingUser);
      } else {
        await axios.post(`${API_BASE_URL}/api/users`, newUser);
        setNewUser({ username: '', email: '', profile_picture: '' });
      }
      setEditingUser(null);
      fetchUsers();
      if (isCreatingUser) {
        window.dispatchEvent(new Event(USERS_UPDATED_EVENT));
      }
    } catch (error) {
      console.error('Error saving user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (userId) => {
    try {
      setIsLoading(true);
      const userSchedules = chores.filter(schedule => schedule.user_id === userId);
      for (const schedule of userSchedules) {
        await axios.delete(`${API_BASE_URL}/api/chore-schedules/${schedule.id}`);
      }

      await axios.delete(`${API_BASE_URL}/api/users/${userId}`);

      fetchUsers();
      fetchChores();
      window.dispatchEvent(new Event(USERS_UPDATED_EVENT));
      setDeleteUserDialog({ open: false, user: null });
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserDelete = (user) => {
    setDeleteUserDialog({ open: true, user });
  };

  const updateUserClams = async (userId, newTotal) => {
    try {
      setIsLoading(true);
      const user = users.find(u => u.id === userId);
      const currentTotal = user?.clam_total || 0;
      const diff = newTotal - currentTotal;

      if (diff > 0) {
        await axios.post(`${API_BASE_URL}/api/users/${userId}/clams/add`, { amount: diff });
      } else if (diff < 0) {
        await axios.post(`${API_BASE_URL}/api/users/${userId}/clams/reduce`, { amount: Math.abs(diff) });
      }
      fetchUsers();
    } catch (error) {
      console.error('Error updating user clams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClamSave = async (newTotal) => {
    if (!clamModalUser) return;
    await updateUserClams(clamModalUser.id, newTotal);
    setClamModalUser(null);
  };

  const savePrize = async () => {
    try {
      setIsLoading(true);
      if (editingPrize) {
        await axios.patch(`${API_BASE_URL}/api/prizes/${editingPrize.id}`, editingPrize);
      } else {
        await axios.post(`${API_BASE_URL}/api/prizes`, newPrize);
        setNewPrize({ name: '', clam_cost: 0 });
      }
      setEditingPrize(null);
      fetchPrizes();
    } catch (error) {
      console.error('Error saving prize:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deletePrize = async (prizeId) => {
    if (window.confirm('Are you sure you want to delete this prize?')) {
      try {
        setIsLoading(true);
        await axios.delete(`${API_BASE_URL}/api/prizes/${prizeId}`);
        fetchPrizes();
      } catch (error) {
        console.error('Error deleting prize:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleWidgetUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      await axios.post(`${API_BASE_URL}/api/widgets/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchUploadedWidgets();
      if (onPluginsChanged) onPluginsChanged();
    } catch (error) {
      console.error('Error uploading widget:', error);
      alert('Failed to upload widget. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteWidget = async (filename) => {
    if (window.confirm('Are you sure you want to delete this widget?')) {
      try {
        setIsLoading(true);
        await axios.delete(`${API_BASE_URL}/api/widgets/${filename}`);
        const pluginWidgetName = `plugin:${filename}`;
        await axios.delete(`${API_DEVICE_URL}/widget-assignments/widget/${encodeURIComponent(pluginWidgetName)}`).catch(() => { });
        let nextPluginSettings = {};
        setPluginSettings(prev => {
          const updated = { ...prev };
          delete updated[filename];
          nextPluginSettings = updated;
          return updated;
        });
        await patchDeviceSettings({ pluginSettings: nextPluginSettings });
        setPluginAssignments(prev => {
          const updated = { ...prev };
          delete updated[pluginWidgetName];
          return updated;
        });
        fetchUploadedWidgets();
        if (onPluginsChanged) onPluginsChanged();
      } catch (error) {
        console.error('Error deleting widget:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const installGithubWidget = async (widget) => {
    try {
      setIsLoading(true);
      await axios.post(`${API_BASE_URL}/api/widgets/github/install`, {
        download_url: widget.download_url,
        filename: widget.filename,
        name: widget.name
      });
      fetchUploadedWidgets();
      if (onPluginsChanged) onPluginsChanged();
      alert(`Widget "${widget.name}" installed successfully!`);
    } catch (error) {
      console.error('Error installing GitHub widget:', error);
      alert('Failed to install widget. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const openChoreModal = (user) => {
    const userChores = chores.filter(chore => chore.user_id === user.id);
    setChoreModal({ open: true, user, userChores });
  };

  const closeChoreModal = () => {
    setChoreModal({ open: false, user: null, userChores: [] });
  };

  const deleteChore = async (scheduleId) => {
    if (window.confirm('Are you sure you want to remove this chore schedule?')) {
      try {
        setIsLoading(true);
        await axios.delete(`${API_BASE_URL}/api/chore-schedules/${scheduleId}`);
        await fetchChores();
        if (choreModal.user) {
          setChoreModal(prev => ({
            ...prev,
            userChores: prev.userChores.filter(c => c.id !== scheduleId)
          }));
        }
      } catch (error) {
        console.error('Error deleting chore schedule:', error);
        alert('Failed to delete chore schedule. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleProfilePictureUpload = async (userId, event) => {
    const file = event.target.files[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', file.name, 'Size:', file.size, 'Type:', file.type);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      console.log(`Uploading picture for user ${userId}...`);

      const response = await axios.post(
        `${API_BASE_URL}/api/users/${userId}/upload-picture`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      console.log('Upload response:', response.data);

      await fetchUsers();
      console.log('Users fetched after upload');
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      console.error('Error details:', error.response?.data);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const UserAvatar = ({ user }) => {
    const [imageError, setImageError] = useState(false);

    let imageUrl = null;
    if (user.profile_picture) {
      if (user.profile_picture.startsWith('data:')) {
        imageUrl = user.profile_picture;
      } else {
        imageUrl = `${API_BASE_URL}/Uploads/users/${user.profile_picture}`;
      }
    }

    if (imageUrl && !imageError) {
      return (
        <img
          src={imageUrl}
          alt={user.username}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '2px solid var(--accent)'
          }}
          onError={() => {
            console.error('Failed to load image:', imageUrl);
            setImageError(true);
          }}
        />
      );
    }

    return (
      <Avatar sx={{ width: 40, height: 40, bgcolor: 'var(--accent)' }}>
        {user.username.charAt(0).toUpperCase()}
      </Avatar>
    );
  };

  const getUserChoreCount = (userId) => {
    return chores.filter(chore => chore.user_id === userId).length;
  };

  const handlePinVerify = async (pin) => {
    try {
      if (pinModal.mode === 'set') {
        await axios.post(`${API_BASE_URL}/api/admin-pin/set`, { pin });
        setPinExists(true);
        setIsAuthenticated(true);
        setPinModal({ open: false, mode: 'verify', title: '' });
        setSaveMessage({ show: true, type: 'success', text: 'Admin PIN set successfully!' });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      } else {
        const response = await axios.post(`${API_BASE_URL}/api/admin-pin/verify`, { pin });
        if (response.data.valid) {
          setIsAuthenticated(true);
          setPinModal({ open: false, mode: 'verify', title: '' });
        } else {
          throw new Error('Invalid PIN');
        }
      }
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Invalid PIN. Please try again.');
    }
  };

  const handlePinModalClose = () => {
    if (pinModal.mode === 'set' && !pinExists) {
      return;
    }
    if (!isAuthenticated) {
      return;
    }
    setPinModal({ open: false, mode: 'verify', title: '' });
  };

  const handleUpdatePin = () => {
    setPinModal({ open: true, mode: 'set', title: 'Update Admin PIN' });
  };

  const handleClearPin = async () => {
    if (!window.confirm('Are you sure you want to remove the admin PIN? Anyone will be able to access the admin panel without a PIN.')) {
      return;
    }
    try {
      setIsLoading(true);
      await axios.delete(`${API_BASE_URL}/api/admin-pin`);
      setPinExists(false);
      setSaveMessage({ show: true, type: 'success', text: 'Admin PIN removed. Admin panel is now unprotected.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
    } catch (error) {
      console.error('Error clearing PIN:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to remove PIN. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const renderColorPicker = (key, label) => (
    <Box key={key} sx={{ mb: 3 }}>
      <Typography variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 60,
            height: 60,
            backgroundColor: interfaceColors[key],
            border: '3px solid var(--card-border)',
            borderRadius: 2,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            '&:hover': {
              transform: 'scale(1.05)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }
          }}
          onClick={(e) => {
            if (colorPickerAnchor.key === key) {
              setColorPickerAnchor({ key: null, el: null });
            } else {
              setColorPickerAnchor({ key, el: e.currentTarget });
            }
          }}
        />
        <TextField
          size="medium"
          value={interfaceColors[key]}
          onChange={(e) => handleSettingChange(key, e.target.value)}
          sx={{ flex: 1 }}
          placeholder="#000000"
        />
      </Box>
      <ColorPickerPopover
        anchorEl={colorPickerAnchor.key === key ? colorPickerAnchor.el : null}
        color={interfaceColors[key]}
        onChange={(color) => handleColorChange(key, color)}
        onClose={() => setColorPickerAnchor({ key: null, el: null })}
      />
    </Box>
  );

  const getRefreshIntervalLabel = (interval) => {
    const option = refreshIntervalOptions.find(opt => opt.value === interval);
    return option ? option.label : 'Disabled';
  };

  const adminTabs = [
    'Widgets',
    'Interface',
    'Users',
    'Chores',
    'Prizes',
    'Security',
    'Connections',
    'About'
  ];

  const frontendRepository = isValidRepositorySlug(FRONTEND_GITHUB_REPOSITORY)
    ? FRONTEND_GITHUB_REPOSITORY
    : DEFAULT_HOMEGLOW_REPOSITORY;
  const frontendCommitUrl = buildCommitUrl(frontendRepository, FRONTEND_GIT_COMMIT);
  const backendRepository = isValidRepositorySlug(backendStats?.repository)
    ? backendStats.repository
    : DEFAULT_HOMEGLOW_REPOSITORY;
  const backendCommitUrl = buildCommitUrl(backendRepository, backendStats?.commit);
  const weatherHasRequiredTabsError = Boolean(widgetSettings.weather?.enabled)
    && (!Array.isArray(widgetAssignments.weather) || widgetAssignments.weather.length === 0);

  if (checkingPin) {
    return (
      <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
        <PinModal
          open={pinModal.open}
          onClose={handlePinModalClose}
          onVerify={handlePinVerify}
          mode={pinModal.mode}
          title={pinModal.title}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom sx={{ pr: { xs: 5, sm: 0 } }}>
        ⚙️ Admin Panel
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(e, newValue) => setActiveTab(newValue)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 3 }}
      >
        {adminTabs.map((tab, index) => (
          <Tab key={tab} label={tab} />
        ))}
      </Tabs>

      {/* Widgets Tab */}
      {activeTab === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs
                value={widgetsSubTab}
                onChange={(_, v) => setWidgetsSubTab(v)}
                size="small"
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
              >
                <Tab label="Widgets" />
                <Tab label="Plugins" />
                <Tab label="Tabs" />
                <Tab label="Devices" />
              </Tabs>
            </Box>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            {widgetsSubTab === 0 && (
              <Box
                component="form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  saveWidgetSettings();
                }}
              >
                <Alert severity="info" sx={{ mb: 2 }}>
                  Enable widgets to show them on the dashboard. Click to select a widget, then drag to move or resize from corners.
                </Alert>

                {Object.entries(widgetSettings).filter(([key]) =>
                  ['chores', 'calendar', 'photos'].includes(key)
                ).map(([widget, config]) => {
                  const hasRequiredTabsError = Boolean(config.enabled) && (!Array.isArray(widgetAssignments[widget]) || widgetAssignments[widget].length === 0);

                  return (
                  <Box key={widget} sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, textTransform: 'capitalize', fontWeight: 'bold' }}>
                      {widget} Widget
                    </Typography>

                    <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={config.enabled}
                              onChange={() => handleWidgetToggle(widget, 'enabled')}
                            />
                          }
                          label="Enabled"
                        />
                        <FormControlLabel
                          control={
                            <Switch
                              checked={config.transparent}
                              onChange={() => handleWidgetToggle(widget, 'transparent')}
                            />
                          }
                          label="Transparent Background"
                          sx={{ ml: 2 }}
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel id={`${widget}-refresh-label`}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Timer fontSize="small" />
                              Auto-Refresh Interval
                            </Box>
                          </InputLabel>
                          <Select
                            labelId={`${widget}-refresh-label`}
                            value={config.refreshInterval || 0}
                            onChange={(e) => handleRefreshIntervalChange(widget, e.target.value)}
                            label="Auto-Refresh Interval"
                          >
                            {refreshIntervalOptions.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Box sx={{ mt: 2 }}>
                      <Autocomplete
                        multiple
                        options={tabs}
                        getOptionLabel={(option) => option.label}
                        value={tabs.filter(tab => widgetAssignments[widget]?.includes(tab.number))}
                        onChange={(e, newValue) => {
                          handleWidgetAssignmentChange(widget, newValue.map(tab => tab.number));
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Show on Tabs"
                            required={Boolean(config.enabled)}
                            error={hasRequiredTabsError}
                            placeholder="Select tabs..."
                            helperText={
                              hasRequiredTabsError
                                ? 'Required: select at least one tab when this widget is enabled.'
                                : 'Select which tabs this widget should appear on.'
                            }
                          />
                        )}
                      />
                    </Box>

                    {config.refreshInterval > 0 && (
                      <Alert severity="info" sx={{ mt: 2 }} icon={<Timer />}>
                        This widget will automatically refresh every {getRefreshIntervalLabel(config.refreshInterval).toLowerCase()}
                      </Alert>
                    )}
                  </Box>
                  );
                })}

                <Box sx={{ mb: 3, p: 2, border: '2px solid var(--accent)', borderRadius: 1, backgroundColor: 'rgba(158, 127, 255, 0.05)' }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                    Weather Widget
                  </Typography>

                  <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={widgetSettings.weather?.enabled || false}
                            onChange={() => handleWidgetToggle('weather', 'enabled')}
                          />
                        }
                        label="Enabled"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={widgetSettings.weather?.transparent || false}
                            onChange={() => handleWidgetToggle('weather', 'transparent')}
                          />
                        }
                        label="Transparent Background"
                        sx={{ ml: 2 }}
                      />
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="weather-refresh-label">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Timer fontSize="small" />
                            Auto-Refresh Interval
                          </Box>
                        </InputLabel>
                        <Select
                          labelId="weather-refresh-label"
                          value={widgetSettings.weather?.refreshInterval || 0}
                          onChange={(e) => handleRefreshIntervalChange('weather', e.target.value)}
                          label="Auto-Refresh Interval"
                        >
                          {refreshIntervalOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Box sx={{ mt: 2 }}>
                    <Autocomplete
                      multiple
                      options={tabs}
                      getOptionLabel={(option) => option.label}
                      value={tabs.filter(tab => widgetAssignments['weather']?.includes(tab.number))}
                      onChange={(e, newValue) => {
                        handleWidgetAssignmentChange('weather', newValue.map(tab => tab.number));
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Show on Tabs"
                          required={Boolean(widgetSettings.weather?.enabled)}
                          error={weatherHasRequiredTabsError}
                          placeholder="Select tabs..."
                          helperText={
                            weatherHasRequiredTabsError
                              ? 'Required: select at least one tab when this widget is enabled.'
                              : 'Select which tabs this widget should appear on.'
                          }
                        />
                      )}
                    />
                  </Box>

                  {widgetSettings.weather?.refreshInterval > 0 && (
                    <Alert severity="info" sx={{ mt: 2 }} icon={<Timer />}>
                      Weather widget will automatically refresh every {getRefreshIntervalLabel(widgetSettings.weather.refreshInterval).toLowerCase()}
                    </Alert>
                  )}
                </Box>

                <Button type="submit" variant="contained" sx={{ mt: 2 }} startIcon={<Save />}>
                  Save Widget Settings
                </Button>
              </Box>
            )}

            {widgetsSubTab === 1 && (
              <>
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle1" gutterBottom>Upload Custom Widget</Typography>
                    <Button
                      variant="contained"
                      component="label"
                      startIcon={<Upload />}
                      fullWidth
                      sx={{ mb: 2 }}
                    >
                      Upload HTML Widget
                      <input
                        type="file"
                        hidden
                        accept=".html"
                        onChange={handleWidgetUpload}
                      />
                    </Button>

                    <Typography variant="subtitle1" gutterBottom>Uploaded Widgets</Typography>
                    <List>
                      {uploadedWidgets.map((widget) => (
                        <ListItem key={widget.filename} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                          <ListItemText
                            primary={widget.name}
                            secondary={`File: ${widget.filename}`}
                          />
                          <ListItemSecondaryAction>
                            <IconButton onClick={() => deleteWidget(widget.filename)} color="error">
                              <Delete />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1">GitHub Widget Repository</Typography>
                      <Button
                        onClick={fetchGithubWidgets}
                        startIcon={loadingGithub ? <CircularProgress size={16} /> : <Refresh />}
                        disabled={loadingGithub}
                      >
                        Refresh
                      </Button>
                    </Box>

                    <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
                      {githubWidgets.map((widget) => (
                        <ListItem key={widget.path} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                          <ListItemText
                            primary={widget.name}
                            secondary={widget.description}
                          />
                          <ListItemSecondaryAction>
                            <Button
                              onClick={() => installGithubWidget(widget)}
                              startIcon={<CloudDownload />}
                              size="small"
                              variant="outlined"
                            >
                              Install
                            </Button>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  </Grid>
                </Grid>

                {uploadedWidgets.length > 0 && (
                  <Box
                    component="form"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      savePluginSettings();
                    }}
                  >
                    <Divider sx={{ my: 3 }} />
                    <Typography variant="h6" gutterBottom>Plugin Settings</Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Configure each installed plugin below. Enable them, set transparency, refresh intervals, and assign to tabs just like core widgets.
                    </Alert>

                    {uploadedWidgets.map((plugin) => {
                      const pSettings = pluginSettings[plugin.filename] || {};
                      const pluginWidgetName = `plugin:${plugin.filename}`;
                      const hasRequiredTabsError = Boolean(pSettings.enabled) && (!Array.isArray(pluginAssignments[pluginWidgetName]) || pluginAssignments[pluginWidgetName].length === 0);
                      return (
                        <Box key={plugin.filename} sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                {plugin.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {plugin.filename}
                              </Typography>
                            </Box>
                            <IconButton onClick={() => deleteWidget(plugin.filename)} color="error" size="small">
                              <Delete />
                            </IconButton>
                          </Box>

                          <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={pSettings.enabled || false}
                                    onChange={() => {
                                      setPluginSettings(prev => ({
                                        ...prev,
                                        [plugin.filename]: { ...prev[plugin.filename], enabled: !(prev[plugin.filename]?.enabled) }
                                      }));
                                    }}
                                  />
                                }
                                label="Enabled"
                              />
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={pSettings.transparent || false}
                                    onChange={() => {
                                      setPluginSettings(prev => ({
                                        ...prev,
                                        [plugin.filename]: { ...prev[plugin.filename], transparent: !(prev[plugin.filename]?.transparent) }
                                      }));
                                    }}
                                  />
                                }
                                label="Transparent Background"
                                sx={{ ml: 2 }}
                              />
                            </Grid>

                            <Grid size={{ xs: 12, sm: 6 }}>
                              <FormControl fullWidth size="small">
                                <InputLabel id={`plugin-${plugin.filename}-refresh-label`}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Timer fontSize="small" />
                                    Auto-Refresh Interval
                                  </Box>
                                </InputLabel>
                                <Select
                                  labelId={`plugin-${plugin.filename}-refresh-label`}
                                  value={pSettings.refreshInterval || 0}
                                  onChange={(e) => {
                                    setPluginSettings(prev => ({
                                      ...prev,
                                      [plugin.filename]: { ...prev[plugin.filename], refreshInterval: e.target.value }
                                    }));
                                  }}
                                  label="Auto-Refresh Interval"
                                >
                                  {refreshIntervalOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                      {option.label}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Grid>
                          </Grid>

                          <Box sx={{ mt: 2 }}>
                            <Autocomplete
                              multiple
                              options={tabs}
                              getOptionLabel={(option) => option.label}
                              value={tabs.filter(tab => pluginAssignments[pluginWidgetName]?.includes(tab.number))}
                              onChange={(e, newValue) => {
                                setPluginAssignments(prev => ({
                                  ...prev,
                                  [pluginWidgetName]: newValue.map(tab => tab.number)
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Show on Tabs"
                                  required={Boolean(pSettings.enabled)}
                                  error={hasRequiredTabsError}
                                  placeholder="Select tabs..."
                                  helperText={
                                    hasRequiredTabsError
                                      ? 'Required: select at least one tab when this plugin is enabled.'
                                      : 'Select which tabs this plugin should appear on.'
                                  }
                                />
                              )}
                            />
                          </Box>
                        </Box>
                      );
                    })}

                    <Button type="submit" variant="contained" sx={{ mt: 2 }} startIcon={<Save />}>
                      Save Plugin Settings
                    </Button>
                  </Box>
                )}
              </>
            )}

            {widgetsSubTab === 2 && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Alert severity="info" sx={{ mb: 0, flex: 1, mr: 2 }}>
                    Manage dashboard tabs. Drag rows to reorder tabs. Home tab cannot be edited or deleted.
                  </Alert>
                  <Button variant="contained" startIcon={<Add />} onClick={openCreateTabDialog}>
                    Add Tab
                  </Button>
                </Box>

                <TableContainer component={Paper}>
                  <Table sx={stackableTableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell width={60}>Order</TableCell>
                        <TableCell>Label</TableCell>
                        <TableCell>Icon</TableCell>
                        <TableCell>Show Label</TableCell>
                        <TableCell width={120}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...tabs].sort((a, b) => a.number - b.number).map((tab) => {
                        const isHome = tab.number === 1;
                        return (
                          <TableRow
                            key={tab.id}
                            draggable={!isHome}
                            onDragStart={() => handleTabDragStart(tab.number)}
                            onDragOver={(e) => {
                              if (!isHome) {
                                e.preventDefault();
                              }
                            }}
                            onDrop={() => {
                              if (!isHome) {
                                handleTabDrop(tab.number);
                              }
                            }}
                            sx={{
                              cursor: isHome ? 'default' : 'grab',
                              opacity: draggingTabNumber === tab.number ? 0.65 : 1,
                            }}
                          >
                            <TableCell data-label="Order">
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {!isHome && <DragIndicator fontSize="small" />}
                                <Chip label={tab.number} size="small" />
                              </Box>
                            </TableCell>
                            <TableCell data-label="Label">
                              {tab.label}
                              {isHome && (
                                <Chip size="small" label="Home" color="primary" sx={{ ml: 1 }} />
                              )}
                            </TableCell>
                            <TableCell data-label="Icon">
                              <Chip size="small" label={tab.icon} />
                            </TableCell>
                            <TableCell data-label="Show Label">
                              <Switch
                                checked={Boolean(tab.show_label)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleTabShowLabel(tab)}
                                disabled={isLoading}
                                slotProps={{ input: { 'aria-label': `Toggle show label for ${tab.label}` } }}
                              />
                            </TableCell>
                            <TableCell>
                              <IconButton
                                onClick={() => openEditTabDialog(tab)}
                                color="primary"
                                size="small"
                                disabled={isHome}
                              >
                                <Edit />
                              </IconButton>
                              <IconButton
                                onClick={() => requestDeleteTab(tab)}
                                color="error"
                                size="small"
                                disabled={isHome}
                              >
                                <Delete />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {widgetsSubTab === 3 && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Manage devices and copy tabs/widget settings between them. Copying will overwrite the current device tabs and widget assignments.
                </Alert>

                <Box sx={{ mb: 2, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Current Device Name
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label="Current" color="primary" size="small" />
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {currentDeviceName}
                    </Typography>
                  </Box>
                </Box>

                <TableContainer component={Paper}>
                  <Table sx={stackableTableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Last Updated</TableCell>
                        <TableCell>Widgets</TableCell>
                        <TableCell width={120}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {devices.map((device) => {
                        const isCurrent = device.name === currentDeviceName;
                        return (
                          <TableRow key={device.name}>
                            <TableCell data-label="Name">
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                {isCurrent && <Chip label="Current" color="primary" size="small" />}
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {device.name}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell data-label="Last Updated">
                              {device.updateTime ? new Date(device.updateTime).toLocaleString() : 'Unknown'}
                            </TableCell>
                            <TableCell data-label="Widgets">
                              <Chip label={Number(device.widgets) || 0} size="small" />
                            </TableCell>
                            <TableCell>
                              {isCurrent ? (
                                <IconButton
                                  onClick={openRenameDeviceDialog}
                                  color="primary"
                                  size="small"
                                  title="Rename current device"
                                >
                                  <Edit />
                                </IconButton>
                              ) : (
                                <IconButton
                                  onClick={() => openCopyDeviceDialog(device)}
                                  color="primary"
                                  size="small"
                                  title="Copy this device to current"
                                >
                                  <ContentCopy />
                                </IconButton>
                              )}
                              <IconButton
                                onClick={() => openDeleteDeviceDialog(device)}
                                color="error"
                                size="small"
                                title="Delete device"
                                disabled={isCurrent}
                              >
                                <Delete />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Interface Tab */}
      {activeTab === 1 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">Accent Colors</Typography>
              <Button
                variant="outlined"
                startIcon={<RestartAlt />}
                onClick={resetToDefaults}
                size="small"
              >
                Reset to Defaults
              </Button>
            </Box>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Alert severity="info" sx={{ mb: 3 }}>
              Background color applies to light mode only. Accent color is used throughout the dashboard for highlights and interactive elements.
            </Alert>

            <Box sx={{ maxWidth: 600, mx: 'auto' }}>
              {renderColorPicker('primary', '🎨 Background Color (Light Mode)')}
              {renderColorPicker('secondary', '💎 Secondary Color')}
              {renderColorPicker('accent', '✨ Accent Color')}
            </Box>

            <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="contained"
                onClick={saveInterfaceSettings}
                startIcon={<Save />}
                size="large"
              >
                Save Accent Colors
              </Button>
              <Button
                variant="outlined"
                onClick={() => window.location.reload()}
                startIcon={<Refresh />}
                size="large"
              >
                Refresh Page
              </Button>
            </Box>

            <Divider sx={{ my: 4 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
              <Nightlight />
              <Typography variant="h6">Screensaver</Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              The screensaver activates after a period of inactivity, cycling through tabs or displaying a photo slideshow.
            </Alert>

            <Box sx={{ maxWidth: 600, mx: 'auto' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={screensaverSettings.enabled}
                    onChange={(e) => setScreensaverSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                }
                label="Enable Screensaver"
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Screensaver Mode
              </Typography>

              <RadioGroup
                value={screensaverSettings.mode}
                onChange={(e) => setScreensaverSettings(prev => ({ ...prev, mode: e.target.value }))}
                sx={{ mb: 3 }}
              >
                <Tooltip
                  title={!hasTabsCreated ? "Create tabs in the dashboard to use this mode" : ""}
                  placement="right"
                >
                  <FormControlLabel
                    value="tabs"
                    control={<Radio disabled={!hasTabsCreated} />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TabIcon fontSize="small" />
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 'bold',
                              color: !hasTabsCreated ? 'text.disabled' : 'inherit'
                            }}
                          >
                            Cycle Through Tabs
                          </Typography>
                          <Typography
                            variant="caption"
                            color={!hasTabsCreated ? 'text.disabled' : 'text.secondary'}
                          >
                            {hasTabsCreated
                              ? `Automatically switch between ${tabs.length} tab${tabs.length !== 1 ? 's' : ''}`
                              : 'No tabs created yet'}
                          </Typography>
                        </Box>
                        {!hasTabsCreated && (
                          <Tooltip title="Create tabs in the Tab Bar to enable this feature">
                            <Info fontSize="small" color="disabled" />
                          </Tooltip>
                        )}
                      </Box>
                    }
                    sx={{ opacity: !hasTabsCreated ? 0.6 : 1 }}
                  />
                </Tooltip>

                <Tooltip
                  title={!hasImmichConfigured ? "Configure Immich in the Photos widget settings to use this mode" : ""}
                  placement="right"
                >
                  <FormControlLabel
                    value="photos"
                    control={<Radio disabled={!hasImmichConfigured} />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PhotoLibrary fontSize="small" />
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 'bold',
                              color: !hasImmichConfigured ? 'text.disabled' : 'inherit'
                            }}
                          >
                            Immich Photo Slideshow
                          </Typography>
                          <Typography
                            variant="caption"
                            color={!hasImmichConfigured ? 'text.disabled' : 'text.secondary'}
                          >
                            {hasImmichConfigured
                              ? 'Display photos from your Immich library'
                              : 'Immich not configured'}
                          </Typography>
                        </Box>
                        {!hasImmichConfigured && (
                          <Tooltip title="Configure an Immich photo source in the Photos widget to enable this feature">
                            <Info fontSize="small" color="disabled" />
                          </Tooltip>
                        )}
                      </Box>
                    }
                    sx={{ opacity: !hasImmichConfigured ? 0.6 : 1 }}
                  />
                </Tooltip>
              </RadioGroup>

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Inactivity Timeout: {screensaverSettings.timeout} minute{screensaverSettings.timeout !== 1 ? 's' : ''}
              </Typography>
              <Slider
                value={screensaverSettings.timeout}
                onChange={(e, value) => setScreensaverSettings(prev => ({ ...prev, timeout: value }))}
                min={1}
                max={30}
                marks={[
                  { value: 1, label: '1m' },
                  { value: 5, label: '5m' },
                  { value: 10, label: '10m' },
                  { value: 15, label: '15m' },
                  { value: 30, label: '30m' }
                ]}
                sx={{ mb: 4 }}
              />

              {screensaverSettings.mode === 'photos' && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                    Photo Slideshow Interval: {screensaverSettings.slideshowInterval} second{screensaverSettings.slideshowInterval !== 1 ? 's' : ''}
                  </Typography>
                  <Slider
                    value={screensaverSettings.slideshowInterval}
                    onChange={(e, value) => setScreensaverSettings(prev => ({ ...prev, slideshowInterval: value }))}
                    min={3}
                    max={60}
                    marks={[
                      { value: 3, label: '3s' },
                      { value: 10, label: '10s' },
                      { value: 30, label: '30s' },
                      { value: 60, label: '60s' }
                    ]}
                    sx={{ mb: 4 }}
                  />
                </>
              )}

              {screensaverSettings.mode === 'tabs' && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                    Tab Cycle Interval: {screensaverSettings.slideshowInterval} second{screensaverSettings.slideshowInterval !== 1 ? 's' : ''}
                  </Typography>
                  <Slider
                    value={screensaverSettings.slideshowInterval}
                    onChange={(e, value) => setScreensaverSettings(prev => ({ ...prev, slideshowInterval: value }))}
                    min={5}
                    max={120}
                    marks={[
                      { value: 5, label: '5s' },
                      { value: 30, label: '30s' },
                      { value: 60, label: '60s' },
                      { value: 120, label: '2m' }
                    ]}
                    sx={{ mb: 4 }}
                  />
                </>
              )}

              <Button
                variant="contained"
                onClick={saveScreensaverSettings}
                startIcon={<Save />}
                fullWidth
                sx={{ mt: 2 }}
              >
                Save Screensaver Settings
              </Button>

              <Divider sx={{ my: 4 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Nightlight />
                <Typography variant="h6">Daylight Auto Dark Mode</Typography>
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                To enable auto mode: save an OpenWeather API key in Connections, enter a location here, save this section, then press the bottom-bar theme button until the half sun/half moon icon appears.
              </Alert>

              {!settings.WEATHER_API_KEY?.trim() && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  OpenWeather API key is not set yet. Add it in the Connections tab first.
                </Alert>
              )}

              <FormControlLabel
                control={
                  <Switch
                    checked={autoDarkModeSettings.enabled}
                    onChange={(e) => {
                      setAutoDarkModeSettings(prev => ({
                        ...prev,
                        enabled: e.target.checked,
                      }));
                    }}
                  />
                }
                label="Enable Daylight Auto Dark Mode"
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label="Location"
                value={autoDarkModeSettings.locationQuery}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setAutoDarkModeSettings(prev => ({
                    ...prev,
                    locationQuery: nextValue,
                  }));
                }}
                helperText="Examples: Dallas,TX,US, London,UK, or ZIP code like 76034"
                sx={{ mb: 2 }}
              />

              {autoDarkModeSettings.resolvedName && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Current resolved location: {autoDarkModeSettings.resolvedName}
                    </Typography>
                    {autoDarkModeSunTimesLoading && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        Loading today's sunrise and sunset...
                      </Typography>
                    )}
                    {!autoDarkModeSunTimesLoading && autoDarkModeSunTimes.sunrise && autoDarkModeSunTimes.sunset && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        Today's sunrise: {formatAutoDarkModeLocationTime(autoDarkModeSunTimes.sunrise, autoDarkModeSunTimes.timezoneOffset)} | Sunset: {formatAutoDarkModeLocationTime(autoDarkModeSunTimes.sunset, autoDarkModeSunTimes.timezoneOffset)}
                      </Typography>
                    )}
                    {!autoDarkModeSunTimesLoading && autoDarkModeSunTimesError && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {autoDarkModeSunTimesError}
                      </Typography>
                    )}
                  </Box>
                </Alert>
              )}

              <Button
                variant="contained"
                onClick={saveAutoDarkModeSettings}
                startIcon={<Save />}
                fullWidth
                disabled={isSavingAutoDarkMode}
              >
                {isSavingAutoDarkMode ? 'Saving Auto Dark Mode...' : 'Save Auto Dark Mode Settings'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Users Tab */}
      {activeTab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>User Management</Typography>

            <Box sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>Add New User</Typography>
              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveUser();
                }}
              >
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Username"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={!newUser.username || !newUser.email}
                      fullWidth
                      sx={{ height: '56px' }}
                    >
                      Add User
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            </Box>

            <TableContainer component={Paper}>
              <Table sx={stackableTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Avatar</TableCell>
                    <TableCell>Username</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Clam Total</TableCell>
                    <TableCell>Chores</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <UserAvatar key={`${user.id}-${user.profile_picture}`} user={user} />
                          <Button
                            component="label"
                            size="small"
                            variant="outlined"
                          >
                            Upload
                            <input
                              type="file"
                              hidden
                              accept="image/*"
                              onChange={(e) => handleProfilePictureUpload(user.id, e)}
                            />
                          </Button>
                        </Box>
                      </TableCell>
                      <TableCell data-label="Username">
                        {editingUser?.id === user.id ? (
                          <TextField
                            value={editingUser.username}
                            onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                            size="small"
                          />
                        ) : (
                          user.username
                        )}
                      </TableCell>
                      <TableCell data-label="Email" sx={{ '@media (max-width:599.95px)': { wordBreak: 'break-all' } }}>
                        {editingUser?.id === user.id ? (
                          <TextField
                            value={editingUser.email}
                            onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                            size="small"
                          />
                        ) : (
                          user.email
                        )}
                      </TableCell>
                      <TableCell data-label="Clam Total">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={`${user.clam_total || 0} 🥟`}
                            color="primary"
                            size="small"
                          />
                          <Tooltip title="Edit clams">
                            <IconButton
                              onClick={() => setClamModalUser(user)}
                              color="primary"
                              size="small"
                            >
                              <Edit />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell data-label="Chores">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => openChoreModal(user)}
                          sx={{ minWidth: 'auto' }}
                        >
                          {getUserChoreCount(user.id)} chores
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          {editingUser?.id === user.id ? (
                            <>
                              <IconButton onClick={saveUser} color="primary" size="small">
                                <Save />
                              </IconButton>
                              <IconButton onClick={() => setEditingUser(null)} size="small">
                                <Cancel />
                              </IconButton>
                            </>
                          ) : (
                            <>
                              <IconButton
                                onClick={() => setEditingUser({ ...user })}
                                color="primary"
                                size="small"
                              >
                                <Edit />
                              </IconButton>
                              <IconButton
                                onClick={() => handleUserDelete(user)}
                                color="error"
                                size="small"
                              >
                                <Delete />
                              </IconButton>
                            </>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Chores Tab */}
      {activeTab === 3 && (
        <Card>
          <CardContent>
            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Box sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
                Rewards
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { sm: 'flex-start' } }}>
                <TextField
                  label="Daily Completion Clam Reward"
                  type="number"
                  value={settings.daily_completion_clam_reward || '2'}
                  onChange={(e) => setSettings(prev => ({ ...prev, daily_completion_clam_reward: e.target.value }))}
                  helperText="Clams awarded when a user completes all their daily chores"
                  slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  sx={{ maxWidth: 340, flex: 1 }}
                />
                <Button
                  variant="contained"
                  onClick={saveDailyClamReward}
                  disabled={isLoading}
                  startIcon={<Save />}
                  sx={{ alignSelf: { xs: 'stretch', sm: 'center' }, mt: { xs: 0, sm: 1 } }}
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </Button>
              </Box>
            </Box>

            <Box sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
                Chore Due-Time Sounds
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.CHORE_SOUND_ENABLED === 'true' || settings.CHORE_SOUND_ENABLED === true}
                    onChange={(e) => setSettings(prev => ({ ...prev, CHORE_SOUND_ENABLED: e.target.checked ? 'true' : 'false' }))}
                  />
                }
                label="Enable chore due-time sounds (household-wide master switch)"
              />
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, alignItems: { sm: 'flex-start' }, mt: 1 }}>
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Default sound (used when a chore doesn't pick its own)
                  </Typography>
                  <SoundPicker
                    label="Default sound"
                    value={settings.CHORE_SOUND_DEFAULT || ''}
                    onChange={(sound) => setSettings(prev => ({ ...prev, CHORE_SOUND_DEFAULT: sound }))}
                    volume={(Number(settings.CHORE_SOUND_VOLUME) || 100) / 100}
                    includeNoneOption
                    noneLabel="(none)"
                    allowDelete
                  />
                </Box>
                <Box sx={{ width: 200 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Volume: {Number(settings.CHORE_SOUND_VOLUME) || 0}%
                  </Typography>
                  <Slider
                    value={Number(settings.CHORE_SOUND_VOLUME) || 0}
                    onChange={(_, v) => setSettings(prev => ({ ...prev, CHORE_SOUND_VOLUME: String(v) }))}
                    min={0}
                    max={100}
                    valueLabelDisplay="auto"
                  />
                </Box>
                <Button
                  variant="contained"
                  onClick={saveChoreSoundSettings}
                  disabled={isLoading}
                  startIcon={<Save />}
                  sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </Button>
              </Box>
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs
                value={choresSubTab}
                onChange={(_, v) => setChoresSubTab(v)}
                size="small"
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
              >
                <Tab label="Chores" />
                <Tab label="History" />
              </Tabs>
            </Box>
            {choresSubTab === 0 && (
              <ChoreSchedulesTab saveMessage={saveMessage} setSaveMessage={setSaveMessage} />
            )}
            {choresSubTab === 1 && (
              <ChoreHistoryTab />
            )}
          </CardContent>
        </Card>
      )}

      {/* Prizes Tab */}
      {activeTab === 4 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Prize Management</Typography>

            <Box sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>Add New Prize</Typography>
              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  savePrize();
                }}
              >
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Prize Name"
                      value={newPrize.name}
                      onChange={(e) => setNewPrize({ ...newPrize, name: e.target.value })}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Clam Cost"
                      type="number"
                      value={newPrize.clam_cost}
                      onChange={(e) => setNewPrize({ ...newPrize, clam_cost: parseInt(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={!newPrize.name || newPrize.clam_cost <= 0}
                      fullWidth
                      sx={{ height: '56px' }}
                    >
                      Add Prize
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            </Box>

            <List>
              {prizes.map((prize) => (
                <ListItem key={prize.id} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                  {editingPrize?.id === prize.id ? (
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, width: '100%', alignItems: { xs: 'stretch', sm: 'center' } }}>
                      <TextField
                        label="Prize Name"
                        value={editingPrize.name}
                        onChange={(e) => setEditingPrize({ ...editingPrize, name: e.target.value })}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Clam Cost"
                        type="number"
                        value={editingPrize.clam_cost}
                        onChange={(e) => setEditingPrize({ ...editingPrize, clam_cost: parseInt(e.target.value) || 0 })}
                        sx={{ width: { xs: '100%', sm: 120 } }}
                      />
                      <IconButton onClick={savePrize} color="primary">
                        <Save />
                      </IconButton>
                      <IconButton onClick={() => setEditingPrize(null)}>
                        <Cancel />
                      </IconButton>
                    </Box>
                  ) : (
                    <>
                      <ListItemText
                        primary={prize.name}
                        secondary={`Cost: ${prize.clam_cost} 🥟`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton onClick={() => setEditingPrize({ ...prize })} color="primary">
                          <Edit />
                        </IconButton>
                        <IconButton onClick={() => deletePrize(prize.id)} color="error">
                          <Delete />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </>
                  )}
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Security Tab */}
      {activeTab === 5 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Security Settings</Typography>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Alert severity="info" sx={{ mb: 3 }}>
              The admin PIN is required to access the admin panel. Keep your PIN secure and memorable.
            </Alert>

            <Box sx={{ p: 3, border: '2px solid var(--accent)', borderRadius: 2, backgroundColor: 'rgba(158, 127, 255, 0.05)' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Lock />
                Admin PIN Protection
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {pinExists
                  ? 'Your admin panel is protected with a PIN. You can update your PIN below.'
                  : 'Set up a PIN to secure your admin panel access.'}
              </Typography>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Paper elevation={0} sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      PIN Requirements:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      • 4-8 numeric digits
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      • Numbers only (0-9)
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      • Required for admin access
                    </Typography>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <Paper elevation={0} sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Current Status:
                    </Typography>
                    <Chip
                      label={pinExists ? 'PIN Configured' : 'No PIN Set'}
                      color={pinExists ? 'success' : 'warning'}
                      sx={{ mb: 2 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {pinExists
                        ? 'Your admin panel is secured with a PIN.'
                        : 'Please set a PIN to secure your admin panel.'}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Button
                  variant="contained"
                  onClick={handleUpdatePin}
                  startIcon={<Lock />}
                  fullWidth
                  sx={{
                    py: 1.5,
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
                    fontWeight: 'bold',
                    fontSize: '1rem'
                  }}
                >
                  {pinExists ? 'Update Admin PIN' : 'Set Admin PIN'}
                </Button>
                {pinExists && (
                  <Button
                    variant="outlined"
                    onClick={handleClearPin}
                    color="error"
                    fullWidth
                    sx={{ py: 1, fontWeight: 'bold' }}
                  >
                    Remove PIN
                  </Button>
                )}
              </Box>

              {pinExists && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Changing your PIN will require you to use the new PIN on your next admin panel access.
                </Alert>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Connections Tab */}
      {activeTab === 6 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Connections</Typography>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Box sx={{ maxWidth: 700 }}>
              <Typography variant="subtitle1" sx={{ mt: 1, mb: 1.5, fontWeight: 600 }}>
                API Keys
              </Typography>

              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveAllApiSettings();
                }}
              >
                <TextField
                  fullWidth
                  label="OpenWeatherMap API Key"
                  type="password"
                  value={settings.WEATHER_API_KEY || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, WEATHER_API_KEY: e.target.value }))}
                  sx={{ mb: 2 }}
                  helperText="Get your free API key from openweathermap.org/api"
                />

                <TextField
                  fullWidth
                  label="Proxy Whitelist (comma-separated domains)"
                  value={settings.PROXY_WHITELIST || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, PROXY_WHITELIST: e.target.value }))}
                  sx={{ mb: 2 }}
                  helperText="Domains allowed for proxy requests (e.g., api.example.com, another-api.com)"
                />

                <Button
                  type="submit"
                  variant="contained"
                  disabled={isLoading}
                  startIcon={<Save />}
                  sx={{ mt: 1, mb: 4 }}
                >
                  {isLoading ? 'Saving...' : 'Save API Keys'}
                </Button>
              </Box>

              <Divider sx={{ my: 2 }} />

              <GoogleAccountConnection
                onMessage={({ type, text }) => {
                  setSaveMessage({ show: true, type, text });
                  setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
                }}
              />
            </Box>
          </CardContent>
        </Card>
      )}

      {/* About Tab */}
      {activeTab === 7 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">About</Typography>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={refreshAboutData}
                disabled={aboutLoading}
              >
                {aboutLoading ? 'Refreshing...' : 'Refresh Version Info'}
              </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 2 }}>
              This tab shows build metadata for the running client and server plus any Git tags that point to each commit.
            </Alert>

            {aboutError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {aboutError}
              </Alert>
            )}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    Frontend
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Version
                  </Typography>
                  <Chip label={FRONTEND_VERSION || 'Unknown'} color="primary" size="small" sx={{ mb: 2 }} />

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Commit
                  </Typography>
                  {frontendCommitUrl ? (
                    <Button
                      component="a"
                      href={frontendCommitUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="text"
                      size="small"
                      endIcon={<OpenInNew fontSize="small" />}
                      sx={{ p: 0, minWidth: 0, textTransform: 'none', mb: 2 }}
                    >
                      {toShortCommit(FRONTEND_GIT_COMMIT)}
                    </Button>
                  ) : (
                    <Typography variant="body2" sx={{ mb: 2 }}>Unknown</Typography>
                  )}

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Repository
                  </Typography>
                  <Button
                    component="a"
                    href={`https://github.com/${frontendRepository}`}
                    target="_blank"
                    rel="noreferrer"
                    variant="text"
                    size="small"
                    endIcon={<OpenInNew fontSize="small" />}
                    sx={{ p: 0, minWidth: 0, textTransform: 'none', mb: 2 }}
                  >
                    {frontendRepository}
                  </Button>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Tags for this commit
                  </Typography>
                  {aboutTagsLoading ? (
                    <CircularProgress size={16} />
                  ) : frontendCommitTags.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {frontendCommitTags.map((tagName) => {
                        const tagUrl = buildTagUrl(frontendRepository, tagName);
                        return tagUrl ? (
                          <Chip
                            key={`frontend-tag-${tagName}`}
                            label={tagName}
                            component="a"
                            href={tagUrl}
                            clickable
                            target="_blank"
                            rel="noreferrer"
                            size="small"
                          />
                        ) : (
                          <Chip key={`frontend-tag-${tagName}`} label={tagName} size="small" />
                        );
                      })}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No tags found for this commit.</Typography>
                  )}
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    Backend
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Version
                  </Typography>
                  <Chip label={backendStats?.version || 'Unknown'} color="primary" size="small" sx={{ mb: 2 }} />

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Commit
                  </Typography>
                  {backendCommitUrl ? (
                    <Button
                      component="a"
                      href={backendCommitUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="text"
                      size="small"
                      endIcon={<OpenInNew fontSize="small" />}
                      sx={{ p: 0, minWidth: 0, textTransform: 'none', mb: 2 }}
                    >
                      {toShortCommit(backendStats?.commit)}
                    </Button>
                  ) : (
                    <Typography variant="body2" sx={{ mb: 2 }}>Unknown</Typography>
                  )}

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Repository
                  </Typography>
                  <Button
                    component="a"
                    href={`https://github.com/${backendRepository}`}
                    target="_blank"
                    rel="noreferrer"
                    variant="text"
                    size="small"
                    endIcon={<OpenInNew fontSize="small" />}
                    sx={{ p: 0, minWidth: 0, textTransform: 'none', mb: 2 }}
                  >
                    {backendRepository}
                  </Button>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Tags for this commit
                  </Typography>
                  {aboutTagsLoading ? (
                    <CircularProgress size={16} />
                  ) : backendCommitTags.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {backendCommitTags.map((tagName) => {
                        const tagUrl = buildTagUrl(backendRepository, tagName);
                        return tagUrl ? (
                          <Chip
                            key={`backend-tag-${tagName}`}
                            label={tagName}
                            component="a"
                            href={tagUrl}
                            clickable
                            target="_blank"
                            rel="noreferrer"
                            size="small"
                          />
                        ) : (
                          <Chip key={`backend-tag-${tagName}`} label={tagName} size="small" />
                        );
                      })}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No tags found for this commit.</Typography>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* User Delete Confirmation Dialog */}
      <TabIconModal
        open={tabIconModalState.open}
        onClose={closeTabEditorDialog}
        onSave={saveTabDefinition}
        title={tabIconModalState.mode === 'edit' ? 'Edit Tab' : 'Create New Tab'}
        saveButtonText={tabIconModalState.mode === 'edit' ? 'Save Changes' : 'Create Tab'}
        initialData={tabIconModalState.initialData}
      />

      <Dialog
        open={deleteTabDialog.open}
        onClose={() => setDeleteTabDialog({ open: false, tab: null })}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            <Typography variant="h6">Delete Tab</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Widgets assigned to this tab will be moved by the server rules for deleted tabs.
          </Alert>
          <Typography>
            Are you sure you want to delete <strong>{deleteTabDialog.tab?.label}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTabDialog({ open: false, tab: null })} variant="outlined">
            Cancel
          </Button>
          <Button onClick={confirmDeleteTab} variant="contained" color="error" startIcon={<Delete />}>
            Delete Tab
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={copyDeviceDialog.open}
        onClose={() => setCopyDeviceDialog({ open: false, device: null })}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="warning" />
            <Typography variant="h6">Copy Device Settings</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action will COPY all tabs and widget settings from the selected device to this current client.
          </Alert>
          <Typography sx={{ mb: 2 }}>
            This will overwrite all current tabs and widget assignments.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Source device: <strong>{copyDeviceDialog.device?.name}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Destination device: <strong>{currentDeviceName}</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDeviceDialog({ open: false, device: null })} variant="outlined">
            Cancel
          </Button>
          <Button onClick={confirmCopyDeviceToCurrent} variant="contained" color="warning" startIcon={<ContentCopy />}>
            Confirm Copy
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={renameDeviceDialog.open}
        onClose={() => setRenameDeviceDialog({ open: false, currentName: '', newName: '', error: '' })}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Edit color="primary" />
            <Typography variant="h6">Rename Current Device Name</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="New Device Name"
            value={renameDeviceDialog.newName}
            onChange={(e) => setRenameDeviceDialog(prev => ({ ...prev, newName: e.target.value, error: '' }))}
            error={Boolean(renameDeviceDialog.error)}
            helperText={renameDeviceDialog.error || 'This updates the current device name in both server and local storage.'}
            sx={{ mt: 1 }}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDeviceDialog({ open: false, currentName: '', newName: '', error: '' })} variant="outlined">
            Cancel
          </Button>
          <Button onClick={confirmRenameDevice} variant="contained" startIcon={<Save />}>
            Save Name
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDeviceDialog.open}
        onClose={() => setDeleteDeviceDialog({ open: false, device: null })}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            <Typography variant="h6">Delete Device</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone.
          </Alert>
          <Typography>
            Are you sure you want to delete device <strong>{deleteDeviceDialog.device?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDeviceDialog({ open: false, device: null })} variant="outlined">
            Cancel
          </Button>
          <Button onClick={confirmDeleteDevice} variant="contained" color="error" startIcon={<Delete />}>
            Delete Device
          </Button>
        </DialogActions>
      </Dialog>

      {/* User Delete Confirmation Dialog */}
      <Dialog
        open={deleteUserDialog.open}
        onClose={() => setDeleteUserDialog({ open: false, user: null })}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            <Typography variant="h6">Delete User</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete user <strong>{deleteUserDialog.user?.username}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This will also delete all {getUserChoreCount(deleteUserDialog.user?.id || 0)} chores assigned to this user.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteUserDialog({ open: false, user: null })}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={() => deleteUser(deleteUserDialog.user?.id)}
            variant="contained"
            color="error"
            startIcon={<Delete />}
          >
            Delete User & Chores
          </Button>
        </DialogActions>
      </Dialog>

      {/* User Chores Modal */}
      <Dialog
        open={choreModal.open}
        onClose={closeChoreModal}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">
              Chores for {choreModal.user?.username}
            </Typography>
            <Chip
              label={`${choreModal.userChores.length} total`}
              color="primary"
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          {choreModal.userChores.length === 0 ? (
            <Typography variant="body1" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No chores assigned to this user.
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 1 }}>
              <Table sx={stackableTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Schedule (Crontab)</TableCell>
                    <TableCell>Visible</TableCell>
                    <TableCell>Clams</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {choreModal.userChores.map((chore) => (
                    <TableRow key={chore.id}>
                      <TableCell data-label="Title">
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {chore.title}
                        </Typography>
                      </TableCell>
                      <TableCell data-label="Description">
                        <Typography variant="body2" color="text.secondary">
                          {chore.description || 'No description'}
                        </Typography>
                      </TableCell>
                      <TableCell data-label="Schedule">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {chore.crontab || 'One-time'}
                        </Typography>
                      </TableCell>
                      <TableCell data-label="Visible">
                        <Chip
                          label={chore.visible ? 'Visible' : 'Hidden'}
                          color={chore.visible ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell data-label="Clams">
                        {chore.clam_value > 0 ? (
                          <Chip
                            label={`${chore.clam_value} 🥟`}
                            color="primary"
                            size="small"
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Regular
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          onClick={() => deleteChore(chore.id)}
                          color="error"
                          size="small"
                          title="Delete chore"
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeChoreModal} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Loading Indicator */}
      <Backdrop
        sx={{
          color: '#fff',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
        }}
        open={isLoading}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            p: 4,
            borderRadius: 3,
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <Box
            sx={{
              position: 'relative',
              width: 80,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {[0, 1, 2].map((index) => (
              <Box
                key={index}
                sx={{
                  position: 'absolute',
                  fontSize: '2rem',
                  animation: `clamBounce 1.5s ease-in-out ${index * 0.2}s infinite`,
                  '@keyframes clamBounce': {
                    '0%, 80%, 100%': {
                      transform: 'scale(0.8) translateY(0)',
                      opacity: 0.6,
                    },
                    '40%': {
                      transform: 'scale(1.2) translateY(-20px)',
                      opacity: 1,
                    },
                  },
                }}
              >
                🥟
              </Box>
            ))}
          </Box>

          <Typography
            variant="h6"
            sx={{
              color: 'white',
              fontWeight: 'bold',
              textAlign: 'center',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
            }}
          >
            Processing...
          </Typography>

          <CircularProgress
            size={40}
            thickness={2}
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              },
            }}
          />
        </Box>
      </Backdrop>

      {/* PIN Modal */}
      <PinModal
        open={pinModal.open}
        onClose={handlePinModalClose}
        onVerify={handlePinVerify}
        mode={pinModal.mode}
        title={pinModal.title}
      />

      <ClamValueModal
        open={!!clamModalUser}
        user={clamModalUser}
        onClose={() => setClamModalUser(null)}
        onSave={handleClamSave}
        isSaving={isLoading}
      />
    </Box>
  );
};

export default AdminPanel;
