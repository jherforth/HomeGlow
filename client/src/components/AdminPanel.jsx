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
  BeachAccess,
  Tab as TabIcon,
  DragIndicator,
  PhotoLibrary,
  Info,
  OpenInNew,
  ArrowUpward,
  ArrowDownward
} from '@mui/icons-material';
import ColorPickerPopover from './ColorPickerPopover';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase, getDeviceName, setDeviceName } from '../utils/deviceName.js';
import PinModal from './PinModal';
import ChoreSchedulesTab from './ChoreSchedulesTab';
import ChoreHistoryTab from './ChoreHistoryTab';
import TabIconModal from './TabIconModal';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';
import AdminFormSection from './AdminFormSection';
import VersionInfoCard from './VersionInfoCard';
import LoadingBackdrop from './LoadingBackdrop';
import RefreshIntervalSelect from './RefreshIntervalSelect';
import ScreensaverIntervalSlider from './ScreensaverIntervalSlider';
import GoogleAccountConnection from './GoogleAccountConnection';
import ClamValueModal from './ClamValueModal';
import SoundPicker from './SoundPicker';
import useFetchTabs from '../hooks/useFetchTabs.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { syncWidgetAssignments } from '../utils/assignmentSync.js';
import { normalizeWidgetSettings as normalizeSharedWidgetSettings } from '../utils/widgetSettings.js';
import { stackableTableSx } from '../utils/responsiveTable.js';
import {
  INTERFACE_COLORS_STORAGE_KEY,
  SCREENSAVER_SETTINGS_STORAGE_KEY,
  AUTO_DARK_MODE_SETTINGS_STORAGE_KEY,
  VACATION_MODE_STORAGE_KEY,
  DEFAULT_INTERFACE_COLORS,
  normalizeInterfaceColors,
  normalizeScreensaverSettings,
  normalizeVacationModeSettings,
  readLocalInterfaceColors,
  readLocalScreensaverSettings,
  readLocalAutoDarkModeSettings,
  readLocalVacationModeSettings,
} from '../utils/interfaceSettings.js';
import { useTranslation } from 'react-i18next';
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n/index.js';

const USERS_UPDATED_EVENT = 'homeglow:users-updated';
const DEVICE_SETTINGS_UPDATED_EVENT = 'homeglow:device-settings-updated';
const INTERFACE_SETTINGS_UPDATED_EVENT = 'homeglow:interface-settings-updated';
const DEFAULT_WIDGET_SETTINGS = {
  chores: { enabled: false, refreshInterval: 0 },
  calendar: { enabled: false, refreshInterval: 0 },
  photos: { enabled: false, refreshInterval: 0 },
  weather: { enabled: false, refreshInterval: 0 },
};

const normalizeWidgetSettings = (raw) => normalizeSharedWidgetSettings(raw, DEFAULT_WIDGET_SETTINGS);

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


const AdminPanel = ({ setWidgetSettings, onPluginsChanged, onTabsChanged }) => {
  const { t, i18n } = useTranslation(['admin', 'common']);
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
    // Write-only: the server redacts this from GET /api/settings, so the field
    // starts blank and an empty save leaves the stored key untouched.
    WEATHER_API_KEY: '',
    WEATHER_PROVIDER: 'openweathermap',
    PROXY_WHITELIST: '',
    daily_completion_clam_reward: '2',
    CHORE_CELEBRATION_ENABLED: 'true',
    CHORE_SOUND_ENABLED: 'false',
    CHORE_SOUND_DEFAULT: '',
    CHORE_SOUND_VOLUME: '100'
  });
  // Home Assistant connection (issue #57). Like the Google client secret, the
  // token is never sent back to the browser — only whether one is stored.
  const [weatherProviderStatus, setWeatherProviderStatus] = useState(null);
  const [homeAssistantStatus, setHomeAssistantStatus] = useState(null);
  const [homeAssistantDraft, setHomeAssistantDraft] = useState({ url: '', token: '', weather_entity: '' });
  const [homeAssistantEntities, setHomeAssistantEntities] = useState([]);
  const [homeAssistantTestResult, setHomeAssistantTestResult] = useState(null);
  const [isTestingHomeAssistant, setIsTestingHomeAssistant] = useState(false);
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
  // Default avatar bank (issue #132): picker targets an existing user row, or
  // the add-user form when userId is null.
  const [defaultAvatars, setDefaultAvatars] = useState([]);
  const [avatarPicker, setAvatarPicker] = useState({ open: false, userId: null });
  const [newPrize, setNewPrize] = useState({ name: '', clam_cost: 0, repeatable: false });
  const [prizeOffers, setPrizeOffers] = useState([]);
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
  const { tabs, fetchTabs } = useFetchTabs(API_DEVICE_URL);
  const [widgetAssignments, setWidgetAssignments] = useState({});
  const [pluginSettings, setPluginSettings] = useState({});
  const [pluginAssignments, setPluginAssignments] = useState({});
  // Values for settings a plugin declared in its manifest (issue #105 Phase 2),
  // keyed by pluginId. Saved via /api/plugin/v1/settings, not the device blob.
  const [pluginDeclaredValues, setPluginDeclaredValues] = useState({});
  // Which declared-setting keys the user actually edited. Only dirty keys are
  // PUT on save, so untouched manifest defaults are never materialized into
  // stored values (a stored default would pin the household against future
  // manifest default changes).
  const [pluginDeclaredDirty, setPluginDeclaredDirty] = useState({});
  const [photoSources, setPhotoSources] = useState([]);
  const [screensaverSettings, setScreensaverSettings] = useState(readLocalScreensaverSettings);
  const [vacationModeSettings, setVacationModeSettings] = useState(readLocalVacationModeSettings);
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
  // User display order (issue #134): drag on desktop, arrows everywhere.
  const [draggingUserId, setDraggingUserId] = useState(null);
  const handleLanguageChange = async (code) => {
    try {
      await changeLanguage(code);
      setSaveMessage({ show: true, type: 'success', text: t('admin:language.saved') });
    } catch (error) {
      console.error('Error switching language:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:language.switchFailed') });
    }
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
  };

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
    { label: t('admin:refresh.disabled'), value: 0 },
    { label: t('admin:refresh.min5'), value: 5 * 60 * 1000 },
    { label: t('admin:refresh.min15'), value: 15 * 60 * 1000 },
    { label: t('admin:refresh.min30'), value: 30 * 60 * 1000 },
    { label: t('admin:refresh.hour1'), value: 60 * 60 * 1000 },
    { label: t('admin:refresh.hour2'), value: 2 * 60 * 60 * 1000 },
    { label: t('admin:refresh.hour6'), value: 6 * 60 * 60 * 1000 },
    { label: t('admin:refresh.hour12'), value: 12 * 60 * 60 * 1000 },
    { label: t('admin:refresh.hour24'), value: 24 * 60 * 60 * 1000 }
  ];

  useEffect(() => {
    checkPinStatus();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setInterfaceColors(readLocalInterfaceColors());
      setScreensaverSettings(readLocalScreensaverSettings());
      setVacationModeSettings(readLocalVacationModeSettings());
      setAutoDarkModeSettings(readLocalAutoDarkModeSettings());
      fetchSettings();
      fetchWeatherConnectionStatus();
      fetchDeviceSettings();
      fetchUsers();
      fetchChores();
      fetchPrizes();
      fetchDefaultAvatars();
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
        setPinModal({ open: true, mode: 'verify', title: t('admin:pin.enter') });
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
    try {
      const offersResponse = await axios.get(`${API_BASE_URL}/api/prize-offers`);
      setPrizeOffers(Array.isArray(offersResponse.data) ? offersResponse.data : []);
    } catch (error) {
      console.error('Error fetching prize offers:', error);
      setPrizeOffers([]);
    }
  };

  // Prize store: place a ledger prize in the store as a one-time redeemable
  // offer (kids request it on the kiosk; a parent approves there).
  const addPrizeToStore = async (prizeId) => {
    try {
      await axios.post(`${API_BASE_URL}/api/prize-offers`, { prize_id: prizeId });
      await fetchPrizes();
    } catch (error) {
      console.error('Error adding prize to store:', error);
      alert(t('admin:messages.prizeAddToStoreFailed'));
    }
  };

  const removePrizeOffer = async (offerId) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/prize-offers/${offerId}`);
      await fetchPrizes();
    } catch (error) {
      console.error('Error removing prize offer:', error);
      alert(t('admin:messages.prizeRemoveOfferFailed'));
    }
  };

  const fetchUploadedWidgets = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/widgets`);
      const widgets = Array.isArray(response.data) ? response.data : [];
      setUploadedWidgets(widgets);
      await fetchPluginDeclaredValues(widgets);
    } catch (error) {
      console.error('Error fetching uploaded widgets:', error);
      setUploadedWidgets([]);
    }
  };

  // Load effective values for each manifest plugin's declared settings.
  const fetchPluginDeclaredValues = async (widgets) => {
    const manifestPlugins = (widgets || []).filter(
      (widget) => widget.pluginId && Array.isArray(widget.manifest?.settings) && widget.manifest.settings.length > 0
    );
    const entries = await Promise.all(manifestPlugins.map(async (widget) => {
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/plugin/v1/settings/${widget.pluginId}?device=${encodeURIComponent(currentDeviceName)}`
        );
        return [widget.pluginId, response.data && typeof response.data === 'object' ? response.data : {}];
      } catch (error) {
        console.error(`Error fetching settings for plugin ${widget.pluginId}:`, error);
        return [widget.pluginId, {}];
      }
    }));
    setPluginDeclaredValues(Object.fromEntries(entries));
    // Freshly loaded server values are clean by definition.
    setPluginDeclaredDirty({});
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
        setSaveMessage({ show: true, type: 'success', text: t('admin:messages.settingSaved') });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      }
    } catch (error) {
      console.error(`Error saving ${key}:`, error);
      if (showMessage) {
        setSaveMessage({ show: true, type: 'error', text: t('admin:messages.settingSaveFailed') });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      }
      throw error;
    }
  };

  // The celebration fires at exactly the moment the daily reward is earned, so
  // the two save together rather than needing their own button (issue #140).
  const saveDailyClamReward = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        axios.post(`${API_BASE_URL}/api/settings`, {
          key: 'daily_completion_clam_reward',
          value: settings.daily_completion_clam_reward || '2',
        }),
        axios.post(`${API_BASE_URL}/api/settings`, {
          key: 'CHORE_CELEBRATION_ENABLED',
          value: settings.CHORE_CELEBRATION_ENABLED === false || settings.CHORE_CELEBRATION_ENABLED === 'false'
            ? 'false'
            : 'true',
        }),
      ]);
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.clamRewardSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving clam reward:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.clamRewardFailed') });
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
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.choreSoundsSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving chore sound settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.choreSoundsFailed') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWeatherConnectionStatus = async () => {
    try {
      const [provider, ha] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/connections/weather/status`),
        axios.get(`${API_BASE_URL}/api/connections/homeassistant/status`),
      ]);
      setWeatherProviderStatus(provider.data);
      setHomeAssistantStatus(ha.data);
      setHomeAssistantDraft((prev) => ({
        ...prev,
        url: ha.data?.url || '',
        weather_entity: ha.data?.weather_entity || '',
      }));
      // Bind to the stored setting, not the effective provider: in demo mode
      // the effective one is "demo", which is not a selectable option.
      setSettings((prev) => ({
        ...prev,
        WEATHER_PROVIDER: provider.data?.configured_provider || 'openweathermap',
      }));
    } catch (error) {
      console.error('Error fetching weather connection status:', error);
    }
  };

  const saveHomeAssistantConnection = async () => {
    setIsLoading(true);
    try {
      const response = await axios.put(`${API_BASE_URL}/api/connections/homeassistant`, {
        url: homeAssistantDraft.url,
        // An empty token means "keep the stored one" — the field is blank on
        // load because the server never sends the token back.
        ...(homeAssistantDraft.token ? { token: homeAssistantDraft.token } : {}),
        weather_entity: homeAssistantDraft.weather_entity,
      });
      setHomeAssistantStatus(response.data?.status || null);
      setHomeAssistantDraft((prev) => ({ ...prev, token: '' }));
      await fetchWeatherConnectionStatus();
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.homeAssistantSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving Home Assistant connection:', error);
      const text = error?.response?.data?.error || t('admin:messages.homeAssistantFailed');
      setSaveMessage({ show: true, type: 'error', text });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  const testHomeAssistantConnection = async () => {
    setIsTestingHomeAssistant(true);
    setHomeAssistantTestResult(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/connections/homeassistant/test`);
      setHomeAssistantTestResult(response.data);

      // A working connection is the moment to offer the entity picker.
      if (response.data?.ok) {
        try {
          const entities = await axios.get(`${API_BASE_URL}/api/connections/homeassistant/weather-entities`);
          setHomeAssistantEntities(entities.data?.entities || []);
        } catch {
          setHomeAssistantEntities([]);
        }
      }
    } catch (error) {
      setHomeAssistantTestResult({
        ok: false,
        message: error?.response?.data?.error || t('admin:messages.homeAssistantFailed'),
      });
    } finally {
      setIsTestingHomeAssistant(false);
    }
  };

  const saveAllApiSettings = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'WEATHER_API_KEY', value: settings.WEATHER_API_KEY || '' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'WEATHER_PROVIDER', value: settings.WEATHER_PROVIDER || 'openweathermap' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'PROXY_WHITELIST', value: settings.PROXY_WHITELIST || '' })
      ]);
      // Clear the write-only field and re-read what the server now holds.
      setSettings((prev) => ({ ...prev, WEATHER_API_KEY: '' }));
      await fetchWeatherConnectionStatus();
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.allSettingsSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving API settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.someSettingsFailed') });
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
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.widgetNeedsTab') });
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

      await syncWidgetAssignments(API_DEVICE_URL, widgetAssignments, currentAssignments);

      if (onTabsChanged) {
        await onTabsChanged();
      }

      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.widgetSettingsSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving widget settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.widgetSettingsFailed') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const savePluginSettings = async () => {
    const missingEnabledPlugins = getMissingEnabledPluginAssignments(pluginSettings, pluginAssignments, uploadedWidgets);
    if (missingEnabledPlugins.length > 0) {
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.pluginNeedsTab') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
      return;
    }

    setIsLoading(true);
    try {
      await patchDeviceSettings({ pluginSettings });

      // Save declared (manifest) settings through the plugin platform API so
      // household-scoped values are shared across displays. Only keys the
      // user actually edited are written, failures are collected instead of
      // aborting the rest of the save, and the server's specific validation
      // message is surfaced.
      const manifestPlugins = uploadedWidgets.filter(
        (widget) => widget.pluginId && Array.isArray(widget.manifest?.settings) && widget.manifest.settings.length > 0
      );
      const declaredSettingsErrors = [];
      await Promise.all(manifestPlugins.map(async (widget) => {
        const dirtyKeys = pluginDeclaredDirty[widget.pluginId] || {};
        const declaredByKey = new Map(widget.manifest.settings.map((setting) => [setting.key, setting]));
        const values = Object.fromEntries(
          Object.entries(pluginDeclaredValues[widget.pluginId] || {}).filter(([key, value]) => {
            if (!dirtyKeys[key]) return false;
            if (value === null || value === undefined) return false;
            // A cleared number/select field means "no change"; an empty
            // string is a legitimate value for string settings.
            if (value === '' && declaredByKey.get(key)?.type !== 'string') return false;
            return true;
          })
        );
        if (Object.keys(values).length === 0) return;
        try {
          await axios.put(
            `${API_BASE_URL}/api/plugin/v1/settings/${widget.pluginId}?device=${encodeURIComponent(currentDeviceName)}`,
            values
          );
        } catch (error) {
          declaredSettingsErrors.push(`${widget.name}: ${error.response?.data?.error || error.message}`);
        }
      }));

      const currentResponse = await axios.get(`${API_DEVICE_URL}/widget-assignments`);
      const currentAssignments = Array.isArray(currentResponse.data) ? currentResponse.data : [];

      await syncWidgetAssignments(API_DEVICE_URL, pluginAssignments, currentAssignments);

      if (onTabsChanged) {
        await onTabsChanged();
      }

      if (onPluginsChanged) onPluginsChanged();
      if (declaredSettingsErrors.length > 0) {
        setSaveMessage({
          show: true,
          type: 'error',
          text: t('admin:messages.pluginOptionsRejected', { errors: declaredSettingsErrors.join('; ') }),
        });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 6000);
      } else {
        setPluginDeclaredDirty({});
        setSaveMessage({ show: true, type: 'success', text: t('admin:messages.pluginSettingsSaved') });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      }
    } catch (error) {
      console.error('Error saving plugin settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.pluginSettingsFailed') });
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
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.tabLabelRequired') });
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
      setSaveMessage({ show: true, type: 'success', text: tabIconModalState.mode === 'edit' ? t('admin:messages.tabUpdated') : t('admin:messages.tabCreated') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving tab:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.tabSaveFailed') });
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
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.tabDeleted') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error deleting tab:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.tabDeleteFailed') });
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
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.tabReorderFailed') });
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

      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.tabLabelVisibilityUpdated') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error updating tab label visibility:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.tabLabelVisibilityFailed') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // --- User display order (issue #134) ---
  // The bonus pseudo-user (id 0) is pinned and never reorderable, mirroring
  // how the Home tab is excluded from tab dragging.
  const reorderableUsers = users.filter((user) => user.id !== 0);

  const saveUserOrder = async (orderedUserIds) => {
    try {
      setIsLoading(true);
      await axios.patch(`${API_BASE_URL}/api/users/reorder`, { orderedUserIds });
      await fetchUsers();
      // The dashboard renders users in API order, so it needs to refetch too.
      window.dispatchEvent(new Event(USERS_UPDATED_EVENT));
    } catch (error) {
      console.error('Error reordering users:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.userReorderFailed') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Touch-friendly alternative to dragging: HTML5 drag events never fire on
  // phones or the wall tablet, so the arrows are the primary control there.
  const moveUser = async (userId, delta) => {
    const ids = reorderableUsers.map((user) => user.id);
    const from = ids.indexOf(userId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    await saveUserOrder(next);
  };

  const handleUserDragStart = (userId) => {
    setDraggingUserId(userId);
  };

  const handleUserDrop = async (targetUserId) => {
    if (draggingUserId == null || draggingUserId === targetUserId) {
      setDraggingUserId(null);
      return;
    }
    const ids = reorderableUsers.map((user) => user.id);
    const fromIndex = ids.indexOf(draggingUserId);
    const toIndex = ids.indexOf(targetUserId);
    setDraggingUserId(null);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...ids];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await saveUserOrder(next);
  };

  // Tabs are ordered by their number; tab 1 (Home) is fixed, so only the rest
  // participate. Same touch caveat as the user list — see moveTab below.
  const draggableTabsInOrder = () => tabs
    .filter((tab) => tab.number !== 1)
    .sort((a, b) => a.number - b.number);

  // Touch-friendly counterpart to dragging: HTML5 drag events never fire on
  // phones or the wall tablet, where this table is a stack of cards.
  const moveTab = async (tabNumber, delta) => {
    const numbers = draggableTabsInOrder().map((tab) => tab.number);
    const from = numbers.indexOf(tabNumber);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= numbers.length) return;
    const next = [...numbers];
    [next[from], next[to]] = [next[to], next[from]];
    await saveTabOrder(next);
  };

  const handleTabDragStart = (tabNumber) => {
    setDraggingTabNumber(tabNumber);
  };

  const handleTabDrop = async (targetTabNumber) => {
    if (draggingTabNumber == null || draggingTabNumber === targetTabNumber) {
      setDraggingTabNumber(null);
      return;
    }

    const draggableTabs = draggableTabsInOrder();

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

      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.deviceCopied') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error copying device settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.deviceCopyFailed') });
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
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.deviceRenamed') });
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
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.cannotDeleteCurrentDevice') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      setDeleteDeviceDialog({ open: false, device: null });
      return;
    }

    try {
      setIsLoading(true);
      await axios.delete(`${API_BASE_URL}/api/devices/${encodeURIComponent(deviceName)}`);
      setDeleteDeviceDialog({ open: false, device: null });
      await fetchDevices();
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.deviceDeleted') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error deleting device:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.deviceDeleteFailed') });
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

      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.colorsSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving accent colors:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.colorsFailed') });
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
    setSaveMessage({ show: true, type: 'info', text: t('admin:messages.colorsReset') });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
  };

  const saveScreensaverSettings = async () => {
    try {
      setIsLoading(true);
      const normalizedScreensaver = normalizeScreensaverSettings(screensaverSettings);
      localStorage.setItem(SCREENSAVER_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedScreensaver));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.screensaverSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving screensaver settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.screensaverFailed') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const saveVacationModeSettings = async () => {
    try {
      setIsLoading(true);
      const normalizedVacationMode = normalizeVacationModeSettings(vacationModeSettings);
      localStorage.setItem(VACATION_MODE_STORAGE_KEY, JSON.stringify(normalizedVacationMode));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      // Household-wide vacation state (issues #121/#72): the server pauses
      // missed-chore logging while active, and the metrics plugin bridges
      // streaks across vacation days. Display behavior (chime mute,
      // screensaver) stays per-display via localStorage above.
      try {
        await axios.post(`${API_BASE_URL}/api/settings`, {
          key: 'vacation_mode',
          value: JSON.stringify(normalizedVacationMode),
        });
      } catch (serverError) {
        console.warn('Vacation mode saved for this display, but the household setting could not be updated:', serverError);
      }
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.vacationSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving vacation mode settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.vacationFailed') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Geocoding runs on the server, which holds the API key. Passing no query
  // asks the server for the provider's own location, which is how a Home
  // Assistant household gets coordinates without an OpenWeatherMap key at all.
  const resolveAutoDarkModeLocation = async (locationQuery) => {
    const normalized = (locationQuery || '').trim();
    const response = await axios.get(`${API_BASE_URL}/api/weather/geocode`, {
      params: normalized ? { q: normalized } : {},
    });

    const { lat, lon, resolvedName } = response.data || {};
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      throw new Error('Location not found. Try a city, city/state, city/country, or ZIP code.');
    }

    return { lat, lon, resolvedName: resolvedName || normalized };
  };

  const saveAutoDarkModeSettings = async () => {
    const trimmedLocation = autoDarkModeSettings.locationQuery.trim();

    if (!autoDarkModeSettings.enabled) {
      const nextSettings = {
        ...autoDarkModeSettings,
        locationQuery: trimmedLocation,
      };
      localStorage.setItem(AUTO_DARK_MODE_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      setAutoDarkModeSettings(nextSettings);
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.autoDarkDisabled') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      return;
    }

    if (!trimmedLocation) {
      setSaveMessage({
        show: true,
        type: 'error',
        text: t('admin:messages.autoDarkNeedsLocation'),
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

      localStorage.setItem(AUTO_DARK_MODE_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      setAutoDarkModeSettings(nextSettings);
      setSaveMessage({
        show: true,
        type: 'success',
        text: t('admin:messages.autoDarkSaved'),
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

    // No API key needed any more — the server computes these from coordinates.
    if (!autoDarkModeSettings.resolvedName || !hasCoordinates) {
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
        const response = await axios.get(`${API_BASE_URL}/api/sun`, {
          params: {
            lat: autoDarkModeSettings.lat,
            lon: autoDarkModeSettings.lon,
          },
        });

        const { sunrise, sunset, alwaysUp, alwaysDown } = response?.data || {};

        if (typeof sunrise !== 'number' || typeof sunset !== 'number') {
          throw new Error(alwaysUp || alwaysDown
            ? 'The sun does not rise or set at this location today.'
            : 'Sunrise and sunset are unavailable for this location.');
        }

        if (!isCancelled) {
          // The times come back as unix seconds; the preview renders them in
          // the browser's own zone, which is the display the user is looking at.
          setAutoDarkModeSunTimes({ sunrise, sunset, timezoneOffset: 0 });
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error fetching auto dark mode sunrise/sunset:', error);
          setAutoDarkModeSunTimes({ sunrise: null, sunset: null, timezoneOffset: 0 });
          setAutoDarkModeSunTimesError(error.message || 'Unable to load today\'s sunrise and sunset.');
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
  }, [autoDarkModeSettings.resolvedName, autoDarkModeSettings.lat, autoDarkModeSettings.lon]);

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
      alert(t('admin:messages.userDeleteFailed'));
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
        // repeatable is stored as 0/1; the API expects a boolean.
        await axios.patch(`${API_BASE_URL}/api/prizes/${editingPrize.id}`, { ...editingPrize, repeatable: !!editingPrize.repeatable });
      } else {
        await axios.post(`${API_BASE_URL}/api/prizes`, { ...newPrize, repeatable: !!newPrize.repeatable });
        setNewPrize({ name: '', clam_cost: 0, repeatable: false });
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
    if (window.confirm(t('admin:confirm.deletePrize'))) {
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
      alert(t('admin:messages.widgetUploadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const deleteWidget = async (filename) => {
    if (window.confirm(t('admin:confirm.deleteWidget'))) {
      // Platform plugins own server-side storage/settings. Keeping them lets a
      // reinstall of the SAME plugin resume; purging prevents a different
      // plugin that claims the same id from inheriting the data.
      const widgetEntry = uploadedWidgets.find((widget) => widget.filename === filename);
      const purgeData = Boolean(widgetEntry?.pluginId) && window.confirm(
        t('admin:confirm.purgePluginData')
      );
      try {
        setIsLoading(true);
        await axios.delete(`${API_BASE_URL}/api/widgets/${filename}${purgeData ? '?purgeData=true' : ''}`);
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
      alert(t('admin:messages.widgetInstalled', { name: widget.name }));
    } catch (error) {
      console.error('Error installing GitHub widget:', error);
      alert(t('admin:messages.widgetInstallFailed'));
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
    if (window.confirm(t('admin:confirm.deleteSchedule'))) {
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
        alert(t('admin:messages.scheduleDeleteFailed'));
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
      console.log(t('admin:messages.uploadingPicture'));

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
      alert(t('admin:messages.pictureUploadFailed'));
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const fetchDefaultAvatars = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/avatars/defaults`);
      setDefaultAvatars(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching default avatars:', error);
      setDefaultAvatars([]);
    }
  };

  const chooseDefaultAvatar = async (filename) => {
    if (avatarPicker.userId === null) {
      // Add-user form: carried in the create payload.
      setNewUser((prev) => ({ ...prev, profile_picture: filename }));
      setAvatarPicker({ open: false, userId: null });
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/api/users/${avatarPicker.userId}/avatar`, { filename });
      setAvatarPicker({ open: false, userId: null });
      await fetchUsers();
    } catch (error) {
      console.error('Error setting default avatar:', error);
      alert(error?.response?.data?.error || 'Failed to set the avatar.');
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
        setSaveMessage({ show: true, type: 'success', text: t('admin:messages.pinSet') });
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
    setPinModal({ open: true, mode: 'set', title: t('admin:pin.update') });
  };

  const handleClearPin = async () => {
    if (!window.confirm(t('admin:confirm.removePin'))) {
      return;
    }
    try {
      setIsLoading(true);
      await axios.delete(`${API_BASE_URL}/api/admin-pin`);
      setPinExists(false);
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.pinRemoved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
    } catch (error) {
      console.error('Error clearing PIN:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.pinRemoveFailed') });
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
    return option ? option.label : t('admin:refresh.disabled');
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
                <Tab label={t('admin:subTabs.widgets')} />
                <Tab label={t('admin:subTabs.plugins')} />
                <Tab label={t('admin:subTabs.tabs')} />
                <Tab label={t('admin:subTabs.devices')} />
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
                  {t('admin:widgets.help')}
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
                          label={t('common:labels.enabled')}
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6 }}>
                        <RefreshIntervalSelect
                          labelId={`${widget}-refresh-label`}
                          value={config.refreshInterval}
                          onChange={(value) => handleRefreshIntervalChange(widget, value)}
                          options={refreshIntervalOptions}
                        />
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
                            label={t('admin:widgets.showOnTabs')}
                            required={Boolean(config.enabled)}
                            error={hasRequiredTabsError}
                            placeholder={t('admin:widgets.selectTabs')}
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
                    {t('admin:widgets.weatherWidget')}
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
                        label={t('common:labels.enabled')}
                      />
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                      <RefreshIntervalSelect
                        labelId="weather-refresh-label"
                        value={widgetSettings.weather?.refreshInterval}
                        onChange={(value) => handleRefreshIntervalChange('weather', value)}
                        options={refreshIntervalOptions}
                      />
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
                          label={t('admin:widgets.showOnTabs')}
                          required={Boolean(widgetSettings.weather?.enabled)}
                          error={weatherHasRequiredTabsError}
                          placeholder={t('admin:widgets.selectTabs')}
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
                  {t('admin:widgets.saveSettings')}
                </Button>
              </Box>
            )}

            {widgetsSubTab === 1 && (
              <>
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle1" gutterBottom>{t('admin:widgets.uploadCustom')}</Typography>
                    <Button
                      variant="contained"
                      component="label"
                      startIcon={<Upload />}
                      fullWidth
                      sx={{ mb: 2 }}
                    >
                      {t('admin:widgets.uploadHtml')}
                      <input
                        type="file"
                        hidden
                        accept=".html"
                        onChange={handleWidgetUpload}
                      />
                    </Button>

                    <Typography variant="subtitle1" gutterBottom>{t('admin:widgets.uploaded')}</Typography>
                    <List>
                      {uploadedWidgets.map((widget) => (
                        <ListItem key={widget.filename} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                          <ListItemText
                            primary={widget.name}
                            secondary={t('admin:widgets.fileName', { filename: widget.filename })}
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
                      <Typography variant="subtitle1">{t('admin:widgets.githubRepo')}</Typography>
                      <Button
                        onClick={fetchGithubWidgets}
                        startIcon={loadingGithub ? <CircularProgress size={16} /> : <Refresh />}
                        disabled={loadingGithub}
                        variant="contained"
                        color="primary"
                      >
                        {t('admin:widgets.refreshAvailable')}
                      </Button>
                    </Box>

                    <Alert severity="info" sx={{ mb: 2 }}>
                      Browse and contribute plugins at{' '}
                      <a
                        href="https://github.com/jherforth/HomeGlowPlugins"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 'bold' }}
                      >
                        github.com/jherforth/HomeGlowPlugins
                        <OpenInNew sx={{ fontSize: '0.875rem', ml: 0.25, verticalAlign: 'middle' }} />
                      </a>
                    </Alert>

                    {githubWidgets.length === 0 && !loadingGithub && (
                      <Alert severity="info" sx={{ mb: 2 }} icon={<Refresh />}>
                        {t('admin:widgets.clickThe')} <strong>{t('admin:widgets.refreshAvailable')}</strong> {t('admin:widgets.buttonAboveToLoad')}
                      </Alert>
                    )}

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
                              {t('admin:widgets.install')}
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
                    <Typography variant="h6" gutterBottom>{t('admin:plugins.settings')}</Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      {t('admin:plugins.settingsHelp')}
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
                                label={t('common:labels.enabled')}
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
                                label={t('admin:plugins.transparentBackground')}
                                sx={{ ml: 2 }}
                              />
                            </Grid>

                            <Grid size={{ xs: 12, sm: 6 }}>
                              <RefreshIntervalSelect
                                labelId={`plugin-${plugin.filename}-refresh-label`}
                                value={pSettings.refreshInterval}
                                onChange={(value) => {
                                  setPluginSettings(prev => ({
                                    ...prev,
                                    [plugin.filename]: { ...prev[plugin.filename], refreshInterval: value }
                                  }));
                                }}
                                options={refreshIntervalOptions}
                              />
                            </Grid>
                          </Grid>

                          {plugin.pluginId && Array.isArray(plugin.manifest?.settings) && plugin.manifest.settings.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('admin:plugins.options')}</Typography>
                              <Grid container spacing={2}>
                                {plugin.manifest.settings.map((setting) => {
                                  const declaredValues = pluginDeclaredValues[plugin.pluginId] || {};
                                  const value = declaredValues[setting.key];
                                  const setValue = (next) => {
                                    setPluginDeclaredValues((prev) => ({
                                      ...prev,
                                      [plugin.pluginId]: { ...prev[plugin.pluginId], [setting.key]: next },
                                    }));
                                    setPluginDeclaredDirty((prev) => ({
                                      ...prev,
                                      [plugin.pluginId]: { ...prev[plugin.pluginId], [setting.key]: true },
                                    }));
                                  };
                                  const label = setting.label || setting.key;
                                  const controlId = `plugin-${plugin.pluginId}-${setting.key}`;
                                  return (
                                    <Grid size={{ xs: 12, sm: 6 }} key={setting.key}>
                                      {setting.type === 'boolean' ? (
                                        <FormControlLabel
                                          control={
                                            <Switch
                                              checked={Boolean(value)}
                                              onChange={() => setValue(!value)}
                                            />
                                          }
                                          label={label}
                                        />
                                      ) : setting.type === 'select' ? (
                                        <FormControl fullWidth size="small">
                                          <InputLabel id={`${controlId}-label`}>{label}</InputLabel>
                                          <Select
                                            labelId={`${controlId}-label`}
                                            label={label}
                                            value={value ?? ''}
                                            onChange={(event) => setValue(event.target.value)}
                                          >
                                            {(setting.options || []).map((option) => (
                                              <MenuItem key={option} value={option}>{option}</MenuItem>
                                            ))}
                                          </Select>
                                        </FormControl>
                                      ) : setting.type === 'number' ? (
                                        <TextField
                                          fullWidth
                                          size="small"
                                          type="number"
                                          label={label}
                                          value={value ?? ''}
                                          inputProps={{ min: setting.min, max: setting.max }}
                                          onChange={(event) => {
                                            const parsed = Number(event.target.value);
                                            setValue(event.target.value === '' || Number.isNaN(parsed) ? '' : parsed);
                                          }}
                                        />
                                      ) : (
                                        <TextField
                                          fullWidth
                                          size="small"
                                          label={label}
                                          value={value ?? ''}
                                          onChange={(event) => setValue(event.target.value)}
                                        />
                                      )}
                                      {setting.scope === 'device' && (
                                        <Typography variant="caption" color="text.secondary">
                                          {t('admin:plugins.perDevice')}
                                        </Typography>
                                      )}
                                    </Grid>
                                  );
                                })}
                              </Grid>
                            </Box>
                          )}

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
                                  label={t('admin:widgets.showOnTabs')}
                                  required={Boolean(pSettings.enabled)}
                                  error={hasRequiredTabsError}
                                  placeholder={t('admin:widgets.selectTabs')}
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
                      {t('admin:plugins.saveSettings')}
                    </Button>
                  </Box>
                )}
              </>
            )}

            {widgetsSubTab === 2 && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Alert severity="info" sx={{ mb: 0, flex: 1, mr: 2 }}>
                    {t('admin:tabs.manageHelp')}
                  </Alert>
                  <Button variant="contained" startIcon={<Add />} onClick={openCreateTabDialog}>
                    {t('admin:tabs.addTab')}
                  </Button>
                </Box>

                <TableContainer component={Paper}>
                  <Table sx={stackableTableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell width={150}>{t('admin:tabs.order')}</TableCell>
                        <TableCell>{t('admin:tabs.label')}</TableCell>
                        <TableCell>{t('admin:tabs.icon')}</TableCell>
                        <TableCell>{t('admin:tabs.showLabel')}</TableCell>
                        <TableCell width={120}>{t('common:labels.actions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...tabs].sort((a, b) => a.number - b.number).map((tab) => {
                        const isHome = tab.number === 1;
                        const orderIndex = draggableTabsInOrder().findIndex((t) => t.number === tab.number);
                        const lastOrderIndex = draggableTabsInOrder().length - 1;
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
                            <TableCell data-label={t('admin:tabs.order')}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {!isHome && (
                                  <DragIndicator fontSize="small" sx={{ opacity: 0.5, display: { xs: 'none', sm: 'block' } }} />
                                )}
                                <Chip label={tab.number} size="small" sx={{ mr: 0.5 }} />
                                {!isHome && (
                                  <>
                                    <Tooltip title={t('admin:tabs.moveUpNamed', { name: tab.label || t('admin:tabs.label') })}>
                                      <span>
                                        <IconButton
                                          size="small"
                                          aria-label={t('admin:tabs.moveTabUp')}
                                          disabled={orderIndex <= 0}
                                          onClick={() => moveTab(tab.number, -1)}
                                        >
                                          <ArrowUpward fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title={t('admin:tabs.moveDownNamed', { name: tab.label || t('admin:tabs.label') })}>
                                      <span>
                                        <IconButton
                                          size="small"
                                          aria-label={t('admin:tabs.moveTabDown')}
                                          disabled={orderIndex === -1 || orderIndex >= lastOrderIndex}
                                          onClick={() => moveTab(tab.number, 1)}
                                        >
                                          <ArrowDownward fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell data-label={t('admin:tabs.label')}>
                              {tab.label}
                              {isHome && (
                                <Chip size="small" label={t('admin:tabs.home')} color="primary" sx={{ ml: 1 }} />
                              )}
                            </TableCell>
                            <TableCell data-label={t('admin:tabs.icon')}>
                              <Chip size="small" label={tab.icon} />
                            </TableCell>
                            <TableCell data-label={t('admin:tabs.showLabel')}>
                              <Switch
                                checked={Boolean(tab.show_label)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleTabShowLabel(tab)}
                                disabled={isLoading}
                                slotProps={{ input: { 'aria-label': t('admin:tabs.toggleShowLabel', { name: tab.label }) } }}
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
                  {t('admin:devices.manageHelp')}
                </Alert>

                <Box sx={{ mb: 2, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {t('admin:devices.currentName')}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={t('admin:devices.current')} color="primary" size="small" />
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {currentDeviceName}
                    </Typography>
                  </Box>
                </Box>

                <TableContainer component={Paper}>
                  <Table sx={stackableTableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('common:labels.name')}</TableCell>
                        <TableCell>{t('admin:devices.lastUpdated')}</TableCell>
                        <TableCell>{t('admin:subTabs.widgets')}</TableCell>
                        <TableCell width={120}>{t('common:labels.actions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {devices.map((device) => {
                        const isCurrent = device.name === currentDeviceName;
                        return (
                          <TableRow key={device.name}>
                            <TableCell data-label={t('common:labels.name')}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                {isCurrent && <Chip label={t('admin:devices.current')} color="primary" size="small" />}
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {device.name}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell data-label={t('admin:devices.lastUpdated')}>
                              {device.updateTime ? new Date(device.updateTime).toLocaleString() : 'Unknown'}
                            </TableCell>
                            <TableCell data-label={t('admin:subTabs.widgets')}>
                              <Chip label={Number(device.widgets) || 0} size="small" />
                            </TableCell>
                            <TableCell>
                              {isCurrent ? (
                                <IconButton
                                  onClick={openRenameDeviceDialog}
                                  color="primary"
                                  size="small"
                                  title={t('admin:devices.renameCurrent')}
                                >
                                  <Edit />
                                </IconButton>
                              ) : (
                                <IconButton
                                  onClick={() => openCopyDeviceDialog(device)}
                                  color="primary"
                                  size="small"
                                  title={t('admin:devices.copyToCurrent')}
                                >
                                  <ContentCopy />
                                </IconButton>
                              )}
                              <IconButton
                                onClick={() => openDeleteDeviceDialog(device)}
                                color="error"
                                size="small"
                                title={t('admin:devices.deleteDevice')}
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
            {/* Language (issue #137), per display like the other interface
                settings. Week start deliberately lives in the calendar
                widget's own settings, which has had per-tab week/month start
                controls since #127 — a second global control would fight it. */}
            <AdminFormSection
              title={t('admin:interface.languageSection')}
              subtitle={t('admin:interface.languageSubtitle')}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>{t('common:language.label')}</InputLabel>
                    <Select
                      value={i18n.language?.split('-')[0] || 'en'}
                      label={t('common:language.label')}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                    >
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <MenuItem key={lang.code} value={lang.code}>
                          {lang.endonym}
                        </MenuItem>
                      ))}
                    </Select>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {t('common:language.helper')}
                    </Typography>
                  </FormControl>
                </Grid>
              </Grid>
            </AdminFormSection>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">{t('admin:colors.heading')}</Typography>
              <Button
                variant="outlined"
                startIcon={<RestartAlt />}
                onClick={resetToDefaults}
                size="small"
              >
                {t('admin:colors.resetDefaults')}
              </Button>
            </Box>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Alert severity="info" sx={{ mb: 3 }}>
              {t('admin:colors.help')}
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
                {t('admin:colors.save')}
              </Button>
              <Button
                variant="outlined"
                onClick={() => window.location.reload()}
                startIcon={<Refresh />}
                size="large"
              >
                {t('admin:colors.refreshPage')}
              </Button>
            </Box>

            <Divider sx={{ my: 4 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
              <Nightlight />
              <Typography variant="h6">{t('admin:screensaver.heading')}</Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              {t('admin:screensaver.help')}
            </Alert>

            <Box sx={{ maxWidth: 600, mx: 'auto' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={screensaverSettings.enabled}
                    onChange={(e) => setScreensaverSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                }
                label={t('admin:screensaver.enable')}
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                {t('admin:screensaver.mode')}
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
                            {t('admin:screensaver.cycleTabs')}
                          </Typography>
                          <Typography
                            variant="caption"
                            color={!hasTabsCreated ? 'text.disabled' : 'text.secondary'}
                          >
                            {hasTabsCreated
                              ? t('admin:screensaver.cycleTabsHelp', { count: tabs.length })
                              : 'No tabs created yet'}
                          </Typography>
                        </Box>
                        {!hasTabsCreated && (
                          <Tooltip title={t('admin:screensaver.cycleTabsDisabled')}>
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
                            {t('admin:screensaver.immichSlideshow')}
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
                          <Tooltip title={t('admin:screensaver.immichDisabled')}>
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
                <ScreensaverIntervalSlider
                  label={t('admin:screensaver.photoInterval')}
                  value={screensaverSettings.slideshowInterval}
                  onChange={(value) => setScreensaverSettings(prev => ({ ...prev, slideshowInterval: value }))}
                  min={3}
                  max={60}
                  marks={[
                    { value: 3, label: '3s' },
                    { value: 10, label: '10s' },
                    { value: 30, label: '30s' },
                    { value: 60, label: '60s' }
                  ]}
                />
              )}

              {screensaverSettings.mode === 'tabs' && (
                <ScreensaverIntervalSlider
                  label={t('admin:screensaver.tabInterval')}
                  value={screensaverSettings.slideshowInterval}
                  onChange={(value) => setScreensaverSettings(prev => ({ ...prev, slideshowInterval: value }))}
                  min={5}
                  max={120}
                  marks={[
                    { value: 5, label: '5s' },
                    { value: 30, label: '30s' },
                    { value: 60, label: '60s' },
                    { value: 120, label: '2m' }
                  ]}
                />
              )}

              <Button
                variant="contained"
                onClick={saveScreensaverSettings}
                startIcon={<Save />}
                fullWidth
                sx={{ mt: 2 }}
              >
                {t('admin:screensaver.save')}
              </Button>

              <Divider sx={{ my: 4 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <BeachAccess />
                <Typography variant="h6">{t('admin:vacation.heading')}</Typography>
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                {t('admin:vacation.help')}
                fun vacation animation. Settings apply to this display and persist until you turn
                vacation mode off.
              </Alert>

              <FormControlLabel
                control={
                  <Switch
                    checked={vacationModeSettings.enabled}
                    onChange={(e) => setVacationModeSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                }
                label={t('admin:vacation.enable')}
                sx={{ mb: 1, display: 'block' }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={vacationModeSettings.muteSounds}
                    disabled={!vacationModeSettings.enabled}
                    onChange={(e) => setVacationModeSettings(prev => ({ ...prev, muteSounds: e.target.checked }))}
                  />
                }
                label={t('admin:vacation.muteSounds')}
                sx={{ mb: 1, display: 'block' }}
              />

              {vacationModeSettings.enabled && (
                <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                  <TextField
                    size="small"
                    type="date"
                    label={t('admin:vacation.startDate')}
                    value={vacationModeSettings.startDate || ''}
                    onChange={(e) => setVacationModeSettings(prev => ({ ...prev, startDate: e.target.value }))}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    type="date"
                    label={t('admin:vacation.endDate')}
                    value={vacationModeSettings.endDate || ''}
                    onChange={(e) => setVacationModeSettings(prev => ({ ...prev, endDate: e.target.value }))}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ flex: 1 }}
                  />
                </Box>
              )}
              {vacationModeSettings.enabled && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('admin:vacation.dateHelp')}
                  for those days, and streaks bridge across them permanently. Without dates, vacation
                  stays on until you turn it off.
                </Typography>
              )}

              <Button
                variant="contained"
                onClick={saveVacationModeSettings}
                startIcon={<Save />}
                fullWidth
                sx={{ mt: 2 }}
              >
                {t('admin:vacation.save')}
              </Button>

              <Divider sx={{ my: 4 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Nightlight />
                <Typography variant="h6">{t('admin:autoDark.heading')}</Typography>
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                {t('admin:autoDark.help')}
              </Alert>

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
                label={t('admin:autoDark.enable')}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label={t('admin:autoDark.location')}
                value={autoDarkModeSettings.locationQuery}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setAutoDarkModeSettings(prev => ({
                    ...prev,
                    locationQuery: nextValue,
                  }));
                }}
                helperText={t('admin:autoDark.locationHelp')}
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
                        {t('admin:autoDark.loadingSun')}
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
            <AdminFormSection title={t('admin:users.management')} subtitle={t('admin:users.addNew')}>
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
                      label={t('admin:users.username')}
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label={t('admin:users.email')}
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
                      {t('admin:users.addUser')}
                    </Button>
                  </Grid>
                  <Grid size={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {newUser.profile_picture ? (
                        <img
                          src={`${API_BASE_URL}/Uploads/users/${newUser.profile_picture}`}
                          alt={t('admin:users.chosenAvatar')}
                          style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--accent)' }}
                        />
                      ) : (
                        <Avatar sx={{ width: 40, height: 40, bgcolor: 'var(--card-border)' }}>?</Avatar>
                      )}
                      <Button size="small" variant="outlined" onClick={() => setAvatarPicker({ open: true, userId: null })}>
                        {t('admin:users.chooseAvatar')}
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        {t('admin:users.avatarHelp')}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </AdminFormSection>

            <TableContainer component={Paper}>
              <Table sx={stackableTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell width={110}>{t('admin:tabs.order')}</TableCell>
                    <TableCell>{t('admin:users.avatar')}</TableCell>
                    <TableCell>{t('admin:users.username')}</TableCell>
                    <TableCell>{t('admin:users.email')}</TableCell>
                    <TableCell>{t('admin:users.clamTotal')}</TableCell>
                    <TableCell>{t('admin:users.chores')}</TableCell>
                    <TableCell>{t('common:labels.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => {
                    // Display order (issue #134). Drag works on desktop only —
                    // HTML5 drag events never fire on touch — so the arrows
                    // carry the feature on phones and the wall tablet.
                    const isBonus = user.id === 0;
                    const orderIndex = reorderableUsers.findIndex((u) => u.id === user.id);
                    return (
                    <TableRow
                      key={user.id}
                      draggable={!isBonus}
                      onDragStart={() => handleUserDragStart(user.id)}
                      onDragOver={(e) => {
                        if (!isBonus) e.preventDefault();
                      }}
                      onDrop={() => {
                        if (!isBonus) handleUserDrop(user.id);
                      }}
                      sx={{
                        cursor: isBonus ? 'default' : 'grab',
                        opacity: draggingUserId === user.id ? 0.65 : 1,
                      }}
                    >
                      <TableCell data-label={t('admin:tabs.order')}>
                        {isBonus ? (
                          <Chip size="small" label={t('admin:users.pinned')} />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <DragIndicator fontSize="small" sx={{ opacity: 0.5, display: { xs: 'none', sm: 'block' } }} />
                            {/* The span is required so the tooltip still works
                                on a disabled button; the aria-label has to go
                                on the button itself, since the wrapper would
                                otherwise swallow the accessible name. */}
                            <Tooltip title={t('admin:users.moveUpNamed', { name: user.username })}>
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={t('common:actions.moveUp')}
                                  disabled={orderIndex <= 0}
                                  onClick={() => moveUser(user.id, -1)}
                                >
                                  <ArrowUpward fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={t('admin:users.moveDownNamed', { name: user.username })}>
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={t('common:actions.moveDown')}
                                  disabled={orderIndex === -1 || orderIndex >= reorderableUsers.length - 1}
                                  onClick={() => moveUser(user.id, 1)}
                                >
                                  <ArrowDownward fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <UserAvatar key={`${user.id}-${user.profile_picture}`} user={user} />
                          <Button
                            component="label"
                            size="small"
                            variant="outlined"
                          >
                            {t('common:actions.upload')}
                            <input
                              type="file"
                              hidden
                              accept="image/*"
                              onChange={(e) => handleProfilePictureUpload(user.id, e)}
                            />
                          </Button>
                          <Tooltip title={t('admin:users.pickBuiltIn')}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setAvatarPicker({ open: true, userId: user.id })}
                            >
                              {t('common:actions.choose')}
                            </Button>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell data-label={t('admin:users.username')}>
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
                      <TableCell data-label={t('admin:users.email')} sx={{ '@media (max-width:599.95px)': { wordBreak: 'break-all' } }}>
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
                      <TableCell data-label={t('admin:users.clamTotal')}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={`${user.clam_total || 0} 🥟`}
                            color="primary"
                            size="small"
                          />
                          <Tooltip title={t('admin:users.editClams')}>
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
                      <TableCell data-label={t('admin:users.chores')}>
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
                    );
                  })}
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

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs
                value={choresSubTab}
                onChange={(_, v) => setChoresSubTab(v)}
                size="small"
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
              >
                <Tab label={t('admin:users.chores')} />
                <Tab label={t('admin:chores.history')} />
                <Tab label={t('admin:chores.settings')} />
              </Tabs>
            </Box>
            {choresSubTab === 0 && (
              <ChoreSchedulesTab saveMessage={saveMessage} setSaveMessage={setSaveMessage} />
            )}
            {choresSubTab === 1 && (
              <ChoreHistoryTab />
            )}
            {choresSubTab === 2 && (
              <>
            <Box sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
                {t('admin:chores.rewards')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { sm: 'flex-start' } }}>
                <TextField
                  label={t('admin:chores.dailyReward')}
                  type="number"
                  value={settings.daily_completion_clam_reward || '2'}
                  onChange={(e) => setSettings(prev => ({ ...prev, daily_completion_clam_reward: e.target.value }))}
                  helperText={t('admin:chores.dailyRewardHelp')}
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
                  {isLoading ? t('common:state.saving') : t('common:actions.save')}
                </Button>
              </Box>

              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Switch
                    checked={settings.CHORE_CELEBRATION_ENABLED !== 'false' && settings.CHORE_CELEBRATION_ENABLED !== false}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      CHORE_CELEBRATION_ENABLED: e.target.checked ? 'true' : 'false',
                    }))}
                  />
                }
                label={t('admin:chores.celebrationEnable')}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {t('admin:chores.celebrationHelp')}
              </Typography>
            </Box>

            <Box sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
                {t('admin:chores.soundsHeading')}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.CHORE_SOUND_ENABLED === 'true' || settings.CHORE_SOUND_ENABLED === true}
                    onChange={(e) => setSettings(prev => ({ ...prev, CHORE_SOUND_ENABLED: e.target.checked ? 'true' : 'false' }))}
                  />
                }
                label={t('admin:chores.soundsEnable')}
              />
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, alignItems: { sm: 'flex-start' }, mt: 1 }}>
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {t('admin:chores.defaultSoundHelp')}
                  </Typography>
                  <SoundPicker
                    label={t('admin:chores.defaultSound')}
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
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prizes Tab */}
      {activeTab === 4 && (
        <Card>
          <CardContent>
            <AdminFormSection title={t('admin:prizes.management')} subtitle={t('admin:prizes.addNew')}>
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
                      label={t('admin:prizes.name')}
                      value={newPrize.name}
                      onChange={(e) => setNewPrize({ ...newPrize, name: e.target.value })}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <TextField
                      fullWidth
                      label={t('admin:prizes.cost')}
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
                      {t('admin:prizes.add')}
                    </Button>
                  </Grid>
                  <Grid size={12}>
                    <Tooltip title={t('admin:prizes.repeatableTooltip')}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={!!newPrize.repeatable}
                            onChange={(e) => setNewPrize({ ...newPrize, repeatable: e.target.checked })}
                          />
                        }
                        label={t('admin:prizes.repeatableLabel')}
                      />
                    </Tooltip>
                  </Grid>
                </Grid>
              </Box>
            </AdminFormSection>

            <List>
              {prizes.map((prize) => (
                <ListItem key={prize.id} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                  {editingPrize?.id === prize.id ? (
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, width: '100%', alignItems: { xs: 'stretch', sm: 'center' } }}>
                      <TextField
                        label={t('admin:prizes.name')}
                        value={editingPrize.name}
                        onChange={(e) => setEditingPrize({ ...editingPrize, name: e.target.value })}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label={t('admin:prizes.cost')}
                        type="number"
                        value={editingPrize.clam_cost}
                        onChange={(e) => setEditingPrize({ ...editingPrize, clam_cost: parseInt(e.target.value) || 0 })}
                        sx={{ width: { xs: '100%', sm: 120 } }}
                      />
                      <Tooltip title={t('admin:prizes.repeatableShortTooltip')}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={!!editingPrize.repeatable}
                              onChange={(e) => setEditingPrize({ ...editingPrize, repeatable: e.target.checked })}
                            />
                          }
                          label={t('admin:prizes.repeatableShort')}
                          sx={{ mr: 0 }}
                        />
                      </Tooltip>
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
                        secondary={prize.repeatable
                          ? t('admin:prizes.costLineRepeatable', { cost: prize.clam_cost })
                          : t('admin:prizes.costLine', { cost: prize.clam_cost })}
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title={prize.repeatable ? 'Add to store (stays on the shelf after each redemption)' : 'Add to store (one-time redeemable offer)'}>
                          <IconButton onClick={() => addPrizeToStore(prize.id)} color="primary">
                            <Add />
                          </IconButton>
                        </Tooltip>
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

            <AdminFormSection
              title={t('admin:prizes.store')}
              subtitle={t('admin:prizes.storeHelp')}
            >
              {prizeOffers.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  {t('admin:prizes.storeEmpty')}
                </Typography>
              ) : (
                <List>
                  {prizeOffers.map((offer) => (
                    <ListItem key={offer.id} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                      <ListItemText
                        primary={`${offer.name} — ${offer.clam_cost} 🥟${offer.repeatable ? ' · 🔁' : ''}`}
                        secondary={
                          offer.status === 'requested'
                            ? t('admin:prizes.requestedBy', { name: offer.requested_by_name || t('common:state.none') })
                            : 'On the shelf'
                        }
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title={offer.status === 'requested' ? 'Decline request and remove from store' : 'Remove from store'}>
                          <IconButton onClick={() => removePrizeOffer(offer.id)} color="error">
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </AdminFormSection>
          </CardContent>
        </Card>
      )}

      {/* Security Tab */}
      {activeTab === 5 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>{t('admin:security.heading')}</Typography>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Alert severity="info" sx={{ mb: 3 }}>
              {t('admin:security.help')}
            </Alert>

            <Box sx={{ p: 3, border: '2px solid var(--accent)', borderRadius: 2, backgroundColor: 'rgba(158, 127, 255, 0.05)' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Lock />
                {t('admin:security.pinProtection')}
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
                      {t('admin:security.requirements')}
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
                      {t('admin:security.currentStatus')}
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
                  {pinExists ? t('admin:pin.update') : t('admin:pin.setPin')}
                </Button>
                {pinExists && (
                  <Button
                    variant="outlined"
                    onClick={handleClearPin}
                    color="error"
                    fullWidth
                    sx={{ py: 1, fontWeight: 'bold' }}
                  >
                    {t('admin:security.removePin')}
                  </Button>
                )}
              </Box>

              {pinExists && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {t('admin:security.changeNote')}
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
            <Typography variant="h6" gutterBottom>{t('admin:connections.heading')}</Typography>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Box sx={{ maxWidth: 700 }}>
              <Typography variant="subtitle1" sx={{ mt: 1, mb: 1.5, fontWeight: 600 }}>
                {t('admin:connections.weatherHeading')}
              </Typography>

              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveAllApiSettings();
                }}
              >
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel id="weather-provider-label">{t('admin:connections.weatherProvider')}</InputLabel>
                  <Select
                    labelId="weather-provider-label"
                    label={t('admin:connections.weatherProvider')}
                    value={settings.WEATHER_PROVIDER || 'openweathermap'}
                    onChange={(e) => setSettings(prev => ({ ...prev, WEATHER_PROVIDER: e.target.value }))}
                  >
                    <MenuItem value="openweathermap">{t('admin:connections.providerOpenWeather')}</MenuItem>
                    <MenuItem value="homeassistant">{t('admin:connections.providerHomeAssistant')}</MenuItem>
                  </Select>
                </FormControl>

                {weatherProviderStatus && !weatherProviderStatus.configured && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    {weatherProviderStatus.reason}
                  </Alert>
                )}

                {/* The key field is write-only: the server redacts it, so this
                    shows whether one is stored and accepts a replacement. */}
                {settings.WEATHER_PROVIDER !== 'homeassistant' && (
                  <TextField
                    fullWidth
                    label={t('admin:connections.openWeatherKey')}
                    type="password"
                    value={settings.WEATHER_API_KEY || ''}
                    onChange={(e) => setSettings(prev => ({ ...prev, WEATHER_API_KEY: e.target.value }))}
                    sx={{ mb: 2 }}
                    placeholder={weatherProviderStatus?.has_api_key ? t('admin:connections.keyStored') : ''}
                    helperText={
                      weatherProviderStatus?.has_api_key
                        ? t('admin:connections.openWeatherStoredHelp')
                        : t('admin:connections.openWeatherHelp')
                    }
                  />
                )}

                <TextField
                  fullWidth
                  label={t('admin:connections.proxyWhitelist')}
                  value={settings.PROXY_WHITELIST || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, PROXY_WHITELIST: e.target.value }))}
                  sx={{ mb: 2 }}
                  helperText={t('admin:connections.proxyHelp')}
                />

                <Button
                  type="submit"
                  variant="contained"
                  disabled={isLoading}
                  startIcon={<Save />}
                  sx={{ mt: 1, mb: 4 }}
                >
                  {isLoading ? t('common:state.saving') : t('admin:connections.saveApiKeys')}
                </Button>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Home Assistant (issue #57) */}
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1.5, fontWeight: 600 }}>
                {t('admin:connections.homeAssistantHeading')}
              </Typography>

              <Alert severity="info" sx={{ mb: 2 }}>
                {t('admin:connections.homeAssistantHelp')}
              </Alert>

              {homeAssistantStatus && !homeAssistantStatus.encryption?.configured && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {t('admin:connections.encryptionRequired')}
                </Alert>
              )}

              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveHomeAssistantConnection();
                }}
              >
                <TextField
                  fullWidth
                  label={t('admin:connections.homeAssistantUrl')}
                  value={homeAssistantDraft.url}
                  onChange={(e) => setHomeAssistantDraft(prev => ({ ...prev, url: e.target.value }))}
                  sx={{ mb: 2 }}
                  placeholder="http://homeassistant.local:8123"
                  helperText={t('admin:connections.homeAssistantUrlHelp')}
                />

                <TextField
                  fullWidth
                  label={t('admin:connections.homeAssistantToken')}
                  type="password"
                  value={homeAssistantDraft.token}
                  onChange={(e) => setHomeAssistantDraft(prev => ({ ...prev, token: e.target.value }))}
                  sx={{ mb: 2 }}
                  placeholder={homeAssistantStatus?.has_token ? t('admin:connections.tokenStored') : ''}
                  helperText={
                    homeAssistantStatus?.has_token
                      ? t('admin:connections.homeAssistantTokenStoredHelp')
                      : t('admin:connections.homeAssistantTokenHelp')
                  }
                />

                {/* Populated by Test Connection, so the entity id can be picked
                    rather than remembered. */}
                {homeAssistantEntities.length > 0 ? (
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel id="ha-weather-entity-label">{t('admin:connections.homeAssistantEntity')}</InputLabel>
                    <Select
                      labelId="ha-weather-entity-label"
                      label={t('admin:connections.homeAssistantEntity')}
                      value={homeAssistantDraft.weather_entity || ''}
                      onChange={(e) => setHomeAssistantDraft(prev => ({ ...prev, weather_entity: e.target.value }))}
                    >
                      {homeAssistantEntities.map((entity) => (
                        <MenuItem key={entity.entity_id} value={entity.entity_id}>
                          {entity.name} ({entity.entity_id})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <TextField
                    fullWidth
                    label={t('admin:connections.homeAssistantEntity')}
                    value={homeAssistantDraft.weather_entity}
                    onChange={(e) => setHomeAssistantDraft(prev => ({ ...prev, weather_entity: e.target.value }))}
                    sx={{ mb: 2 }}
                    placeholder="weather.home"
                    helperText={t('admin:connections.homeAssistantEntityHelp')}
                  />
                )}

                {homeAssistantTestResult && (
                  <Alert severity={homeAssistantTestResult.ok ? 'success' : 'error'} sx={{ mb: 2 }}>
                    {homeAssistantTestResult.message}
                    {homeAssistantTestResult.version ? ` (${homeAssistantTestResult.version})` : ''}
                  </Alert>
                )}

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, mb: 2 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isLoading}
                    startIcon={<Save />}
                  >
                    {isLoading ? t('common:state.saving') : t('admin:connections.saveHomeAssistant')}
                  </Button>
                  <Button
                    type="button"
                    variant="outlined"
                    disabled={isTestingHomeAssistant || !homeAssistantStatus?.has_token}
                    onClick={testHomeAssistantConnection}
                  >
                    {isTestingHomeAssistant
                      ? t('admin:connections.testing')
                      : t('admin:connections.testConnection')}
                  </Button>
                </Box>
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
              <Typography variant="h6">{t('admin:about.heading')}</Typography>
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
              {t('admin:about.help')}
            </Alert>

            {aboutError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {aboutError}
              </Alert>
            )}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <VersionInfoCard
                  label={t('admin:about.frontend')}
                  version={FRONTEND_VERSION}
                  commitUrl={frontendCommitUrl}
                  commitHash={FRONTEND_GIT_COMMIT}
                  repository={frontendRepository}
                  tags={frontendCommitTags}
                  tagsLoading={aboutTagsLoading}
                  buildTagUrl={buildTagUrl}
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <VersionInfoCard
                  label={t('admin:about.backend')}
                  version={backendStats?.version}
                  commitUrl={backendCommitUrl}
                  commitHash={backendStats?.commit}
                  repository={backendRepository}
                  tags={backendCommitTags}
                  tagsLoading={aboutTagsLoading}
                  buildTagUrl={buildTagUrl}
                />
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
        title={tabIconModalState.mode === 'edit' ? t('admin:tabs.editTitle') : t('admin:tabs.createTitle')}
        saveButtonText={tabIconModalState.mode === 'edit' ? t('admin:tabs.saveChanges') : t('admin:tabs.createButton')}
        initialData={tabIconModalState.initialData}
      />

      <DeleteConfirmationDialog
        open={deleteTabDialog.open}
        onClose={() => setDeleteTabDialog({ open: false, tab: null })}
        onConfirm={confirmDeleteTab}
        title={t('admin:tabs.deleteTab')}
        itemName={deleteTabDialog.tab?.label}
        itemLabel="Tab"
        warningMessage="Widgets assigned to this tab will be moved by the server rules for deleted tabs."
      />

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
            <Typography variant="h6">{t('admin:devices.copyTitle')}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('admin:devices.copyExplain')}
          </Alert>
          <Typography sx={{ mb: 2 }}>
            {t('admin:devices.copyWarning')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('admin:devices.sourceDevice')} <strong>{copyDeviceDialog.device?.name}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('admin:devices.destinationDevice')} <strong>{currentDeviceName}</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDeviceDialog({ open: false, device: null })} variant="outlined">
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={confirmCopyDeviceToCurrent} variant="contained" color="warning" startIcon={<ContentCopy />}>
            {t('admin:devices.confirmCopy')}
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
            <Typography variant="h6">{t('admin:devices.renameTitle')}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('admin:devices.newName')}
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
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={confirmRenameDevice} variant="contained" startIcon={<Save />}>
            {t('admin:devices.saveName')}
          </Button>
        </DialogActions>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDeviceDialog.open}
        onClose={() => setDeleteDeviceDialog({ open: false, device: null })}
        onConfirm={confirmDeleteDevice}
        title={t('admin:devices.deleteDevice')}
        itemName={deleteDeviceDialog.device?.name}
        itemLabel="Device"
        warningMessage="This action cannot be undone."
      />

      {/* User Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteUserDialog.open}
        onClose={() => setDeleteUserDialog({ open: false, user: null })}
        onConfirm={() => deleteUser(deleteUserDialog.user?.id)}
        title={t('admin:users.deleteUser')}
        itemName={deleteUserDialog.user?.username}
        itemLabel="User"
        warningMessage="This action cannot be undone!"
        confirmLabel="Delete User & Chores"
      >
        <Typography variant="body2" color="text.secondary">
          This will also delete all {getUserChoreCount(deleteUserDialog.user?.id || 0)} chores assigned to this user.
        </Typography>
      </DeleteConfirmationDialog>

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
              {t('admin:chores.noChoresForUser')}
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 1 }}>
              <Table sx={stackableTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('common:labels.title')}</TableCell>
                    <TableCell>{t('common:labels.description')}</TableCell>
                    <TableCell>{t('admin:chores.scheduleCrontab')}</TableCell>
                    <TableCell>{t('admin:chores.visible')}</TableCell>
                    <TableCell>{t('admin:chores.clams')}</TableCell>
                    <TableCell>{t('common:labels.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {choreModal.userChores.map((chore) => (
                    <TableRow key={chore.id}>
                      <TableCell data-label={t('common:labels.title')}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {chore.title}
                        </Typography>
                      </TableCell>
                      <TableCell data-label={t('common:labels.description')}>
                        <Typography variant="body2" color="text.secondary">
                          {chore.description || 'No description'}
                        </Typography>
                      </TableCell>
                      <TableCell data-label={t('admin:chores.schedule')}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {chore.crontab || 'One-time'}
                        </Typography>
                      </TableCell>
                      <TableCell data-label={t('admin:chores.visible')}>
                        <Chip
                          label={chore.visible ? 'Visible' : 'Hidden'}
                          color={chore.visible ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell data-label={t('admin:chores.clams')}>
                        {chore.clam_value > 0 ? (
                          <Chip
                            label={`${chore.clam_value} 🥟`}
                            color="primary"
                            size="small"
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {t('admin:chores.regular')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          onClick={() => deleteChore(chore.id)}
                          color="error"
                          size="small"
                          title={t('admin:chores.deleteChore')}
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
            {t('common:actions.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Loading Indicator */}
      <LoadingBackdrop open={isLoading} />

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

      {/* Default avatar picker (issue #132) */}
      <Dialog
        open={avatarPicker.open}
        onClose={() => setAvatarPicker({ open: false, userId: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('admin:users.chooseAnAvatar')}</DialogTitle>
        <DialogContent>
          {defaultAvatars.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              {t('admin:users.noAvatars')}
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
                gap: 1.5,
                pt: 1,
              }}
            >
              {defaultAvatars.map((avatar) => (
                <Box
                  key={avatar.filename}
                  onClick={() => chooseDefaultAvatar(avatar.filename)}
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    borderRadius: 2,
                    p: 0.75,
                    '&:hover': { backgroundColor: 'rgba(var(--accent-rgb), 0.12)' },
                  }}
                >
                  <img
                    src={`${API_BASE_URL}/Uploads/users/${avatar.filename}`}
                    alt={avatar.name}
                    loading="lazy"
                    style={{ width: 56, height: 56, borderRadius: '50%' }}
                  />
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAvatarPicker({ open: false, userId: null })}>{t('common:actions.cancel')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPanel;
