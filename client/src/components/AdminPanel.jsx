import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Collapse,
  ButtonBase,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  Chip,
  Avatar,
  Grid,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Autocomplete,
  Tooltip,
  Slider,
  Link,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Delete,
  ContentCopy,
  Tv,
  Edit,
  Save,
  Cancel,
  Add,
  Upload,
  CheckCircle,
  CloudDownload,
  Refresh,
  Warning,
  Lock,
  Tab as TabIcon,
  PhotoLibrary,
  Info,
  OpenInNew,
  ArrowUpward,
  ArrowDownward,
  Close,
  Search as SearchIcon,
  ExpandMore
} from '@mui/icons-material';
import AppearanceSettings from './AppearanceSettings';
import DisplayDimmingSettings from './DisplayDimmingSettings';
import HomeAssistantPanels from './HomeAssistantPanels';
import ThemeLibrary from './ThemeLibrary';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { editWholeNumber, savedWholeNumber } from '../utils/wholeNumberField.js';
import { pinErrorText } from '../utils/pinErrors.js';
import { revealTabPicker } from '../utils/revealTabPicker.js';
import { getDeviceApiBase, getDeviceName, setDeviceName, isValidDeviceName } from '../utils/deviceName.js';
import { fetchPinRemembered, setPinRemembered, forgetPinOnAllDevices, shouldPromptForPin } from '../utils/adminPinDevice.js';
import PinModal from './PinModal';
import ChoreSchedulesTab from './ChoreSchedulesTab';
import ChoreHistoryTab from './ChoreHistoryTab';
import NotificationsTab from './NotificationsTab';
import RoutinesTab from './RoutinesTab';
import TabIconModal from './TabIconModal';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';
import AdminFormSection from './AdminFormSection';
import ProxyWhitelistSettings from './ProxyWhitelistSettings.jsx';
import TimezoneSettings from './TimezoneSettings';
import VersionInfoCard from './VersionInfoCard';
import { groupPluginsByCategory, pluginStoreStatus, storeEntryOf } from '../utils/pluginCatalog.js';
import LoadingBackdrop from './LoadingBackdrop';
import RefreshIntervalSelect from './RefreshIntervalSelect';
import ScreensaverIntervalSlider from './ScreensaverIntervalSlider';
import GoogleAccountConnection from './GoogleAccountConnection';
import ClamValueModal from './ClamValueModal';
import { normalizeAdminLocation, parseAdminHash, setAdminHash } from '../utils/adminNavigation.js';
import AdminShell, { ADMIN_PANEL_SIZE } from './AdminShell.jsx';
import { AdminFooter, AdminGroup, AdminNote, AdminRow } from './AdminRows.jsx';
import SoundPicker from './SoundPicker';
import ControlsOnDisplay from './ControlsOnDisplay';
import ExpandWidgetsSettings from './ExpandWidgetsSettings';
import { frameNameFor } from '../utils/pluginLocalStore.js';
import useFetchTabs from '../hooks/useFetchTabs.js';
import { MAX_DOCK_HIDE_MINUTES, screensaverPreemptsDock } from '../utils/dockIdleHide.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { syncWidgetAssignments } from '../utils/assignmentSync.js';
import { normalizeWidgetSettings as normalizeSharedWidgetSettings } from '../utils/widgetSettings.js';
import { stackableTableSx } from '../utils/responsiveTable.js';
import {
  SCREENSAVER_SETTINGS_STORAGE_KEY,
  VACATION_MODE_STORAGE_KEY,
  normalizeScreensaverSettings,
  normalizeVacationModeSettings,
  parseVacationModeSetting,
  readLocalScreensaverSettings,
  vacationSaveNeedsPin,
} from '../utils/interfaceSettings.js';
import { CONTROL_LIMITS_DEFAULT_KEY } from '../utils/displayControls.js';
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


// GooglePhotos and HomeGlowPhotos item counts come from a local DB read and are trustworthy.
// Immich item counts are NOT — the server catches per-source Immich errors and returns [] with
// 200, so a network outage is indistinguishable from an empty library at the client.
const DB_BACKED_PHOTO_TYPES = ['GooglePhotos', 'HomeGlowPhotos'];

// A form inside a group: its rows are divided like the group's own.
const formRowsSx = { '& > * + *': { borderTop: 1, borderColor: 'divider' } };

const AdminPanel = ({ setWidgetSettings, onPluginsChanged, onTabsChanged, onRequestClose }) => {
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
  // Where the panel is: { tab, section, subsection }, named as in the URL hash
  // (utils/adminNavigation.js). Tabs group what you're managing (issue #230).
  const [location, setLocation] = useState(() => parseAdminHash() || normalizeAdminLocation());
  // Displays → This display saves dimming with its other settings.
  const saveDimming = useRef(null);
  // On a phone the panel opens on its list of sections, unless a link named one.
  const [startOnList] = useState(() => !/^#\/admin\/[^/]/.test(window.location.hash));

  // Every move goes through here, so the hash always names where the panel is.
  const navigate = useCallback((next) => {
    const normalized = normalizeAdminLocation(next);
    setLocation(normalized);
    setAdminHash(normalized);
  }, []);

  // If the hash is edited while the panel is open, follow it.
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseAdminHash();
      if (parsed) setLocation(parsed);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // On opening, write the canonical hash: one for a panel opened from the
  // dock, and the new name for a link from before the regroup.
  useEffect(() => {
    setAdminHash(location);
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const [newPrize, setNewPrize] = useState({ name: '', clam_cost: 0, repeatable: false, description: '' });
  const [prizeOffers, setPrizeOffers] = useState([]);
  const [uploadedWidgets, setUploadedWidgets] = useState([]);
  // The browse thumbnails are cropped to 96x60, so a plugin's screenshot is
  // largely unreadable in the list. Holds { url, name } while one is enlarged.
  const [enlargedPreview, setEnlargedPreview] = useState(null);
  const [githubWidgets, setGithubWidgets] = useState([]);
  // Quick search over the plugin store, by name.
  const [pluginSearch, setPluginSearch] = useState('');
  // Store categories start collapsed; these are the ones opened by hand.
  const [expandedPluginCategories, setExpandedPluginCategories] = useState(() => new Set());
  const togglePluginCategory = (category) => {
    setExpandedPluginCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  // Which installed plugin is currently showing a live preview, if any.
  const [previewPlugin, setPreviewPlugin] = useState(null);
  const [loadingGithub, setLoadingGithub] = useState(false);
  // The store list loads itself on opening Plugins (issue #273): whether it
  // has, and why not when it couldn't.
  const [githubLoaded, setGithubLoaded] = useState(false);
  const [githubError, setGithubError] = useState(false);
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
  const [photoSources, setPhotoSources] = useState(null); // null = not yet loaded
  const [photoItemCount, setPhotoItemCount] = useState(null); // null = unknown
  const [screensaverSettings, setScreensaverSettings] = useState(readLocalScreensaverSettings);
  // The form, and the household value it was loaded from (fetchSettings).
  const [vacationModeSettings, setVacationModeSettings] = useState(() => parseVacationModeSetting(null));
  const [savedVacationMode, setSavedVacationMode] = useState(() => parseVacationModeSetting(null));
  const [vacationPinOpen, setVacationPinOpen] = useState(false);
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
  // Newest release vs the running one (issue #220); null until checked.
  const [updateStatus, setUpdateStatus] = useState(null);

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
      setScreensaverSettings(readLocalScreensaverSettings());
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
      fetchPhotoData();
      fetchDevices();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || location.section !== 'about') {
      return;
    }

    if (backendStats || aboutLoading) {
      return;
    }

    void refreshAboutData();
  }, [location.section, aboutLoading, backendStats, isAuthenticated]);

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/devices`);
      setDevices(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setDevices([]);
    }
  };

  const fetchPhotoData = async () => {
    let sources;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/photo-sources`);
      sources = Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('Error fetching photo sources:', error);
      return; // leave photoSources null — gate won't assert anything while unknown
    }
    setPhotoSources(sources);

    // Immich is gated on source existence, not item count — see DB_BACKED_PHOTO_TYPES comment.
    // Skip the extra request entirely for households that have an Immich source configured.
    if (sources.some(s => s.type === 'Immich' && s.enabled === 1)) {
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/photo-items`);
      setPhotoItemCount(Array.isArray(response.data) ? response.data.length : 0);
    } catch (error) {
      console.error('Error fetching photo items:', error);
      // null = unknown; gate falls back to source-only check rather than disabling
    }
  };

  const checkPinStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
      const exists = response.data.exists === true;
      setPinExists(exists);

      // A device told to remember the PIN behaves exactly as if none were set,
      // here as well as in the chore widget. Honouring it in one gate and not
      // the other would read as broken.
      const remembered = exists ? await fetchPinRemembered(API_BASE_URL) : false;

      if (shouldPromptForPin({ pinExists: exists, remembered })) {
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
      // No filter: this panel edits the whole table.
      const response = await axios.get(`${API_BASE_URL}/api/settings`);
      setSettings(response.data);
      const vacation = parseVacationModeSetting(response.data?.vacation_mode);
      setVacationModeSettings(vacation);
      setSavedVacationMode(vacation);
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

  // Fold the saved household default into the settings we already hold rather
  // than re-reading, and tell the live dashboard so the change lands on this
  // screen without a reload.
  const handleHouseholdControlLimitsSaved = useCallback((value) => {
    setSettings((prev) => ({ ...prev, [CONTROL_LIMITS_DEFAULT_KEY]: value }));
    window.dispatchEvent(new Event(DEVICE_SETTINGS_UPDATED_EVENT));
  }, []);

  // The form holds its own copy of every display's settings, so there is
  // nothing to fold in here; this exists only to tell the live dashboard that
  // the screen it is drawing just changed.
  const handleDisplayControlLimitsSaved = useCallback((deviceName) => {
    if (deviceName !== currentDeviceName) return;
    window.dispatchEvent(new Event(DEVICE_SETTINGS_UPDATED_EVENT));
  }, [currentDeviceName]);

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

  // fresh: past the server's ten-minute copy (the Refresh button).
  const fetchGithubWidgets = async (fresh = false) => {
    setLoadingGithub(true);
    setGithubError(false);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/widgets/github`, fresh ? { params: { refresh: 1 } } : undefined);
      setGithubWidgets(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching GitHub widgets:', error);
      setGithubError(true);
    } finally {
      setLoadingGithub(false);
      setGithubLoaded(true);
    }
  };

  // Opening Plugins lists what the repository has, as themes do.
  useEffect(() => {
    if (isAuthenticated && location.section === 'plugins' && !githubLoaded && !loadingGithub) fetchGithubWidgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, location.section, githubLoaded]);

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

    // Separate from the build metadata: GitHub being unreachable must not
    // fail the rest of the tab.
    axios.get(`${API_BASE_URL}/api/update-status`)
      .then((response) => setUpdateStatus(response.data))
      .catch(() => setUpdateStatus(null));

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
  // Family → Chores → Settings saves rewards, celebrations and sounds together.
  const saveChoreSettings = async () => {
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
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'CHORE_SOUND_ENABLED', value: settings.CHORE_SOUND_ENABLED || 'false' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'CHORE_SOUND_DEFAULT', value: settings.CHORE_SOUND_DEFAULT || '' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'CHORE_SOUND_VOLUME', value: String(settings.CHORE_SOUND_VOLUME ?? '100') }),
      ]);
      setSaveMessage({ show: true, type: 'success', text: t('admin:messages.choreSettingsSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving chore settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.choreSettingsFailed') });
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
      revealTabPicker(missingEnabledWidgets);
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
      revealTabPicker(missingEnabledPlugins);
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
    if (!isValidDeviceName(nextName)) {
      setRenameDeviceDialog(prev => ({ ...prev, error: t('admin:devices.nameRule') }));
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

  // The screensaver and This Display sections share one saved object; each
  // says so in its own words.
  const saveScreensaverSettings = async (savedMessageKey = 'admin:messages.screensaverSaved') => {
    try {
      setIsLoading(true);
      const normalizedScreensaver = normalizeScreensaverSettings(screensaverSettings);
      localStorage.setItem(SCREENSAVER_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedScreensaver));
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
      setSaveMessage({ show: true, type: 'success', text: t(typeof savedMessageKey === 'string' ? savedMessageKey : 'admin:messages.screensaverSaved') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving screensaver settings:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.screensaverFailed') });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Vacation is one household setting that every display follows (issue #230):
  // the server pauses missed-chore logging and the metrics plugin bridges
  // streaks, and each display mutes chimes and shows the vacation screensaver.
  const writeVacationMode = async (normalizedVacationMode) => {
    try {
      setIsLoading(true);
      await axios.post(`${API_BASE_URL}/api/settings`, {
        key: 'vacation_mode',
        value: JSON.stringify(normalizedVacationMode),
      });
      setSavedVacationMode(normalizedVacationMode);
      // The per-display copy from before #230 is no longer read.
      localStorage.removeItem(VACATION_MODE_STORAGE_KEY);
      // This display picks the change up at once; the others on their next
      // household settings refresh.
      window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
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

  // Switching vacation on, or moving its dates, asks for the admin PIN even on
  // a display that remembers it: it pauses chore tracking for everyone, which
  // is exactly what a child at an unlocked display should not be able to do.
  const saveVacationModeSettings = () => {
    const normalizedVacationMode = normalizeVacationModeSettings(vacationModeSettings);
    if (pinExists && vacationSaveNeedsPin(savedVacationMode, normalizedVacationMode)) {
      setVacationPinOpen(true);
      return;
    }
    void writeVacationMode(normalizedVacationMode);
  };

  const handleVacationPinVerify = async (pin) => {
    let valid = false;
    try {
      const response = await axios.post(`${API_BASE_URL}/api/admin-pin/verify`, { pin });
      valid = response.data?.valid === true;
    } catch (error) {
      throw new Error(pinErrorText(error, t, t('admin:vacation.pinWrong')));
    }
    if (!valid) throw new Error(t('admin:vacation.pinWrong'));
    setVacationPinOpen(false);
    await writeVacationMode(normalizeVacationModeSettings(vacationModeSettings));
  };

  const sourcesLoaded = photoSources !== null;
  const hasImmichSource = sourcesLoaded && photoSources.some(s => s.type === 'Immich' && s.enabled === 1);
  const hasNonImmichPhotoSource = sourcesLoaded && photoSources.some(s => DB_BACKED_PHOTO_TYPES.includes(s.type) && s.enabled === 1);
  // For non-Immich types the item count is a trustworthy DB read.
  // When null (HomeGlow server unreachable), fall back to source-only check.
  const nonImmichCanSupplyItems = hasNonImmichPhotoSource && (photoItemCount === null || photoItemCount > 0);
  const canUsePhotoSlideshow = sourcesLoaded && (hasImmichSource || nonImmichCanSupplyItems);
  // null while sources are still loading — avoids asserting "no source" before data arrives.
  const photoDisabledReason = !sourcesLoaded
    ? null
    : !(hasImmichSource || hasNonImmichPhotoSource)
      ? t('admin:screensaver.photoNoSource')
      : t('admin:screensaver.photoNoItems');
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
        await axios.patch(`${API_BASE_URL}/api/prizes/${editingPrize.id}`, { ...editingPrize, clam_cost: savedWholeNumber(editingPrize.clam_cost), repeatable: !!editingPrize.repeatable });
      } else {
        await axios.post(`${API_BASE_URL}/api/prizes`, { ...newPrize, clam_cost: savedWholeNumber(newPrize.clam_cost), repeatable: !!newPrize.repeatable });
        setNewPrize({ name: '', clam_cost: 0, repeatable: false, description: '' });
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
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);

      await axios.post(
        `${API_BASE_URL}/api/users/${userId}/upload-picture`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      await fetchUsers();
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

  const handlePinVerify = async (pin, remember) => {
    try {
      if (pinModal.mode === 'set') {
        const wasExisting = pinExists;
        await axios.post(`${API_BASE_URL}/api/admin-pin/set`, { pin });
        setPinExists(true);
        setIsAuthenticated(true);
        setPinModal({ open: false, mode: 'verify', title: '' });

        // Setting or changing the PIN is exactly the moment trust should reset.
        // A PIN changed *because* someone learned it would otherwise leave every
        // remembered device walking straight in until an admin thought to press
        // the revoke button. Run on a first set too, in case flags survive from
        // an earlier PIN. Reported rather than silent: a partial failure leaves
        // real devices unlocked, and the operator needs to know that.
        let forgetFailed = false;
        try {
          const { failed } = await forgetPinOnAllDevices(API_BASE_URL);
          forgetFailed = failed > 0;
        } catch (error) {
          console.error('Error clearing remembered PIN devices after a PIN change:', error);
          forgetFailed = true;
        }

        const text = forgetFailed
          ? t('admin:messages.pinChangedDevicesNotForgotten')
          : wasExisting
            ? t('admin:messages.pinChangedDevicesForgotten')
            : t('admin:messages.pinSet');
        setSaveMessage({ show: true, type: forgetFailed ? 'error' : 'success', text });
        setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), forgetFailed ? 6000 : 3000);
      } else {
        const response = await axios.post(`${API_BASE_URL}/api/admin-pin/verify`, { pin });
        if (response.data.valid) {
          if (remember) {
            // Best effort: the PIN was correct, so entry must not be blocked by
            // a failure to record the preference.
            try {
              await setPinRemembered(API_BASE_URL, true);
            } catch (error) {
              console.error('Error remembering PIN on this device:', error);
            }
          }
          setIsAuthenticated(true);
          setPinModal({ open: false, mode: 'verify', title: '' });
        } else {
          throw new Error('Invalid PIN');
        }
      }
    } catch (error) {
      throw new Error(pinErrorText(error, t, 'Invalid PIN. Please try again.'));
    }
  };

  // Cancel, Escape and a backdrop click all arrive here. While the gate is up
  // the panel renders nothing but this modal, and the modal's backdrop covers
  // the containing dialog's close button — so declining to act on a dismissal
  // leaves no way out but a page reload. Leave Admin instead.
  const handlePinModalClose = () => {
    if (!isAuthenticated) {
      onRequestClose?.();
      return;
    }
    setPinModal({ open: false, mode: 'verify', title: '' });
  };

  const handleForgetPinDevices = async () => {
    if (!window.confirm(t('admin:confirm.forgetPinDevices'))) return;
    try {
      const { total, failed } = await forgetPinOnAllDevices(API_BASE_URL);
      if (failed > 0) {
        setSaveMessage({
          show: true,
          type: 'error',
          text: t('admin:messages.pinDevicesPartlyForgotten', { failed, total }),
        });
      } else {
        setSaveMessage({
          show: true,
          type: 'success',
          text: t('admin:messages.pinDevicesForgotten', { total }),
        });
      }
    } catch (error) {
      console.error('Error clearing remembered PIN devices:', error);
      setSaveMessage({ show: true, type: 'error', text: t('admin:messages.pinDevicesForgetFailed') });
    }
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
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

  const getRefreshIntervalLabel = (interval) => {
    const option = refreshIntervalOptions.find(opt => opt.value === interval);
    return option ? option.label : t('admin:refresh.disabled');
  };


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
      <Box sx={{ ...(isMobile ? { height: '100%' } : ADMIN_PANEL_SIZE), display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box sx={isMobile ? { height: '100%' } : ADMIN_PANEL_SIZE}>
        <PinModal
          open={pinModal.open}
          onClose={handlePinModalClose}
          onVerify={handlePinVerify}
          mode={pinModal.mode}
          title={pinModal.title}
          allowRemember
        />
      </Box>
    );
  }

  return (
    <AdminShell location={location} navigate={navigate} onClose={onRequestClose} startOnList={startOnList}>
      {/* One place for every tab, rather than a copy per tab that most
          tabs lacked (screensaver and vacation saves showed nothing). */}
      {saveMessage.show && (
        <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
          {saveMessage.text}
        </Alert>
      )}

      {/* Dashboard: what is on the screens */}
      {location.tab === 'dashboard' && (
        <>
            {location.section === 'widgets' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
                  {t('admin:widgets.help')}
                </Typography>

                {['chores', 'calendar', 'photos', 'weather'].filter((widget) => widgetSettings[widget]).map((widget) => {
                  const config = widgetSettings[widget];
                  const hasRequiredTabsError = Boolean(config.enabled) && (!Array.isArray(widgetAssignments[widget]) || widgetAssignments[widget].length === 0);
                  return (
                    <AdminGroup
                      key={widget}
                      title={widget === 'weather' ? t('admin:widgets.weatherWidget') : `${widget.charAt(0).toUpperCase()}${widget.slice(1)} Widget`}
                    >
                      <AdminRow
                        label={t('common:labels.enabled')}
                        control={(
                          <Switch
                            checked={Boolean(config.enabled)}
                            onChange={() => handleWidgetToggle(widget, 'enabled')}
                            slotProps={{ input: { 'aria-label': t('common:labels.enabled') } }}
                          />
                        )}
                      />
                      <AdminRow
                        label={t('admin:widgets.transparentBackground')}
                        control={(
                          <Switch
                            checked={Boolean(config.transparent)}
                            onChange={() => handleWidgetToggle(widget, 'transparent')}
                            slotProps={{ input: { 'aria-label': t('admin:widgets.transparentBackground') } }}
                          />
                        )}
                      />
                      <AdminRow
                        label="Auto-Refresh Interval"
                        fill
                        control={(
                          <FormControl size="small" sx={{ minWidth: 200 }}>
                            <Select
                              value={config.refreshInterval || 0}
                              inputProps={{ 'aria-label': 'Auto-Refresh Interval' }}
                              onChange={(e) => handleRefreshIntervalChange(widget, e.target.value)}
                            >
                              {refreshIntervalOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      />
                      <AdminRow
                        label={t('admin:widgets.showOnTabs')}
                        hint={hasRequiredTabsError
                          ? <Box component="span" sx={{ color: 'error.main' }}>Required: select at least one tab when this widget is enabled.</Box>
                          : 'Select which tabs this widget should appear on.'}
                        wide
                        control={(
                          <Box sx={{ width: '100%' }} data-tab-picker={widget}>
                            <Autocomplete
                              multiple
                              size="small"
                              options={tabs}
                              getOptionLabel={(option) => option.label}
                              value={tabs.filter(tab => widgetAssignments[widget]?.includes(tab.number))}
                              onChange={(e, newValue) => {
                                handleWidgetAssignmentChange(widget, newValue.map(tab => tab.number));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  required={Boolean(config.enabled)}
                                  error={hasRequiredTabsError}
                                  placeholder={t('admin:widgets.selectTabs')}
                                  slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, 'aria-label': t('admin:widgets.showOnTabs') } }}
                                />
                              )}
                            />
                          </Box>
                        )}
                      />
                    </AdminGroup>
                  );
                })}

                <AdminFooter>
                  <Button variant="contained" onClick={() => saveWidgetSettings()} startIcon={<Save />}>
                    {t('admin:widgets.saveSettings')}
                  </Button>
                </AdminFooter>
              </>
            )}

            {location.section === 'plugins' && (
              <>
                {/* The uploaded-widget list that used to sit beside this was a
                    second view of the same array the Plugin Settings section
                    below already renders — and that one carries the delete
                    button, the description and the preview. Removing it lets
                    the repository span the width it needs (issue #162). */}
                <AdminGroup
                  title={t('admin:widgets.githubRepo')}
                  action={(
                    <Button
                      size="small"
                      onClick={() => fetchGithubWidgets(true)}
                      startIcon={loadingGithub ? <CircularProgress size={14} /> : <Refresh />}
                      disabled={loadingGithub}
                    >
                      {t('admin:widgets.refreshAvailable')}
                    </Button>
                  )}
                >
                  <AdminNote>
                    Browse and contribute plugins at{' '}
                    <a
                      href="https://github.com/jherforth/HomeGlowPlugins"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 'bold', color: 'inherit' }}
                    >
                      github.com/jherforth/HomeGlowPlugins
                      <OpenInNew sx={{ fontSize: '0.875rem', ml: 0.25, verticalAlign: 'middle' }} />
                    </a>
                  </AdminNote>
                  {githubWidgets.length === 0 && loadingGithub && (
                    <AdminNote>{t('admin:plugins.storeLoading')}</AdminNote>
                  )}
                  {githubError && !loadingGithub && (
                    <Box sx={{ px: 2, py: 1.5 }}>
                      <Alert severity="warning">{t('admin:plugins.storeFailed')}</Alert>
                    </Box>
                  )}

                  {/* Quick find for someone who knows the name, rather than
                      scrolling the categories below. Matches the listed name or
                      the manifest's; see utils/pluginCatalog.js. */}
                  {githubWidgets.length > 0 && (
                    <Box sx={{ px: 2, py: 1.5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        value={pluginSearch}
                        onChange={(event) => setPluginSearch(event.target.value)}
                        placeholder={t('admin:plugins.search')}
                        slotProps={{
                          htmlInput: { 'aria-label': t('admin:plugins.search') },
                          input: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchIcon fontSize="small" />
                              </InputAdornment>
                            ),
                            endAdornment: pluginSearch && (
                              <InputAdornment position="end">
                                <IconButton
                                  size="small"
                                  edge="end"
                                  aria-label={t('common:actions.clear')}
                                  onClick={() => setPluginSearch('')}
                                >
                                  <Close fontSize="small" />
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                      />
                    </Box>
                  )}
                  {githubWidgets.length > 0 && groupPluginsByCategory(githubWidgets, pluginSearch).length === 0 && (
                    <AdminNote>{t('admin:plugins.noMatches', { search: pluginSearch.trim() })}</AdminNote>
                  )}

                  {/* Capped, relative to the viewport, so a tall wall display
                      shows more while the rest of the section stays in reach. */}
                  {githubWidgets.length > 0 && (
                    <Box sx={{ maxHeight: { xs: 360, md: '50vh' }, overflowY: 'auto' }}>
                      {groupPluginsByCategory(githubWidgets, pluginSearch).map(({ category, plugins }) => {
                        // Collapsed until opened. A search opens every group with
                        // a match, since a closed heading would hide the result;
                        // clearing it brings back whatever was open before.
                        const isOpen = pluginSearch.trim() !== '' || expandedPluginCategories.has(category);
                        const groupId = `plugin-category-${category}`;
                        return (
                          <Box key={category} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                            {/* Sticky, so the heading of the group being scrolled
                                stays in view inside the capped list. */}
                            <ButtonBase
                              onClick={() => togglePluginCategory(category)}
                              disabled={pluginSearch.trim() !== ''}
                              aria-expanded={isOpen}
                              aria-controls={groupId}
                              sx={{
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                                bgcolor: 'background.paper',
                                width: '100%',
                                justifyContent: 'flex-start',
                                gap: 1,
                                px: 2,
                                py: 1.25,
                                font: 'inherit',
                                fontWeight: 600,
                                color: 'inherit',
                                '&:hover': { backgroundColor: 'action.hover' },
                                '&.Mui-disabled': { color: 'inherit' },
                                '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: -2 },
                              }}
                            >
                              <ExpandMore
                                fontSize="small"
                                sx={{ transition: 'transform 150ms', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                              />
                              {t(`admin:plugins.categories.${category}`)}
                              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                                ({plugins.length})
                              </Box>
                            </ButtonBase>
                            <Collapse in={isOpen} timeout="auto" unmountOnExit id={groupId}>
                              <Box sx={{ '& > *': { borderTop: 1, borderColor: 'divider' } }}>
                                {plugins.map((widget) => {
                                  const status = pluginStoreStatus(widget, uploadedWidgets);
                                  return (
                                    <AdminRow
                                      key={widget.path}
                                      leading={widget.previewUrl && (
                                        // Sibling image in the plugins repo (chore-metrics.png
                                        // next to chore-metrics.html), not carried in the
                                        // manifest. A button, so the enlarged view is reachable
                                        // from a keyboard as well as a tap.
                                        <Box
                                          component="button"
                                          type="button"
                                          onClick={() => setEnlargedPreview({ url: widget.previewUrl, name: widget.name })}
                                          aria-label={t('admin:plugins.enlargePreview', { name: widget.name })}
                                          sx={{
                                            p: 0,
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'zoom-in',
                                            lineHeight: 0,
                                            borderRadius: 1,
                                            '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: 2 }
                                          }}
                                        >
                                          <Box
                                            component="img"
                                            src={widget.previewUrl}
                                            alt=""
                                            loading="lazy"
                                            sx={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 1, display: 'block' }}
                                          />
                                        </Box>
                                      )}
                                      label={(
                                        <>
                                          {widget.name}
                                          {widget.version && (
                                            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                              {widget.version}
                                            </Typography>
                                          )}
                                          {/* Who wrote it (issue #210), worked out by the server. */}
                                          {widget.author && (
                                            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                              {t('admin:plugins.byAuthor', { author: widget.author })}
                                            </Typography>
                                          )}
                                        </>
                                      )}
                                      hint={widget.description || <em>{t('admin:plugins.noDescription')}</em>}
                                      control={(
                                        // As themes: Install, Update (to the store's version),
                                        // or Up to date when the installed copy is the very same
                                        // file (issue #273).
                                        <Button
                                          onClick={() => installGithubWidget(widget)}
                                          startIcon={status === 'current' ? <CheckCircle /> : <CloudDownload />}
                                          size="small"
                                          variant={status === 'install' ? 'outlined' : 'text'}
                                          disabled={status === 'current'}
                                        >
                                          {status === 'install'
                                            ? t('admin:widgets.install')
                                            : status === 'current'
                                              ? t('admin:plugins.upToDate')
                                              : widget.version
                                                ? t('admin:plugins.updateTo', { version: widget.version })
                                                : t('admin:plugins.update')}
                                        </Button>
                                      )}
                                    />
                                  );
                                })}
                              </Box>
                            </Collapse>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </AdminGroup>

                <AdminGroup title={t('admin:widgets.uploadCustom')}>
                  <AdminRow
                    hint={uploadedWidgets.length === 0 ? t('admin:plugins.noneInstalled') : null}
                    control={(
                      <Button variant="outlined" component="label" startIcon={<Upload />}>
                        {t('admin:widgets.uploadHtml')}
                        <input
                          type="file"
                          hidden
                          accept=".html"
                          onChange={handleWidgetUpload}
                        />
                      </Button>
                    )}
                  />
                </AdminGroup>

                {uploadedWidgets.length > 0 && (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
                      {t('admin:plugins.settingsHelp')}
                    </Typography>

                    {uploadedWidgets.map((plugin) => {
                      const pSettings = pluginSettings[plugin.filename] || {};
                      const storeEntry = plugin.source === 'builder' ? null : storeEntryOf(plugin, githubWidgets);
                      const updatable = storeEntry && pluginStoreStatus(storeEntry, [plugin]) === 'update';
                      const pluginWidgetName = `plugin:${plugin.filename}`;
                      const hasRequiredTabsError = Boolean(pSettings.enabled) && (!Array.isArray(pluginAssignments[pluginWidgetName]) || pluginAssignments[pluginWidgetName].length === 0);
                      const setPluginField = (field, value) => setPluginSettings(prev => ({
                        ...prev,
                        [plugin.filename]: { ...prev[plugin.filename], [field]: value }
                      }));
                      return (
                        <AdminGroup
                          key={plugin.filename}
                          title={plugin.name}
                          action={(
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {updatable && (
                                <Button size="small" variant="outlined" startIcon={<CloudDownload />} onClick={() => installGithubWidget(storeEntry)}>
                                  {t('admin:plugins.update')}
                                </Button>
                              )}
                              {/* An installed plugin is already served at
                                  /widgets/<file>, so it can preview itself. On
                                  demand rather than always: these are real plugins
                                  that make real API calls. */}
                              <Button
                                size="small"
                                onClick={() => setPreviewPlugin((current) => current === plugin.filename ? null : plugin.filename)}
                              >
                                {previewPlugin === plugin.filename
                                  ? t('admin:plugins.hidePreview')
                                  : t('admin:plugins.showPreview')}
                              </Button>
                              <Tooltip title={t('common:actions.delete')}>
                                <IconButton onClick={() => deleteWidget(plugin.filename)} color="error" size="small" aria-label={t('common:actions.delete')}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        >
                          <AdminRow
                            label={(
                              <Typography variant="body2" component="span" color="text.secondary">
                                {[plugin.filename, plugin.version, plugin.author && t('admin:plugins.byAuthor', { author: plugin.author })]
                                  .filter(Boolean).join(' · ')}
                              </Typography>
                            )}
                            hint={(
                              <>
                                {updatable && (
                                  <Box component="span" sx={{ display: 'block', color: 'var(--accent)', fontWeight: 600 }}>
                                    {storeEntry.version
                                      ? t('admin:plugins.updateAvailable', { version: storeEntry.version })
                                      : t('admin:plugins.updateAvailableNoVersion')}
                                  </Box>
                                )}
                                {/* Straight from the plugin's own manifest (issue
                                    #147). A legacy widget has none, and says so. */}
                                <Box component="span" sx={{ display: 'block', color: plugin.manifest?.description ? 'text.primary' : 'text.secondary', fontStyle: plugin.manifest?.description ? 'normal' : 'italic' }}>
                                  {plugin.manifest?.description || t('admin:plugins.noDescription')}
                                </Box>
                              </>
                            )}
                            extra={previewPlugin === plugin.filename && (
                              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', height: 220 }}>
                                <iframe
                                  title={t('admin:plugins.previewTitle', { name: plugin.name })}
                                  // Same channel PluginWidgetWrapper uses, read from the
                                  // root element because the Admin Panel has no theme prop.
                                  //
                                  // device is carried too, and is not cosmetic: the plugin
                                  // platform refuses to WRITE a device-scoped setting
                                  // without it, so a plugin whose own UI saves one would
                                  // fail here while working fine on the dashboard.
                                  src={`${API_BASE_URL}/widgets/${encodeURIComponent(plugin.filename)}?theme=${document.documentElement.getAttribute('data-theme') || 'light'}&device=${encodeURIComponent(currentDeviceName)}&lang=${i18n.language || 'en'}`}
                                  // Opaque, like the dashboard's frames (PluginWidgetWrapper):
                                  // a plugin can't act as HomeGlow from here either.
                                  sandbox="allow-scripts allow-forms"
                                  allow="geolocation"
                                  name={frameNameFor(plugin.filename)}
                                  style={{ width: '100%', height: '100%', border: 0, display: 'block', backgroundColor: 'var(--card-bg)' }}
                                />
                              </Box>
                            )}
                          />
                          <AdminRow
                            label={t('common:labels.enabled')}
                            control={(
                              <Switch
                                checked={pSettings.enabled || false}
                                onChange={() => setPluginField('enabled', !pSettings.enabled)}
                                slotProps={{ input: { 'aria-label': t('common:labels.enabled') } }}
                              />
                            )}
                          />
                          <AdminRow
                            label={t('admin:plugins.transparentBackground')}
                            control={(
                              <Switch
                                checked={pSettings.transparent || false}
                                onChange={() => setPluginField('transparent', !pSettings.transparent)}
                                slotProps={{ input: { 'aria-label': t('admin:plugins.transparentBackground') } }}
                              />
                            )}
                          />
                          <AdminRow
                            label="Auto-Refresh Interval"
                            fill
                            control={(
                              <FormControl size="small" sx={{ minWidth: 200 }}>
                                <Select
                                  value={pSettings.refreshInterval || 0}
                                  inputProps={{ 'aria-label': 'Auto-Refresh Interval' }}
                                  onChange={(e) => setPluginField('refreshInterval', e.target.value)}
                                >
                                  {refreshIntervalOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            )}
                          />

                          {plugin.pluginId && Array.isArray(plugin.manifest?.settings) && plugin.manifest.settings.map((setting) => {
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
                            return (
                              <AdminRow
                                key={setting.key}
                                label={label}
                                hint={setting.scope === 'device' ? t('admin:plugins.perDevice') : null}
                                fill={setting.type === 'select' || setting.type === 'number'}
                                wide={setting.type !== 'boolean' && setting.type !== 'select' && setting.type !== 'number'}
                                control={setting.type === 'boolean' ? (
                                  <Switch
                                    checked={Boolean(value)}
                                    onChange={() => setValue(!value)}
                                    slotProps={{ input: { 'aria-label': label } }}
                                  />
                                ) : setting.type === 'select' ? (
                                  <FormControl size="small" sx={{ minWidth: 200 }}>
                                    <Select
                                      value={value ?? ''}
                                      inputProps={{ 'aria-label': label }}
                                      onChange={(event) => setValue(event.target.value)}
                                    >
                                      {(setting.options || []).map((option) => (
                                        <MenuItem key={option} value={option}>{option}</MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                ) : setting.type === 'number' ? (
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={value ?? ''}
                                    slotProps={{ htmlInput: { min: setting.min, max: setting.max, 'aria-label': label } }}
                                    onChange={(event) => {
                                      const parsed = Number(event.target.value);
                                      setValue(event.target.value === '' || Number.isNaN(parsed) ? '' : parsed);
                                    }}
                                    sx={{ width: 120 }}
                                  />
                                ) : (
                                  <TextField
                                    fullWidth
                                    size="small"
                                    value={value ?? ''}
                                    onChange={(event) => setValue(event.target.value)}
                                    slotProps={{ htmlInput: { 'aria-label': label } }}
                                  />
                                )}
                              />
                            );
                          })}

                          <AdminRow
                            label={t('admin:widgets.showOnTabs')}
                            hint={hasRequiredTabsError
                              ? <Box component="span" sx={{ color: 'error.main' }}>Required: select at least one tab when this plugin is enabled.</Box>
                              : 'Select which tabs this plugin should appear on.'}
                            wide
                            control={(
                              <Box sx={{ width: '100%' }} data-tab-picker={pluginWidgetName}>
                                <Autocomplete
                                  multiple
                                  size="small"
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
                                      required={Boolean(pSettings.enabled)}
                                      error={hasRequiredTabsError}
                                      placeholder={t('admin:widgets.selectTabs')}
                                      slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, 'aria-label': t('admin:widgets.showOnTabs') } }}
                                    />
                                  )}
                                />
                              </Box>
                            )}
                          />
                        </AdminGroup>
                      );
                    })}

                    <AdminFooter>
                      <Button variant="contained" onClick={() => savePluginSettings()} startIcon={<Save />}>
                        {t('admin:plugins.saveSettings')}
                      </Button>
                    </AdminFooter>
                  </>
                )}
              </>
            )}

            {location.section === 'homeassistant' && (
              <HomeAssistantPanels onNavigate={navigate} />
            )}

            {location.section === 'tabs' && (
              <AdminGroup
                title={t('admin:sections.tabs')}
                action={(
                  <Button variant="contained" size="small" startIcon={<Add />} onClick={openCreateTabDialog}>
                    {t('admin:tabs.addTab')}
                  </Button>
                )}
              >
                <AdminNote>{t('admin:tabs.manageHelp')}</AdminNote>
                {[...tabs].sort((a, b) => a.number - b.number).map((tab) => {
                  const isHome = tab.number === 1;
                  const orderIndex = draggableTabsInOrder().findIndex((t) => t.number === tab.number);
                  const lastOrderIndex = draggableTabsInOrder().length - 1;
                  return (
                    <Box
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
                      <AdminRow
                        leading={(
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 104 }}>
                            <Chip label={tab.number} size="small" />
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
                        )}
                        label={(
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            {tab.label}
                            {isHome && <Chip size="small" label={t('admin:tabs.home')} color="primary" />}
                          </Box>
                        )}
                        hint={`${t('admin:tabs.icon')}: ${tab.icon}`}
                        control={(
                          <>
                            <Typography variant="caption" color="text.secondary">{t('admin:tabs.showLabel')}</Typography>
                            <Switch
                              checked={Boolean(tab.show_label)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleTabShowLabel(tab)}
                              disabled={isLoading}
                              slotProps={{ input: { 'aria-label': t('admin:tabs.toggleShowLabel', { name: tab.label }) } }}
                            />
                            <Tooltip title={t('common:actions.edit')}>
                              <span>
                                <IconButton onClick={() => openEditTabDialog(tab)} size="small" disabled={isHome} aria-label={t('common:actions.edit')}>
                                  <Edit fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={t('common:actions.delete')}>
                              <span>
                                <IconButton onClick={() => requestDeleteTab(tab)} color="error" size="small" disabled={isHome} aria-label={t('common:actions.delete')}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </>
                        )}
                      />
                    </Box>
                  );
                })}
              </AdminGroup>
            )}
        </>
      )}

      {/* Look */}
      {location.tab === 'look' && (
        <>
          <AppearanceSettings />
          <ThemeLibrary />
        </>
      )}

      {/* Displays: each display, and this display's screensaver */}
      {location.tab === 'displays' && (
        <>
            {location.section === 'devices' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
                  {t('admin:devices.manageHelp')}
                </Typography>

                <AdminGroup>
                  <AdminRow
                    label={t('admin:devices.currentName')}
                    hint={<Box component="span" sx={{ fontFamily: 'var(--hg-font-mono)' }}>{currentDeviceName}</Box>}
                    control={(
                      <Button size="small" variant="outlined" startIcon={<Edit />} onClick={openRenameDeviceDialog}>
                        {t('admin:devices.renameCurrent')}
                      </Button>
                    )}
                  />
                </AdminGroup>

                {/* No heading: the section's own title already says Devices. */}
                <AdminGroup>
                  {devices.map((device) => {
                    const isCurrent = device.name === currentDeviceName;
                    return (
                      <AdminRow
                        key={device.name}
                        leading={<Tv sx={{ color: 'text.secondary' }} />}
                        label={(
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Box component="span" sx={{ fontFamily: 'var(--hg-font-mono)', fontSize: '0.9375rem' }}>{device.name}</Box>
                            {isCurrent && <Chip label={t('admin:devices.current')} color="primary" size="small" />}
                          </Box>
                        )}
                        hint={[
                          `${t('admin:devices.lastUpdated')}: ${device.updateTime ? new Date(device.updateTime).toLocaleString() : 'Unknown'}`,
                          `${t('admin:subTabs.widgets')}: ${Number(device.widgets) || 0}`,
                        ].join(' · ')}
                        control={(
                          <>
                            {/* This display is renamed from the row above. */}
                            {!isCurrent && (
                              <Tooltip title={t('admin:devices.copyToCurrent')}>
                                <IconButton onClick={() => openCopyDeviceDialog(device)} size="small" aria-label={t('admin:devices.copyToCurrent')}>
                                  <ContentCopy fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title={t('admin:devices.deleteDevice')}>
                              <span>
                                <IconButton
                                  onClick={() => openDeleteDeviceDialog(device)}
                                  color="error"
                                  size="small"
                                  aria-label={t('admin:devices.deleteDevice')}
                                  disabled={isCurrent}
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </>
                        )}
                      />
                    );
                  })}
                </AdminGroup>
              </>
            )}

            {/* This Display: settings for this screen that aren't about the
                screensaver. Kept, like the screensaver's, in this display's own
                storage, so they are saved together. */}
            {location.section === 'thisdisplay' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
                  {t('admin:thisDisplay.help')}
                </Typography>

                {/* Dock idle hide (issue #77) and touch gestures
                    (utils/twoFingerSwipe.js), saved with the screensaver
                    settings. */}
                <AdminGroup>
                  <AdminRow
                    label={t('admin:screensaver.dockHideHeading')}
                    hint={t('admin:screensaver.dockHideHelp')}
                    control={(
                      <TextField
                        type="number"
                        size="small"
                        label={t('admin:screensaver.dockHideLabel')}
                        value={screensaverSettings.dockHideMinutes}
                        onChange={(e) => setScreensaverSettings(prev => ({ ...prev, dockHideMinutes: e.target.value }))}
                        slotProps={{ htmlInput: { min: 0, max: MAX_DOCK_HIDE_MINUTES, step: 1 } }}
                        sx={{ width: 170 }}
                      />
                    )}
                    extra={screensaverPreemptsDock({
                      screensaverEnabled: screensaverSettings.enabled,
                      screensaverMinutes: screensaverSettings.timeout,
                      dockHideMinutes: screensaverSettings.dockHideMinutes,
                    }) && (
                      <Alert severity="info">
                        {t('admin:screensaver.dockHidePreempted', { count: screensaverSettings.timeout })}
                      </Alert>
                    )}
                  />
                </AdminGroup>

                <AdminGroup title={t('admin:screensaver.touchHeading')}>
                  <AdminRow
                    label={t('admin:screensaver.twoFingerSwipe')}
                    hint={t('admin:screensaver.twoFingerSwipeHelp')}
                    control={(
                      <Switch
                        checked={screensaverSettings.twoFingerSwipe === true}
                        onChange={(e) => setScreensaverSettings(prev => ({ ...prev, twoFingerSwipe: e.target.checked }))}
                        slotProps={{ input: { 'aria-label': t('admin:screensaver.twoFingerSwipe') } }}
                      />
                    )}
                  />
                  <AdminRow
                    label={t('admin:screensaver.blockPinchZoom')}
                    hint={t('admin:screensaver.blockPinchZoomHelp')}
                    control={(
                      <Switch
                        checked={screensaverSettings.blockPinchZoom === true}
                        onChange={(e) => setScreensaverSettings(prev => ({ ...prev, blockPinchZoom: e.target.checked }))}
                        slotProps={{ input: { 'aria-label': t('admin:screensaver.blockPinchZoom') } }}
                      />
                    )}
                  />
                </AdminGroup>

                {/* Expanding widgets (utils/widgetExpand.js). Saved with the
                    screensaver settings. The list offers the widgets turned
                    on here. */}
                <ExpandWidgetsSettings
                  settings={screensaverSettings}
                  onChange={(patch) => setScreensaverSettings(prev => ({ ...prev, ...patch }))}
                  widgets={[
                    ...['calendar', 'weather', 'chores', 'photos']
                      .filter((key) => widgetSettings[key]?.enabled)
                      .map((key) => ({ name: key, label: t(`admin:screensaver.expand.widgetNames.${key}`) })),
                    ...uploadedWidgets
                      .filter((plugin) => pluginSettings[plugin.filename]?.enabled)
                      .map((plugin) => ({
                        name: `plugin:${plugin.filename}`,
                        label: plugin.name || plugin.filename,
                        manifestBlocks: plugin.manifest?.expand === false,
                      })),
                  ]}
                />

                {/* Display dimming (DisplayDimmingSettings) saves only its own
                    field, so the one Save button below saves it alongside. */}
                <DisplayDimmingSettings saveRef={saveDimming} />

                <AdminFooter>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      await saveScreensaverSettings('admin:messages.displaySaved');
                      await saveDimming.current?.();
                    }}
                    startIcon={<Save />}
                  >
                    {t('admin:thisDisplay.save')}
                  </Button>
                </AdminFooter>
              </>
            )}

            {location.section === 'screensaver' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
                  {t('admin:screensaver.help')}
                </Typography>

                <AdminGroup>
                  <AdminRow
                    label={t('admin:screensaver.enable')}
                    control={(
                      <Switch
                        checked={screensaverSettings.enabled}
                        onChange={(e) => setScreensaverSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                        slotProps={{ input: { 'aria-label': t('admin:screensaver.enable') } }}
                      />
                    )}
                  />
                  <AdminRow
                    label={t('admin:screensaver.mode')}
                    hint={screensaverSettings.mode === 'photos'
                      ? (canUsePhotoSlideshow ? t('admin:screensaver.photoSlideshowHelp') : (photoDisabledReason || ''))
                      : (hasTabsCreated ? t('admin:screensaver.cycleTabsHelp', { count: tabs.length }) : t('admin:screensaver.cycleTabsDisabled'))}
                    fill
                    control={(
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={screensaverSettings.mode}
                        onChange={(_, mode) => mode && setScreensaverSettings(prev => ({ ...prev, mode }))}
                        sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5, py: 0.5, gap: 0.75 } }}
                      >
                        <ToggleButton value="tabs" disabled={!hasTabsCreated}>
                          <TabIcon fontSize="small" />
                          {t('admin:screensaver.cycleTabs')}
                        </ToggleButton>
                        <ToggleButton value="photos" disabled={!canUsePhotoSlideshow}>
                          <PhotoLibrary fontSize="small" />
                          {t('admin:screensaver.photoSlideshow')}
                        </ToggleButton>
                      </ToggleButtonGroup>
                    )}
                  />
                  <ScreensaverIntervalSlider
                    label="Inactivity Timeout"
                    unit="minute"
                    value={screensaverSettings.timeout}
                    onChange={(value) => setScreensaverSettings(prev => ({ ...prev, timeout: value }))}
                    min={1}
                    max={30}
                    marks={[
                      { value: 1, label: '1m' },
                      { value: 5, label: '5m' },
                      { value: 10, label: '10m' },
                      { value: 15, label: '15m' },
                      { value: 30, label: '30m' }
                    ]}
                  />
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
                  <AdminRow
                    label={t('admin:screensaver.keepScreenAwake')}
                    hint={t('admin:screensaver.keepScreenAwakeHelp')}
                    control={(
                      <Switch
                        checked={screensaverSettings.keepScreenAwake}
                        onChange={(e) => setScreensaverSettings(prev => ({ ...prev, keepScreenAwake: e.target.checked }))}
                        slotProps={{ input: { 'aria-label': t('admin:screensaver.keepScreenAwake') } }}
                      />
                    )}
                  />
                </AdminGroup>

                {/* How each photo uses the screen. Fit is the original look;
                    the other layouts fill the bars a photo of a different
                    shape leaves. */}
                {screensaverSettings.mode === 'photos' && (
                  <AdminGroup title={t('admin:screensaver.layoutHeading')}>
                    <AdminRow
                      hint={t(`admin:screensaver.layout.${screensaverSettings.photoLayout || 'fit'}Help`)}
                      wide
                      control={(
                        <ToggleButtonGroup
                          exclusive
                          size="small"
                          value={screensaverSettings.photoLayout || 'fit'}
                          onChange={(_, layout) => layout && setScreensaverSettings(prev => ({ ...prev, photoLayout: layout }))}
                          sx={{ width: '100%', '& .MuiToggleButton-root': { flex: 1, textTransform: 'none', py: 0.5 } }}
                        >
                          {['fit', 'ambient', 'collage', 'coffeeTable'].map((layout) => (
                            <ToggleButton key={layout} value={layout}>{t(`admin:screensaver.layout.${layout}`)}</ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      )}
                    />
                    {/* Coffee Table drops prints at its own, quicker pace. */}
                    {screensaverSettings.photoLayout === 'coffeeTable' ? (
                      <ScreensaverIntervalSlider
                        label={t('admin:screensaver.coffeeTableRate')}
                        value={screensaverSettings.coffeeTableSeconds ?? 4}
                        onChange={(value) => setScreensaverSettings(prev => ({ ...prev, coffeeTableSeconds: value }))}
                        min={1}
                        max={20}
                        marks={[
                          { value: 1, label: '1s' },
                          { value: 5, label: '5s' },
                          { value: 10, label: '10s' },
                          { value: 20, label: '20s' }
                        ]}
                      />
                    ) : (
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
                    {/* When, who and where on each photo, for the layouts
                        that show several at once. */}
                    {['collage', 'coffeeTable'].includes(screensaverSettings.photoLayout) && (
                      <AdminRow
                        label={t('admin:screensaver.photoDetails')}
                        hint={t('admin:screensaver.photoDetailsHelp')}
                        control={(
                          <Switch
                            checked={screensaverSettings.photoDetails === true}
                            onChange={(e) => setScreensaverSettings(prev => ({ ...prev, photoDetails: e.target.checked }))}
                            slotProps={{ input: { 'aria-label': t('admin:screensaver.photoDetails') } }}
                          />
                        )}
                      />
                    )}
                  </AdminGroup>
                )}

                {/* Corner overlay (issue #190). Photo mode only: in tab mode the
                    dashboard itself is on screen, so there is nothing to overlay. */}
                {screensaverSettings.mode === 'photos' && (
                  <AdminGroup title={t('admin:screensaver.overlayHeading')}>
                    <AdminRow
                      label={t('admin:screensaver.overlayCalendar')}
                      hint={t('admin:screensaver.overlayHelp')}
                      control={(
                        <Switch
                          checked={screensaverSettings.overlayCalendar === true}
                          onChange={(e) => setScreensaverSettings(prev => ({ ...prev, overlayCalendar: e.target.checked }))}
                          slotProps={{ input: { 'aria-label': t('admin:screensaver.overlayCalendar') } }}
                        />
                      )}
                    />
                    {screensaverSettings.overlayCalendar === true && (
                      <AdminRow
                        label={t('admin:screensaver.overlayDays')}
                        fill
                        control={(
                          <FormControl size="small" sx={{ minWidth: 200 }}>
                            <Select
                              value={screensaverSettings.overlayCalendarDays || 1}
                              inputProps={{ 'aria-label': t('admin:screensaver.overlayDays') }}
                              onChange={(e) => setScreensaverSettings(prev => ({ ...prev, overlayCalendarDays: Number(e.target.value) }))}
                            >
                              {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                                <MenuItem key={days} value={days}>
                                  {days === 1
                                    ? t('admin:screensaver.overlayDaysToday')
                                    : t('admin:screensaver.overlayDaysPlus', { count: days - 1 })}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      />
                    )}
                    <AdminRow
                      label={t('admin:screensaver.overlayWeather')}
                      hint={screensaverSettings.overlayWeather === true ? t('admin:screensaver.overlayWeatherHelp') : null}
                      control={(
                        <Switch
                          checked={screensaverSettings.overlayWeather === true}
                          onChange={(e) => setScreensaverSettings(prev => ({ ...prev, overlayWeather: e.target.checked }))}
                          slotProps={{ input: { 'aria-label': t('admin:screensaver.overlayWeather') } }}
                        />
                      )}
                    />
                  </AdminGroup>
                )}

                <AdminFooter>
                  <Button variant="contained" onClick={() => saveScreensaverSettings()} startIcon={<Save />}>
                    {t('admin:screensaver.save')}
                  </Button>
                </AdminFooter>
              </>
            )}
        </>
      )}

      {/* Family: users, chores, prizes and vacation */}
      {location.section === 'users' && (
        <>
          <AdminGroup title={t('admin:users.addNew')}>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                saveUser();
              }}
              sx={{ px: 2, py: 1.5 }}
            >
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                  size="small"
                  label={t('admin:users.username')}
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  sx={{ flex: '1 1 180px' }}
                />
                <TextField
                  size="small"
                  label={t('admin:users.email')}
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  sx={{ flex: '1 1 220px' }}
                />
                <Button type="submit" variant="contained" disabled={!newUser.username || !newUser.email} sx={{ flex: { xs: '1 1 100%', sm: 'none' } }}>
                  {t('admin:users.addUser')}
                </Button>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                {newUser.profile_picture ? (
                  <img
                    src={`${API_BASE_URL}/Uploads/users/${newUser.profile_picture}`}
                    alt={t('admin:users.chosenAvatar')}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--accent)' }}
                  />
                ) : (
                  <Avatar sx={{ width: 36, height: 36, bgcolor: 'var(--card-border)' }}>?</Avatar>
                )}
                <Button size="small" onClick={() => setAvatarPicker({ open: true, userId: null })}>
                  {t('admin:users.chooseAvatar')}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {t('admin:users.avatarHelp')}
                </Typography>
              </Box>
            </Box>
          </AdminGroup>

          <AdminGroup title={t('admin:users.management')}>
            {users.map((user) => {
              // Display order (issue #134). Drag works on desktop only —
              // HTML5 drag events never fire on touch — so the arrows
              // carry the feature on phones and the wall tablet.
              const isBonus = user.id === 0;
              const orderIndex = reorderableUsers.findIndex((u) => u.id === user.id);
              const editing = editingUser?.id === user.id;
              return (
                <Box
                  key={user.id}
                  draggable={!isBonus && !editing}
                  onDragStart={() => handleUserDragStart(user.id)}
                  onDragOver={(e) => {
                    if (!isBonus) e.preventDefault();
                  }}
                  onDrop={() => {
                    if (!isBonus) handleUserDrop(user.id);
                  }}
                  sx={{ cursor: isBonus || editing ? 'default' : 'grab', opacity: draggingUserId === user.id ? 0.65 : 1 }}
                >
                  <AdminRow
                    leading={(
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {isBonus ? (
                          <Chip size="small" label={t('admin:users.pinned')} sx={{ width: 68 }} />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', width: 68, ml: -0.75 }}>
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
                        <UserAvatar key={`${user.id}-${user.profile_picture}`} user={user} />
                      </Box>
                    )}
                    label={editing ? (
                      <TextField
                        size="small"
                        label={t('admin:users.username')}
                        value={editingUser.username}
                        onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                        sx={{ mb: 1, width: '100%', maxWidth: 280 }}
                      />
                    ) : user.username}
                    hint={editing ? (
                      <TextField
                        size="small"
                        label={t('admin:users.email')}
                        value={editingUser.email}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        sx={{ width: '100%', maxWidth: 280 }}
                      />
                    ) : (
                      <Box component="span" sx={{ wordBreak: 'break-all' }}>{user.email}</Box>
                    )}
                    extra={editing && (
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pl: { xs: 0, sm: 13 } }}>
                        <Typography variant="body2" color="text.secondary">{t('admin:users.avatar')}</Typography>
                        <Button component="label" size="small" variant="outlined">
                          {t('common:actions.upload')}
                          <input type="file" hidden accept="image/*" onChange={(e) => handleProfilePictureUpload(user.id, e)} />
                        </Button>
                        <Tooltip title={t('admin:users.pickBuiltIn')}>
                          <Button size="small" variant="outlined" onClick={() => setAvatarPicker({ open: true, userId: user.id })}>
                            {t('common:actions.choose')}
                          </Button>
                        </Tooltip>
                      </Box>
                    )}
                    control={(
                      <>
                        <Tooltip title={t('admin:users.editClams')}>
                          <Chip
                            label={`${user.clam_total || 0} 🥟`}
                            color="primary"
                            size="small"
                            onClick={() => setClamModalUser(user)}
                          />
                        </Tooltip>
                        <Button variant="outlined" size="small" onClick={() => openChoreModal(user)} sx={{ minWidth: 'auto' }}>
                          {getUserChoreCount(user.id)} chores
                        </Button>
                        {editing ? (
                          <>
                            <Tooltip title={t('common:actions.save')}>
                              <IconButton onClick={saveUser} color="primary" size="small" aria-label={t('common:actions.save')}>
                                <Save fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('common:actions.cancel')}>
                              <IconButton onClick={() => setEditingUser(null)} size="small" aria-label={t('common:actions.cancel')}>
                                <Cancel fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : (
                          <>
                            <Tooltip title={t('common:actions.edit')}>
                              <IconButton onClick={() => setEditingUser({ ...user })} size="small" aria-label={t('common:actions.edit')}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('common:actions.delete')}>
                              <IconButton onClick={() => handleUserDelete(user)} color="error" size="small" aria-label={t('common:actions.delete')}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </>
                    )}
                  />
                </Box>
              );
            })}
          </AdminGroup>
        </>
      )}

      {location.section === 'chores' && (
        <>
          {location.subsection === 'definitions' && (
            <ChoreSchedulesTab setSaveMessage={setSaveMessage} />
          )}
          {location.subsection === 'history' && (
            <ChoreHistoryTab />
          )}
          {location.subsection === 'settings' && (
            <>
              <AdminGroup title={t('admin:chores.rewards')}>
                <AdminRow
                  label={t('admin:chores.dailyReward')}
                  hint={t('admin:chores.dailyRewardHelp')}
                  control={(
                    <TextField
                      type="number"
                      size="small"
                      value={settings.daily_completion_clam_reward || '2'}
                      onChange={(e) => setSettings(prev => ({ ...prev, daily_completion_clam_reward: e.target.value }))}
                      slotProps={{ htmlInput: { min: 0, max: 100, 'aria-label': t('admin:chores.dailyReward') } }}
                      sx={{ width: 96 }}
                    />
                  )}
                />
                <AdminRow
                  label={t('admin:chores.celebrationEnable')}
                  hint={t('admin:chores.celebrationHelp')}
                  control={(
                    <Switch
                      checked={settings.CHORE_CELEBRATION_ENABLED !== 'false' && settings.CHORE_CELEBRATION_ENABLED !== false}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        CHORE_CELEBRATION_ENABLED: e.target.checked ? 'true' : 'false',
                      }))}
                      slotProps={{ input: { 'aria-label': t('admin:chores.celebrationEnable') } }}
                    />
                  )}
                />
              </AdminGroup>

              <AdminGroup title={t('admin:chores.soundsHeading')}>
                <AdminRow
                  label={t('admin:chores.soundsEnable')}
                  control={(
                    <Switch
                      checked={settings.CHORE_SOUND_ENABLED === 'true' || settings.CHORE_SOUND_ENABLED === true}
                      onChange={(e) => setSettings(prev => ({ ...prev, CHORE_SOUND_ENABLED: e.target.checked ? 'true' : 'false' }))}
                      slotProps={{ input: { 'aria-label': t('admin:chores.soundsEnable') } }}
                    />
                  )}
                />
                <AdminRow
                  label={t('admin:chores.defaultSound')}
                  hint={t('admin:chores.defaultSoundHelp')}
                  wide
                  control={(
                    <Box sx={{ width: '100%' }}>
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
                  )}
                />
                <AdminRow
                  label={`Volume: ${Number(settings.CHORE_SOUND_VOLUME) || 0}%`}
                  fill
                  control={(
                    <Slider
                      value={Number(settings.CHORE_SOUND_VOLUME) || 0}
                      onChange={(_, v) => setSettings(prev => ({ ...prev, CHORE_SOUND_VOLUME: String(v) }))}
                      min={0}
                      max={100}
                      valueLabelDisplay="auto"
                      aria-label="Volume"
                      sx={{ width: { xs: 'auto', sm: 220 }, flex: { xs: 1, sm: 'none' }, mx: 1 }}
                    />
                  )}
                />
              </AdminGroup>

              <AdminFooter>
                <Button variant="contained" onClick={saveChoreSettings} disabled={isLoading} startIcon={<Save />}>
                  {isLoading ? t('common:state.saving') : t('common:actions.save')}
                </Button>
              </AdminFooter>
            </>
          )}
        </>
      )}

      {/* Routines: steps a child ticks off, each routine one chore (its own
          module; its cards are ticked in the Chores widget). */}
      {location.section === 'routines' && (
        <RoutinesTab
          subsection={location.subsection}
          setSaveMessage={setSaveMessage}
        />
      )}

      {location.section === 'prizes' && (
        <>
          <AdminGroup title={t('admin:prizes.addNew')}>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                savePrize();
              }}
              sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}
            >
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                  size="small"
                  label={t('admin:prizes.name')}
                  value={newPrize.name}
                  onChange={(e) => setNewPrize({ ...newPrize, name: e.target.value })}
                  sx={{ flex: '1 1 220px' }}
                />
                <TextField
                  size="small"
                  label={t('admin:prizes.cost')}
                  type="number"
                  value={newPrize.clam_cost}
                  onChange={(e) => setNewPrize({ ...newPrize, clam_cost: editWholeNumber(e.target.value) })}
                  sx={{ width: 120 }}
                />
                <Tooltip title={t('admin:prizes.repeatableTooltip')}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={!!newPrize.repeatable}
                        onChange={(e) => setNewPrize({ ...newPrize, repeatable: e.target.checked })}
                      />
                    )}
                    label={t('admin:prizes.repeatableLabel')}
                    sx={{ mr: 0 }}
                  />
                </Tooltip>
              </Box>
              <TextField
                fullWidth
                multiline
                size="small"
                minRows={2}
                label={t('admin:prizes.description')}
                value={newPrize.description}
                onChange={(e) => setNewPrize({ ...newPrize, description: e.target.value })}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="contained" disabled={!newPrize.name || newPrize.clam_cost <= 0} sx={{ flex: { xs: 1, sm: 'none' } }}>
                  {t('admin:prizes.add')}
                </Button>
              </Box>
            </Box>
          </AdminGroup>

          <AdminGroup title={t('admin:prizes.management')}>
            {prizes.map((prize) => (editingPrize?.id === prize.id ? (
              <Box key={prize.id} sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <TextField
                    size="small"
                    label={t('admin:prizes.name')}
                    value={editingPrize.name}
                    onChange={(e) => setEditingPrize({ ...editingPrize, name: e.target.value })}
                    sx={{ flex: '1 1 220px' }}
                  />
                  <TextField
                    size="small"
                    label={t('admin:prizes.cost')}
                    type="number"
                    value={editingPrize.clam_cost}
                    onChange={(e) => setEditingPrize({ ...editingPrize, clam_cost: editWholeNumber(e.target.value) })}
                    sx={{ width: 120 }}
                  />
                  <Tooltip title={t('admin:prizes.repeatableShortTooltip')}>
                    <FormControlLabel
                      control={(
                        <Switch
                          checked={!!editingPrize.repeatable}
                          onChange={(e) => setEditingPrize({ ...editingPrize, repeatable: e.target.checked })}
                        />
                      )}
                      label={t('admin:prizes.repeatableShort')}
                      sx={{ mr: 0 }}
                    />
                  </Tooltip>
                  <Box sx={{ ml: 'auto', display: 'flex' }}>
                    <Tooltip title={t('common:actions.save')}>
                      <IconButton onClick={savePrize} color="primary" aria-label={t('common:actions.save')}>
                        <Save />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('common:actions.cancel')}>
                      <IconButton onClick={() => setEditingPrize(null)} aria-label={t('common:actions.cancel')}>
                        <Cancel />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <TextField
                  fullWidth
                  multiline
                  size="small"
                  minRows={2}
                  label={t('admin:prizes.description')}
                  value={editingPrize.description || ''}
                  onChange={(e) => setEditingPrize({ ...editingPrize, description: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              </Box>
            ) : (
              <AdminRow
                key={prize.id}
                label={prize.name}
                hint={(
                  <>
                    {prize.description && (
                      <Box component="span" sx={{ display: 'block', whiteSpace: 'pre-line' }}>{prize.description}</Box>
                    )}
                    {prize.repeatable
                      ? t('admin:prizes.costLineRepeatable', { cost: prize.clam_cost })
                      : t('admin:prizes.costLine', { cost: prize.clam_cost })}
                  </>
                )}
                control={(
                  <>
                    <Tooltip title={prize.repeatable ? 'Add to store (stays on the shelf after each redemption)' : 'Add to store (one-time redeemable offer)'}>
                      <IconButton onClick={() => addPrizeToStore(prize.id)} color="primary" size="small" aria-label="Add to store">
                        <Add fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('common:actions.edit')}>
                      <IconButton onClick={() => setEditingPrize({ ...prize })} size="small" aria-label={t('common:actions.edit')}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('common:actions.delete')}>
                      <IconButton onClick={() => deletePrize(prize.id)} color="error" size="small" aria-label={t('common:actions.delete')}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              />
            )))}
          </AdminGroup>

          <AdminGroup title={t('admin:prizes.store')}>
            <AdminNote>{t('admin:prizes.storeHelp')}</AdminNote>
            {prizeOffers.length === 0 ? (
              <AdminNote>{t('admin:prizes.storeEmpty')}</AdminNote>
            ) : prizeOffers.map((offer) => (
              <AdminRow
                key={offer.id}
                label={`${offer.name} — ${offer.clam_cost} 🥟${offer.repeatable ? ' · 🔁' : ''}`}
                hint={offer.status === 'requested'
                  ? t('admin:prizes.requestedBy', { name: offer.requested_by_name || t('common:state.none') })
                  : 'On the shelf'}
                control={(
                  <Tooltip title={offer.status === 'requested' ? 'Decline request and remove from store' : 'Remove from store'}>
                    <IconButton onClick={() => removePrizeOffer(offer.id)} color="error" size="small" aria-label={offer.status === 'requested' ? 'Decline request and remove from store' : 'Remove from store'}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              />
            ))}
          </AdminGroup>
        </>
      )}

      {location.section === 'vacation' && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
            {t('admin:vacation.help')}
          </Typography>
          <AdminGroup>
            <AdminRow
              label={t('admin:vacation.enable')}
              control={(
                <Switch
                  checked={vacationModeSettings.enabled}
                  onChange={(e) => setVacationModeSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  slotProps={{ input: { 'aria-label': t('admin:vacation.enable') } }}
                />
              )}
            />
            <AdminRow
              label={t('admin:vacation.muteSounds')}
              disabled={!vacationModeSettings.enabled}
              control={(
                <Switch
                  checked={vacationModeSettings.muteSounds}
                  disabled={!vacationModeSettings.enabled}
                  onChange={(e) => setVacationModeSettings(prev => ({ ...prev, muteSounds: e.target.checked }))}
                  slotProps={{ input: { 'aria-label': t('admin:vacation.muteSounds') } }}
                />
              )}
            />
            {vacationModeSettings.enabled && (
              <AdminRow
                label={`${t('admin:vacation.startDate')} – ${t('admin:vacation.endDate')}`}
                hint={t('admin:vacation.dateHelp')}
                fill
                control={(
                  <>
                    <TextField
                      size="small"
                      type="date"
                      label={t('admin:vacation.startDate')}
                      value={vacationModeSettings.startDate || ''}
                      onChange={(e) => setVacationModeSettings(prev => ({ ...prev, startDate: e.target.value }))}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ flex: { xs: 1, sm: 'none' }, width: { sm: 160 } }}
                    />
                    <TextField
                      size="small"
                      type="date"
                      label={t('admin:vacation.endDate')}
                      value={vacationModeSettings.endDate || ''}
                      onChange={(e) => setVacationModeSettings(prev => ({ ...prev, endDate: e.target.value }))}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ flex: { xs: 1, sm: 'none' }, width: { sm: 160 } }}
                    />
                  </>
                )}
              />
            )}
          </AdminGroup>
          <AdminFooter>
            <Button variant="contained" onClick={saveVacationModeSettings} startIcon={<Save />}>
              {t('admin:vacation.save')}
            </Button>
          </AdminFooter>
        </>
      )}

      {/* Security */}
      {location.tab === 'security' && (
        <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
              {t('admin:security.help')}
            </Typography>

            <AdminGroup title={t('admin:security.pinProtection')}>
              <AdminRow
                label={t('admin:security.currentStatus').replace(/:\s*$/, '')}
                hint={pinExists
                  ? 'Your admin panel is protected with a PIN. You can update your PIN below.'
                  : 'Set up a PIN to secure your admin panel access.'}
                control={(
                  <Chip
                    label={pinExists ? 'PIN Configured' : 'No PIN Set'}
                    color={pinExists ? 'success' : 'warning'}
                    size="small"
                  />
                )}
              />
              <AdminRow
                label={pinExists ? t('admin:pin.update') : t('admin:pin.setPin')}
                hint={`${t('admin:security.requirements')} 4-8 numeric digits · Numbers only (0-9) · Required for admin access`}
                extra={pinExists && (
                  <Typography variant="body2" color="text.secondary">{t('admin:security.changeNote')}</Typography>
                )}
                control={(
                  <Button variant="contained" onClick={handleUpdatePin} startIcon={<Lock />}>
                    {pinExists ? t('admin:pin.update') : t('admin:pin.setPin')}
                  </Button>
                )}
              />
              {pinExists && (
                <AdminRow
                  control={(
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' }}>
                      <Button variant="outlined" onClick={handleForgetPinDevices}>
                        {t('admin:pin.forgetDevices')}
                      </Button>
                      <Button variant="outlined" color="error" onClick={handleClearPin}>
                        {t('admin:security.removePin')}
                      </Button>
                    </Box>
                  )}
                  wide
                />
              )}
            </AdminGroup>

            <ControlsOnDisplay
              apiBaseUrl={API_BASE_URL}
              devices={devices}
              currentDeviceName={currentDeviceName}
              pinExists={pinExists}
              householdSettings={settings}
              plugins={uploadedWidgets}
              onHouseholdDefaultSaved={handleHouseholdControlLimitsSaved}
              onDisplayLimitsSaved={handleDisplayControlLimitsSaved}
            />
        </>
      )}

      {/* System: language and time, connections, notifications, about */}
      {location.section === 'region' && (
        <>
          {/* Language (issue #137), per display like the other interface
              settings. Week start deliberately lives in the calendar
              widget's own settings, which has had per-tab week/month start
              controls since #127 — a second global control would fight it. */}
          <AdminGroup title={t('admin:interface.languageSection')}>
            <AdminRow
              label={t('common:language.label')}
              hint={t('admin:interface.languageSubtitle')}
              under={(
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('common:language.helper')}
                </Typography>
              )}
              fill
              control={(
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <Select
                    value={i18n.language?.split('-')[0] || 'en'}
                    inputProps={{ 'aria-label': t('common:language.label') }}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <MenuItem key={lang.code} value={lang.code}>
                        {lang.endonym}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          </AdminGroup>

          {/* Household-wide, unlike the rest of this tab (issue #193). */}
          <AdminGroup title={t('admin:timezone.heading')}>
            <AdminNote>{t('admin:timezone.subtitle')}</AdminNote>
            <Box sx={{ px: 2, py: 1.5 }}>
              <TimezoneSettings />
            </Box>
          </AdminGroup>
        </>
      )}

      {location.section === 'connections' && (
        <>
          {/* Not weather's: any plugin fetching another site uses it
              (issue #328). Saves on each change. */}
          <AdminGroup title={t('admin:connections.proxyHeading')}>
            <Box sx={{ px: 2, py: 1.5 }}>
              <ProxyWhitelistSettings
                value={settings.PROXY_WHITELIST || ''}
                onSaved={(value) => setSettings((prev) => ({ ...prev, PROXY_WHITELIST: value }))}
              />
            </Box>
          </AdminGroup>

          <AdminGroup title={t('admin:connections.weatherHeading')}>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                saveAllApiSettings();
              }}
              sx={formRowsSx}
            >
              <AdminRow
                label={t('admin:connections.weatherProvider')}
                fill
                extra={weatherProviderStatus && !weatherProviderStatus.configured && (
                  <Alert severity="warning">{weatherProviderStatus.reason}</Alert>
                )}
                control={(
                  <FormControl size="small" sx={{ minWidth: 240 }}>
                    <Select
                      value={settings.WEATHER_PROVIDER || 'openweathermap'}
                      inputProps={{ 'aria-label': t('admin:connections.weatherProvider') }}
                      onChange={(e) => setSettings(prev => ({ ...prev, WEATHER_PROVIDER: e.target.value }))}
                    >
                      <MenuItem value="openweathermap">{t('admin:connections.providerOpenWeather')}</MenuItem>
                      <MenuItem value="homeassistant">{t('admin:connections.providerHomeAssistant')}</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
              {/* The key field is write-only: the server redacts it, so this
                  shows whether one is stored and accepts a replacement. */}
              {settings.WEATHER_PROVIDER !== 'homeassistant' && (
                <AdminRow
                  label={t('admin:connections.openWeatherKey')}
                  hint={weatherProviderStatus?.has_api_key
                    ? t('admin:connections.openWeatherStoredHelp')
                    : t('admin:connections.openWeatherHelp')}
                  wide
                  control={(
                    <TextField
                      fullWidth
                      size="small"
                      type="password"
                      value={settings.WEATHER_API_KEY || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, WEATHER_API_KEY: e.target.value }))}
                      placeholder={weatherProviderStatus?.has_api_key ? t('admin:connections.keyStored') : ''}
                      slotProps={{ htmlInput: { 'aria-label': t('admin:connections.openWeatherKey') } }}
                    />
                  )}
                />
              )}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1.5 }}>
                <Button type="submit" variant="contained" disabled={isLoading} startIcon={<Save />}>
                  {isLoading ? t('common:state.saving') : t('admin:connections.saveApiKeys')}
                </Button>
              </Box>
            </Box>
          </AdminGroup>

          {/* Home Assistant (issue #57) */}
          <AdminGroup title={t('admin:connections.homeAssistantHeading')}>
            <AdminNote>{t('admin:connections.homeAssistantHelp')}</AdminNote>
            {homeAssistantStatus && !homeAssistantStatus.encryption?.configured && (
              <Box sx={{ px: 2, py: 1.5 }}>
                <Alert severity="warning">{t('admin:connections.encryptionRequired')}</Alert>
              </Box>
            )}
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                saveHomeAssistantConnection();
              }}
              sx={formRowsSx}
            >
              <AdminRow
                label={t('admin:connections.homeAssistantUrl')}
                hint={t('admin:connections.homeAssistantUrlHelp')}
                wide
                control={(
                  <TextField
                    fullWidth
                    size="small"
                    value={homeAssistantDraft.url}
                    onChange={(e) => setHomeAssistantDraft(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="http://homeassistant.local:8123"
                    slotProps={{ htmlInput: { 'aria-label': t('admin:connections.homeAssistantUrl') } }}
                  />
                )}
              />
              <AdminRow
                label={t('admin:connections.homeAssistantToken')}
                hint={homeAssistantStatus?.has_token
                  ? t('admin:connections.homeAssistantTokenStoredHelp')
                  : t('admin:connections.homeAssistantTokenHelp')}
                wide
                control={(
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    value={homeAssistantDraft.token}
                    onChange={(e) => setHomeAssistantDraft(prev => ({ ...prev, token: e.target.value }))}
                    placeholder={homeAssistantStatus?.has_token ? t('admin:connections.tokenStored') : ''}
                    slotProps={{ htmlInput: { 'aria-label': t('admin:connections.homeAssistantToken') } }}
                  />
                )}
              />
              {/* Populated by Test Connection, so the entity id can be picked
                  rather than remembered. */}
              <AdminRow
                label={t('admin:connections.homeAssistantEntity')}
                hint={homeAssistantEntities.length > 0 ? null : t('admin:connections.homeAssistantEntityHelp')}
                wide
                control={homeAssistantEntities.length > 0 ? (
                  <FormControl fullWidth size="small">
                    <Select
                      value={homeAssistantDraft.weather_entity || ''}
                      inputProps={{ 'aria-label': t('admin:connections.homeAssistantEntity') }}
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
                    size="small"
                    value={homeAssistantDraft.weather_entity}
                    onChange={(e) => setHomeAssistantDraft(prev => ({ ...prev, weather_entity: e.target.value }))}
                    placeholder="weather.home"
                    slotProps={{ htmlInput: { 'aria-label': t('admin:connections.homeAssistantEntity') } }}
                  />
                )}
              />
              <Box sx={{ px: 2, py: 1.5 }}>
                {homeAssistantTestResult && (
                  <Alert severity={homeAssistantTestResult.ok ? 'success' : 'error'} sx={{ mb: 1.5 }}>
                    {homeAssistantTestResult.message}
                    {homeAssistantTestResult.version ? ` (${homeAssistantTestResult.version})` : ''}
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                  <Button type="submit" variant="contained" disabled={isLoading} startIcon={<Save />}>
                    {isLoading ? t('common:state.saving') : t('admin:connections.saveHomeAssistant')}
                  </Button>
                </Box>
              </Box>
            </Box>
          </AdminGroup>

          <GoogleAccountConnection
            onMessage={({ type, text }) => {
              setSaveMessage({ show: true, type, text });
              setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
            }}
          />
        </>
      )}

      {location.section === 'notifications' && (
        <NotificationsTab
          deviceName={currentDeviceName}
          onOpenConnections={() => navigate({ tab: 'system', section: 'connections' })}
        />
      )}

      {location.section === 'about' && (
        <>
          {updateStatus?.updateAvailable && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {t('admin:about.updateAvailable', { latest: updateStatus.latest, current: updateStatus.current })}
              {updateStatus.releaseUrl && (
                <>
                  {' '}
                  <Link href={updateStatus.releaseUrl} target="_blank" rel="noopener noreferrer">
                    {t('admin:about.releaseNotes')}
                  </Link>
                </>
              )}
            </Alert>
          )}
          {updateStatus?.latest && !updateStatus.updateAvailable && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {updateStatus.isRelease
                ? t('admin:about.upToDate', { current: updateStatus.current })
                : t('admin:about.testBuild', { latest: updateStatus.latest })}
            </Alert>
          )}
          {aboutError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {aboutError}
            </Alert>
          )}

          <AdminGroup
            title={t('admin:about.heading')}
            action={(
              <Button size="small" startIcon={<Refresh />} onClick={refreshAboutData} disabled={aboutLoading}>
                {aboutLoading ? 'Refreshing...' : 'Refresh Version Info'}
              </Button>
            )}
          >
            <AdminNote>{t('admin:about.help')}</AdminNote>
            <Box sx={{ p: 2 }}>
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
            </Box>
          </AdminGroup>
        </>
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
            onChange={(e) => {
              const val = e.target.value;
              const validationError = isValidDeviceName(val) ? '' : t('admin:devices.nameRule');
              setRenameDeviceDialog(prev => ({ ...prev, newName: val, error: validationError }));
            }}
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
          <Button
            onClick={confirmRenameDevice}
            variant="contained"
            startIcon={<Save />}
            disabled={!isValidDeviceName((renameDeviceDialog.newName || '').trim())}
          >
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
                        <Typography variant="body2" sx={{ fontFamily: 'var(--hg-font-mono)' }}>
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
        allowRemember
      />

      {/* Confirms switching vacation on (issue #230). Never "remember": this
          prompt exists for displays that already remember the PIN. */}
      <PinModal
        open={vacationPinOpen}
        onClose={() => setVacationPinOpen(false)}
        onVerify={handleVacationPinVerify}
        mode="verify"
        title={t('admin:vacation.pinTitle')}
      />

      {/* Enlarged plugin preview (issue #162). The list thumbnails are cropped
          to 96x60, so this is the only place the screenshot is actually
          legible. Dialog gives Escape-to-close alongside the X. */}
      <Dialog
        open={!!enlargedPreview}
        onClose={() => setEnlargedPreview(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{enlargedPreview?.name}</Box>
          <IconButton
            onClick={() => setEnlargedPreview(null)}
            aria-label={t('admin:plugins.closePreview')}
            size="small"
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          {enlargedPreview && (
            <Box
              component="img"
              src={enlargedPreview.url}
              alt={t('admin:plugins.previewAlt', { name: enlargedPreview.name })}
              // maxWidth rather than width: these screenshots are around 620px
              // wide, and stretching one to fill a md dialog only makes it
              // blurrier — the opposite of why the enlarged view exists.
              sx={{ maxWidth: '100%', height: 'auto', display: 'block', mx: 'auto', borderRadius: 'var(--hg-radius-sm)' }}
            />
          )}
        </DialogContent>
      </Dialog>

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
                    borderRadius: 'var(--hg-radius-md)',
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
    </AdminShell>
  );
};

export default AdminPanel;
