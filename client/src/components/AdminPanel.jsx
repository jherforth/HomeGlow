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
  ViewCompact,
  ViewModule,
  ViewQuilt,
  Lock,
  Nightlight,
  Tab as TabIcon,
  PhotoLibrary,
  Info,
  ArrowForward,
  ContentCopy
} from '@mui/icons-material';
import ColorPickerPopover from './ColorPickerPopover';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase, getDeviceGuid } from '../utils/deviceGuid.js';
import PinModal from './PinModal';
import ChoreSchedulesTab from './ChoreSchedulesTab';
import ChoreHistoryTab from './ChoreHistoryTab';

const AdminPanel = ({ setWidgetSettings, onPluginsChanged }) => {
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const currentClientGuid = getDeviceGuid();
  const [activeTab, setActiveTab] = useState(0);
  const [choresSubTab, setChoresSubTab] = useState(0);
  const [widgetsSubTab, setWidgetsSubTab] = useState(0);
  const [settings, setSettings] = useState({
    WEATHER_API_KEY: '',
    PROXY_WHITELIST: '',
    daily_completion_clam_reward: '2'
  });
  const [widgetSettings, setLocalWidgetSettings] = useState({
    chores: { enabled: false, transparent: false, refreshInterval: 0 },
    calendar: { enabled: false, transparent: false, refreshInterval: 0 },
    photos: { enabled: false, transparent: false, refreshInterval: 0 },
    weather: { enabled: false, transparent: false, refreshInterval: 0, layoutMode: 'medium' },
    primary: '#f5f5f5',
    secondary: '#38bdf8',
    accent: '#f472b6'
  });
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
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
  const [devices, setDevices] = useState([]);
  const [pluginSettings, setPluginSettings] = useState(() => {
    const saved = localStorage.getItem('pluginSettings');
    return saved ? JSON.parse(saved) : {};
  });
  const [pluginAssignments, setPluginAssignments] = useState({});
  const [photoSources, setPhotoSources] = useState([]);
  const [screensaverSettings, setScreensaverSettings] = useState(() => {
    const saved = localStorage.getItem('screensaverSettings');
    return saved ? JSON.parse(saved) : {
      enabled: false,
      mode: 'tabs',
      timeout: 5,
      slideshowInterval: 10
    };
  });

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
    const savedSettings = localStorage.getItem('widgetSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      // Ensure refresh intervals and layout mode are included, default to 'medium' if 'auto' or not set
      const settingsWithDefaults = {
        chores: { enabled: false, transparent: false, refreshInterval: 0, ...parsed.chores },
        calendar: { enabled: false, transparent: false, refreshInterval: 0, ...parsed.calendar },
        photos: { enabled: false, transparent: false, refreshInterval: 0, ...parsed.photos },
        weather: {
          enabled: false,
          transparent: false,
          refreshInterval: 0,
          layoutMode: (parsed.weather?.layoutMode === 'auto' || !parsed.weather?.layoutMode) ? 'medium' : parsed.weather.layoutMode,
          ...parsed.weather
        },
        primary: parsed.primary || '#f5f5f5',
        secondary: parsed.secondary || '#38bdf8',
        accent: parsed.accent || '#f472b6'
      };
      setLocalWidgetSettings(settingsWithDefaults);
    }
    checkPinStatus();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
      fetchUsers();
      fetchChores();
      fetchPrizes();
      fetchUploadedWidgets();
      fetchTabs();
      fetchWidgetAssignments();
      fetchDevices();
      fetchPhotoSources();
    }
  }, [isAuthenticated]);

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
          pluginAssign[assignment.widget_name].push(assignment.tab_id);
        } else {
          if (!coreAssignments[assignment.widget_name]) {
            coreAssignments[assignment.widget_name] = [];
          }
          coreAssignments[assignment.widget_name].push(assignment.tab_id);
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

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/devices`);
      setDevices(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setDevices([]);
    }
  };

  const handleTakeOverDevice = async (targetGuid) => {
    const currentDeviceGuid = getDeviceGuid();

    if (targetGuid === currentDeviceGuid) {
      setSaveMessage({ show: true, type: 'info', text: 'Selected device is already the current device.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
      return;
    }

    setIsLoading(true);
    try {
      await axios.delete(`${API_BASE_URL}/api/devices/${encodeURIComponent(currentDeviceGuid)}`).catch(() => {});
      await axios.patch(`${API_BASE_URL}/api/devices/${encodeURIComponent(targetGuid)}`, {
        deviceGuid: currentDeviceGuid,
      });

      await Promise.all([fetchDevices(), fetchTabs(), fetchWidgetAssignments()]);
      setSaveMessage({ show: true, type: 'success', text: 'Device takeover completed.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error taking over device:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to take over device.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyDevice = async (targetGuid) => {
    setIsLoading(true);
    try {
      await axios.get(`${API_BASE_URL}/api/devices/${encodeURIComponent(targetGuid)}/copy`);
      await fetchDevices();
      setSaveMessage({ show: true, type: 'success', text: 'Device copied successfully.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error copying device:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to copy device.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceGuid) => {
    if (!window.confirm(`Delete device ${deviceGuid}? This will remove its tabs and widget assignments.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await axios.delete(`${API_BASE_URL}/api/devices/${encodeURIComponent(deviceGuid)}`);
      await fetchDevices();
      setSaveMessage({ show: true, type: 'success', text: 'Device deleted successfully.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error deleting device:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to delete device.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
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

  const saveAllApiSettings = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'WEATHER_API_KEY', value: settings.WEATHER_API_KEY || '' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'PROXY_WHITELIST', value: settings.PROXY_WHITELIST || '' }),
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'daily_completion_clam_reward', value: settings.daily_completion_clam_reward || '2' })
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

  const saveWidgetSettings = async () => {
    setIsLoading(true);
    try {
      localStorage.setItem('widgetSettings', JSON.stringify(widgetSettings));
      setWidgetSettings(widgetSettings);

      const currentResponse = await axios.get(`${API_DEVICE_URL}/widget-assignments`);
      const currentAssignments = Array.isArray(currentResponse.data) ? currentResponse.data : [];

      for (const [widgetName, desiredTabIds] of Object.entries(widgetAssignments)) {
        const existing = currentAssignments.filter(a => a.widget_name === widgetName);
        const existingTabIds = existing.map(a => a.tab_id);

        const toRemove = existing.filter(a => !desiredTabIds.includes(a.tab_id));
        const toAdd = desiredTabIds.filter(id => !existingTabIds.includes(id));

        for (const assignment of toRemove) {
          await axios.delete(`${API_DEVICE_URL}/widget-assignments/${assignment.id}`);
        }

        for (const tabId of toAdd) {
          await axios.post(`${API_DEVICE_URL}/widget-assignments`, {
            widget_name: widgetName,
            tab_id: tabId,
          });
        }
      }

      setSaveMessage({ show: true, type: 'success', text: 'Widget settings saved successfully! Refresh page to see changes.' });
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
    setIsLoading(true);
    try {
      localStorage.setItem('pluginSettings', JSON.stringify(pluginSettings));

      const currentResponse = await axios.get(`${API_DEVICE_URL}/widget-assignments`);
      const currentAssignments = Array.isArray(currentResponse.data) ? currentResponse.data : [];

      for (const [pluginWidgetName, desiredTabIds] of Object.entries(pluginAssignments)) {
        const existing = currentAssignments.filter(a => a.widget_name === pluginWidgetName);
        const existingTabIds = existing.map(a => a.tab_id);

        const toRemove = existing.filter(a => !desiredTabIds.includes(a.tab_id));
        const toAdd = desiredTabIds.filter(id => !existingTabIds.includes(id));

        for (const assignment of toRemove) {
          await axios.delete(`${API_DEVICE_URL}/widget-assignments/${assignment.id}`);
        }

        for (const tabId of toAdd) {
          await axios.post(`${API_DEVICE_URL}/widget-assignments`, {
            widget_name: pluginWidgetName,
            tab_id: tabId,
          });
        }
      }

      if (onPluginsChanged) onPluginsChanged();
      setSaveMessage({ show: true, type: 'success', text: 'Plugin settings saved successfully! Refresh page to see changes.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving plugin settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save plugin settings. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWidgetAssignmentChange = (widgetName, selectedTabIds) => {
    setWidgetAssignments(prev => ({
      ...prev,
      [widgetName]: selectedTabIds
    }));
  };

  const saveInterfaceSettings = () => {
    localStorage.setItem('widgetSettings', JSON.stringify(widgetSettings));
    setWidgetSettings(widgetSettings);
    
    // Apply CSS variables immediately
    applyAccentColors();
    
    setSaveMessage({ show: true, type: 'success', text: 'Accent colors saved! Refresh page to see all changes.' });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
  };

  const applyAccentColors = () => {
    const root = document.documentElement;
    const isLight = root.getAttribute('data-theme') === 'light';

    root.style.setProperty('--primary', widgetSettings.primary);
    root.style.setProperty('--secondary', widgetSettings.secondary);
    root.style.setProperty('--accent', widgetSettings.accent);

    if (isLight) {
      root.style.setProperty('--background', widgetSettings.primary);
    }
  };

  const resetToDefaults = () => {
    const defaultSettings = {
      primary: '#f5f5f5',
      secondary: '#38bdf8',
      accent: '#f472b6'
    };

    setLocalWidgetSettings(prev => ({ ...prev, ...defaultSettings }));
    setSaveMessage({ show: true, type: 'info', text: 'Reset to default colors. Click Save to apply.' });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
  };

  const saveScreensaverSettings = () => {
    localStorage.setItem('screensaverSettings', JSON.stringify(screensaverSettings));
    setSaveMessage({ show: true, type: 'success', text: 'Screensaver settings saved!' });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
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

  const handleWeatherLayoutModeChange = (mode) => {
    setLocalWidgetSettings(prev => ({
      ...prev,
      weather: {
        ...prev.weather,
        layoutMode: mode
      }
    }));
  };

  const handleSettingChange = (setting, value) => {
    setLocalWidgetSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleColorChange = (colorKey, color) => {
    setLocalWidgetSettings(prev => ({
      ...prev,
      [colorKey]: color.hex
    }));
  };

  const saveUser = async () => {
    try {
      setIsLoading(true);
      if (editingUser) {
        await axios.patch(`${API_BASE_URL}/api/users/${editingUser.id}`, editingUser);
      } else {
        await axios.post(`${API_BASE_URL}/api/users`, newUser);
        setNewUser({ username: '', email: '', profile_picture: '' });
      }
      setEditingUser(null);
      fetchUsers();
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
        await axios.delete(`${API_DEVICE_URL}/widget-assignments/widget/${encodeURIComponent(pluginWidgetName)}`).catch(() => {});
        setPluginSettings(prev => {
          const updated = { ...prev };
          delete updated[filename];
          localStorage.setItem('pluginSettings', JSON.stringify(updated));
          return updated;
        });
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
            backgroundColor: widgetSettings[key],
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
          value={widgetSettings[key]}
          onChange={(e) => handleSettingChange(key, e.target.value)}
          sx={{ flex: 1 }}
          placeholder="#000000"
        />
      </Box>
      <ColorPickerPopover
        anchorEl={colorPickerAnchor.key === key ? colorPickerAnchor.el : null}
        color={widgetSettings[key]}
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
    'APIs'
  ];

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
      <Typography variant="h4" gutterBottom>
        ⚙️ Admin Panel
      </Typography>

      <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        {adminTabs.map((tab, index) => (
          <Tab key={tab} label={tab} />
        ))}
      </Tabs>

      {/* Widgets Tab */}
      {activeTab === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs value={widgetsSubTab} onChange={(_, v) => setWidgetsSubTab(v)} size="small">
                <Tab label="Widgets" />
                <Tab label="Plugins" />
                <Tab label="Devices" />
              </Tabs>
            </Box>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            {widgetsSubTab === 0 && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Enable widgets to show them on the dashboard. Click to select a widget, then drag to move or resize from corners.
                </Alert>

                {Object.entries(widgetSettings).filter(([key]) =>
                  ['chores', 'calendar', 'photos'].includes(key)
                ).map(([widget, config]) => (
                  <Box key={widget} sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, textTransform: 'capitalize', fontWeight: 'bold' }}>
                      {widget} Widget
                    </Typography>

                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} sm={6}>
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

                      <Grid item xs={12} sm={6}>
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
                        value={tabs.filter(tab => widgetAssignments[widget]?.includes(tab.id))}
                        onChange={(e, newValue) => {
                          handleWidgetAssignmentChange(widget, newValue.map(tab => tab.id));
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Show on Tabs"
                            placeholder="Select tabs..."
                            helperText="Select which tabs this widget should appear on (defaults to Home tab if none selected)"
                          />
                        )}
                        renderTags={(value, getTagProps) =>
                          value.map((option, index) => (
                            <Chip
                              label={option.label}
                              {...getTagProps({ index })}
                              sx={{ backgroundColor: 'var(--accent)', color: 'white' }}
                            />
                          ))
                        }
                      />
                    </Box>

                    {config.refreshInterval > 0 && (
                      <Alert severity="info" sx={{ mt: 2 }} icon={<Timer />}>
                        This widget will automatically refresh every {getRefreshIntervalLabel(config.refreshInterval).toLowerCase()}
                      </Alert>
                    )}
                  </Box>
                ))}

                <Box sx={{ mb: 3, p: 2, border: '2px solid var(--accent)', borderRadius: 1, backgroundColor: 'rgba(158, 127, 255, 0.05)' }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                    Weather Widget
                  </Typography>
              
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
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
                
                <Grid item xs={12} sm={6}>
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
                  value={tabs.filter(tab => widgetAssignments['weather']?.includes(tab.id))}
                  onChange={(e, newValue) => {
                    handleWidgetAssignmentChange('weather', newValue.map(tab => tab.id));
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Show on Tabs"
                      placeholder="Select tabs..."
                      helperText="Select which tabs this widget should appear on (defaults to Home tab if none selected)"
                    />
                  )}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        label={option.label}
                        {...getTagProps({ index })}
                        sx={{ backgroundColor: 'var(--accent)', color: 'white' }}
                      />
                    ))
                  }
                />
              </Box>

              {/* Weather Layout Mode Selection */}
              <Box sx={{ mt: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1, bgcolor: 'rgba(255, 255, 255, 0.02)' }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ViewModule />
                  Layout Mode
                </Typography>
                
                <RadioGroup
                  value={widgetSettings.weather?.layoutMode || 'medium'}
                  onChange={(e) => handleWeatherLayoutModeChange(e.target.value)}
                >
                  <FormControlLabel
                    value="compact"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ViewCompact />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            Compact
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Current weather only (minimal space)
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                  
                  <FormControlLabel
                    value="medium"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ViewModule />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            Medium
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Current weather + 3-day forecast
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                  
                  <FormControlLabel
                    value="full"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ViewQuilt />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            Full
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            All information with charts and air quality
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                </RadioGroup>

                <Alert severity="info" sx={{ mt: 2 }}>
                  The selected layout mode will be used regardless of widget size. Resize the widget to fit your preferred layout.
                </Alert>
              </Box>
              
              {widgetSettings.weather?.refreshInterval > 0 && (
                <Alert severity="info" sx={{ mt: 2 }} icon={<Timer />}>
                  Weather widget will automatically refresh every {getRefreshIntervalLabel(widgetSettings.weather.refreshInterval).toLowerCase()}
                </Alert>
              )}
            </Box>

                <Button variant="contained" onClick={saveWidgetSettings} sx={{ mt: 2 }} startIcon={<Save />}>
                  Save Widget Settings
                </Button>
              </>
            )}

            {widgetsSubTab === 1 && (
              <>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
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

                  <Grid item xs={12} md={6}>
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
                  <>
                    <Divider sx={{ my: 3 }} />
                    <Typography variant="h6" gutterBottom>Plugin Settings</Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Configure each installed plugin below. Enable them, set transparency, refresh intervals, and assign to tabs just like core widgets.
                    </Alert>

                    {uploadedWidgets.map((plugin) => {
                      const pSettings = pluginSettings[plugin.filename] || {};
                      const pluginWidgetName = `plugin:${plugin.filename}`;
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

                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6}>
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

                            <Grid item xs={12} sm={6}>
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
                              value={tabs.filter(tab => pluginAssignments[pluginWidgetName]?.includes(tab.id))}
                              onChange={(e, newValue) => {
                                setPluginAssignments(prev => ({
                                  ...prev,
                                  [pluginWidgetName]: newValue.map(tab => tab.id)
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Show on Tabs"
                                  placeholder="Select tabs..."
                                  helperText="Select which tabs this plugin should appear on (defaults to Home tab if none selected)"
                                />
                              )}
                              renderTags={(value, getTagProps) =>
                                value.map((option, index) => (
                                  <Chip
                                    label={option.label}
                                    {...getTagProps({ index })}
                                    sx={{ backgroundColor: 'var(--accent)', color: 'white' }}
                                  />
                                ))
                              }
                            />
                          </Box>
                        </Box>
                      );
                    })}

                    <Button variant="contained" onClick={savePluginSettings} sx={{ mt: 2 }} startIcon={<Save />}>
                      Save Plugin Settings
                    </Button>
                  </>
                )}
              </>
            )}

            {widgetsSubTab === 2 && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Manage device profiles and transfer/copy widget assignment ownership.
                </Alert>

                <Alert severity="success" sx={{ mb: 2 }}>
                  Current client GUID: {currentClientGuid}
                </Alert>

                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Device Guid</TableCell>
                        <TableCell>Update Time</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {devices.map((device) => (
                        <TableRow key={device.deviceGuid}>
                          <TableCell>{device.deviceGuid}</TableCell>
                          <TableCell>{device.updateTime}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Take over">
                              <span>
                                <IconButton
                                  aria-label="Take over"
                                  onClick={() => handleTakeOverDevice(device.deviceGuid)}
                                  size="small"
                                  disabled={isLoading}
                                >
                                  <ArrowForward fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>

                            <Tooltip title="Copy">
                              <span>
                                <IconButton
                                  aria-label="Copy"
                                  onClick={() => handleCopyDevice(device.deviceGuid)}
                                  size="small"
                                  disabled={isLoading}
                                >
                                  <ContentCopy fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>

                            <Tooltip title="Delete">
                              <span>
                                <IconButton
                                  aria-label="Delete"
                                  onClick={() => handleDeleteDevice(device.deviceGuid)}
                                  size="small"
                                  color="error"
                                  disabled={isLoading}
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                      {devices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} align="center">
                            No devices found.
                          </TableCell>
                        </TableRow>
                      )}
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
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Username"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Button
                    variant="contained"
                    onClick={saveUser}
                    disabled={!newUser.username || !newUser.email}
                    fullWidth
                    sx={{ height: '56px' }}
                  >
                    Add User
                  </Button>
                </Grid>
              </Grid>
            </Box>

            <TableContainer component={Paper}>
              <Table>
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
                      <TableCell>
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
                      <TableCell>
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
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={`${user.clam_total || 0} 🥟`}
                            color="primary"
                            size="small"
                          />
                          <TextField
                            type="number"
                            size="small"
                            sx={{ width: 80 }}
                            defaultValue={user.clam_total || 0}
                            onBlur={(e) => {
                              const newTotal = parseInt(e.target.value) || 0;
                              if (newTotal !== user.clam_total) {
                                updateUserClams(user.id, newTotal);
                              }
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
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
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs value={choresSubTab} onChange={(_, v) => setChoresSubTab(v)} size="small">
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
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Prize Name"
                    value={newPrize.name}
                    onChange={(e) => setNewPrize({ ...newPrize, name: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    fullWidth
                    label="Clam Cost"
                    type="number"
                    value={newPrize.clam_cost}
                    onChange={(e) => setNewPrize({ ...newPrize, clam_cost: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Button
                    variant="contained"
                    onClick={savePrize}
                    disabled={!newPrize.name || newPrize.clam_cost <= 0}
                    fullWidth
                    sx={{ height: '56px' }}
                  >
                    Add Prize
                  </Button>
                </Grid>
              </Grid>
            </Box>

            <List>
              {prizes.map((prize) => (
                <ListItem key={prize.id} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                  {editingPrize?.id === prize.id ? (
                    <Box sx={{ display: 'flex', gap: 2, width: '100%', alignItems: 'center' }}>
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
                        sx={{ width: 120 }}
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
                <Grid item xs={12} sm={6}>
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

                <Grid item xs={12} sm={6}>
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

      {/* APIs Tab */}
      {activeTab === 6 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>API Configuration</Typography>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Box sx={{ maxWidth: 600 }}>
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

              <TextField
                fullWidth
                label="Daily Completion Clam Reward"
                type="number"
                value={settings.daily_completion_clam_reward || '2'}
                onChange={(e) => setSettings(prev => ({ ...prev, daily_completion_clam_reward: e.target.value }))}
                sx={{ mb: 2 }}
                helperText="Number of clams awarded when a user completes all their daily chores"
                inputProps={{ min: 0, max: 100 }}
              />

              <Button
                variant="contained"
                onClick={saveAllApiSettings}
                disabled={isLoading}
                startIcon={<Save />}
                sx={{ mt: 2 }}
              >
                {isLoading ? 'Saving...' : 'Save Settings'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* User Delete Confirmation Dialog */}
      <Dialog
        open={deleteUserDialog.open}
        onClose={() => setDeleteUserDialog({ open: false, user: null })}
        maxWidth="sm"
        fullWidth
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
              <Table>
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
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {chore.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {chore.description || 'No description'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {chore.crontab || 'One-time'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={chore.visible ? 'Visible' : 'Hidden'}
                          color={chore.visible ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
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
    </Box>
  );
};

export default AdminPanel;
