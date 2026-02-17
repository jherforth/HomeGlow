import React, { useState, useEffect } from 'react';
import parseExpression from 'cron-parser';
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
  Radio
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
  Lock
} from '@mui/icons-material';
import { ChromePicker } from 'react-color';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import PinModal from './PinModal';

const AdminPanel = ({ setWidgetSettings, onWidgetUploaded }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState({
    WEATHER_API_KEY: '',
    PROXY_WHITELIST: ''
  });
  const [widgetSettings, setLocalWidgetSettings] = useState({
    chores: { enabled: false, transparent: false, refreshInterval: 0 },
    calendar: { enabled: false, transparent: false, refreshInterval: 0 },
    photos: { enabled: false, transparent: false, refreshInterval: 0 },
    weather: { enabled: false, transparent: false, refreshInterval: 0, layoutMode: 'medium' },
    widgetGallery: { enabled: true, transparent: false, refreshInterval: 0 },
    // Accent colors (shared) - only these are customizable
    primary: '#9E7FFF',
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
  const [showColorPicker, setShowColorPicker] = useState({});
  const [deleteUserDialog, setDeleteUserDialog] = useState({ open: false, user: null });
  const [choreModal, setChoreModal] = useState({ open: false, user: null, userChores: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ show: false, type: '', text: '' });
  const [pinExists, setPinExists] = useState(false);
  const [pinModal, setPinModal] = useState({ open: false, mode: 'verify', title: '' });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingPin, setCheckingPin] = useState(true);

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
        widgetGallery: { enabled: true, transparent: false, refreshInterval: 0, ...parsed.widgetGallery },
        primary: parsed.primary || '#9E7FFF',
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
    }
  }, [isAuthenticated]);

  const checkPinStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
      setPinExists(response.data.exists);

      if (response.data.exists) {
        setPinModal({ open: true, mode: 'verify', title: 'Enter Admin PIN' });
      } else {
        setPinModal({ open: true, mode: 'set', title: 'Set Admin PIN' });
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
      const response = await axios.get(`${API_BASE_URL}/api/settings`);
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
      const response = await axios.get(`${API_BASE_URL}/api/chores`);
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
        axios.post(`${API_BASE_URL}/api/settings`, { key: 'PROXY_WHITELIST', value: settings.PROXY_WHITELIST || '' })
      ]);
      setSaveMessage({ show: true, type: 'success', text: 'All API settings saved successfully!' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving API settings:', error);
      setSaveMessage({ show: true, type: 'error', text: 'Failed to save some settings. Please try again.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const saveWidgetSettings = () => {
    localStorage.setItem('widgetSettings', JSON.stringify(widgetSettings));
    setWidgetSettings(widgetSettings);
    setSaveMessage({ show: true, type: 'success', text: 'Widget settings saved successfully! Refresh page to see changes.' });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
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
    
    // Apply only accent colors
    root.style.setProperty('--primary', widgetSettings.primary);
    root.style.setProperty('--secondary', widgetSettings.secondary);
    root.style.setProperty('--accent', widgetSettings.accent);
  };

  const resetToDefaults = () => {
    const defaultSettings = {
      primary: '#9E7FFF',
      secondary: '#38bdf8',
      accent: '#f472b6'
    };
    
    setLocalWidgetSettings(prev => ({ ...prev, ...defaultSettings }));
    setSaveMessage({ show: true, type: 'info', text: 'Reset to default colors. Click Save to apply.' });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
  };

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
      const userChores = chores.filter(chore => chore.user_id === userId);
      for (const chore of userChores) {
        await axios.delete(`${API_BASE_URL}/api/chores/${chore.id}`);
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
      await axios.patch(`${API_BASE_URL}/api/users/${userId}/clams`, {
        clam_total: newTotal
      });
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
      if (onWidgetUploaded) onWidgetUploaded();
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
        fetchUploadedWidgets();
        if (onWidgetUploaded) onWidgetUploaded();
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
      if (onWidgetUploaded) onWidgetUploaded();
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

  const deleteChore = async (choreId) => {
    if (window.confirm('Are you sure you want to delete this chore?')) {
      try {
        setIsLoading(true);
        await axios.delete(`${API_BASE_URL}/api/chores/${choreId}`);
        fetchChores();
        if (choreModal.user) {
          const updatedUserChores = chores.filter(chore => chore.user_id === choreModal.user.id && chore.id !== choreId);
          setChoreModal(prev => ({ ...prev, userChores: updatedUserChores }));
        }
      } catch (error) {
        console.error('Error deleting chore:', error);
        alert('Failed to delete chore. Please try again.');
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
      const response = await axios.post(
        `${API_BASE_URL}/api/users/${userId}/upload-picture`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      fetchUsers();
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderUserAvatar = (user) => {
    let imageUrl = null;
    if (user.profile_picture) {
      if (user.profile_picture.startsWith('data:')) {
        imageUrl = user.profile_picture;
      } else {
        imageUrl = `${API_BASE_URL}/Uploads/users/${user.profile_picture}`;
      }
    }

    return imageUrl ? (
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
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
    ) : (
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
          onClick={() => setShowColorPicker(prev => ({ ...prev, [key]: !prev[key] }))}
        />
        <TextField
          size="medium"
          value={widgetSettings[key]}
          onChange={(e) => handleSettingChange(key, e.target.value)}
          sx={{ flex: 1 }}
          placeholder="#000000"
        />
      </Box>
      {showColorPicker[key] && (
        <Box sx={{ position: 'relative', mt: 2 }}>
          <Box
            sx={{ 
              position: 'fixed', 
              top: 0, 
              right: 0, 
              bottom: 0, 
              left: 0,
              zIndex: 999
            }}
            onClick={() => setShowColorPicker(prev => ({ ...prev, [key]: false }))}
          />
          <Box sx={{ position: 'absolute', zIndex: 1000 }}>
            <ChromePicker
              color={widgetSettings[key]}
              onChange={(color) => handleColorChange(key, color)}
            />
          </Box>
        </Box>
      )}
    </Box>
  );

  const getRefreshIntervalLabel = (interval) => {
    const option = refreshIntervalOptions.find(opt => opt.value === interval);
    return option ? option.label : 'Disabled';
  };

  const tabs = [
    'APIs',
    'Widgets',
    'Interface',
    'Users',
    'Prizes',
    'Schedules',
    'Plugins',
    'Security'
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
        {tabs.map((tab, index) => (
          <Tab key={tab} label={tab} />
        ))}
      </Tabs>

      {/* APIs Tab */}
      {activeTab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>API Configuration</Typography>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <TextField
              fullWidth
              label="OpenWeatherMap API Key"
              type="password"
              value={settings.WEATHER_API_KEY || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, WEATHER_API_KEY: e.target.value }))}
              sx={{ mb: 2 }}
              helperText="Get your free API key from openweathermap.org"
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
              variant="contained"
              onClick={saveAllApiSettings}
              disabled={isLoading}
              startIcon={<Save />}
              sx={{ mt: 2 }}
            >
              {isLoading ? 'Saving...' : 'Save API Settings'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Widgets Tab */}
      {activeTab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Widget Settings</Typography>

            {saveMessage.show && (
              <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Alert severity="info" sx={{ mb: 2 }}>
              Enable widgets to show them on the dashboard. Click to select a widget, then drag to move or resize from corners.
            </Alert>

            {/* Core Widgets */}
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
                
                {config.refreshInterval > 0 && (
                  <Alert severity="info" sx={{ mt: 2 }} icon={<Timer />}>
                    This widget will automatically refresh every {getRefreshIntervalLabel(config.refreshInterval).toLowerCase()}
                  </Alert>
                )}
              </Box>
            ))}

            {/* Weather Widget with Layout Mode */}
            <Box sx={{ mb: 3, p: 2, border: '2px solid var(--accent)', borderRadius: 1, backgroundColor: 'rgba(158, 127, 255, 0.05)' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                🌤️ Weather Widget
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

            {/* Widget Gallery Settings */}
            <Box sx={{ mb: 2, p: 2, border: '2px solid var(--accent)', borderRadius: 1, backgroundColor: 'rgba(244, 114, 182, 0.05)' }}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
                🎨 Widget Gallery
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                The Widget Gallery displays custom uploaded widgets below the main dashboard widgets.
              </Typography>
              
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={widgetSettings.widgetGallery?.enabled || false}
                        onChange={() => handleWidgetToggle('widgetGallery', 'enabled')}
                      />
                    }
                    label="Show Widget Gallery"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={widgetSettings.widgetGallery?.transparent || false}
                        onChange={() => handleWidgetToggle('widgetGallery', 'transparent')}
                      />
                    }
                    label="Transparent Background"
                    sx={{ ml: 2 }}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="gallery-refresh-label">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Timer fontSize="small" />
                        Auto-Refresh Interval
                      </Box>
                    </InputLabel>
                    <Select
                      labelId="gallery-refresh-label"
                      value={widgetSettings.widgetGallery?.refreshInterval || 0}
                      onChange={(e) => handleRefreshIntervalChange('widgetGallery', e.target.value)}
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
              
              {widgetSettings.widgetGallery?.refreshInterval > 0 && (
                <Alert severity="info" sx={{ mt: 2 }} icon={<Timer />}>
                  Widget Gallery will automatically refresh every {getRefreshIntervalLabel(widgetSettings.widgetGallery.refreshInterval).toLowerCase()}
                </Alert>
              )}
            </Box>
            
            <Button variant="contained" onClick={saveWidgetSettings} sx={{ mt: 2 }} startIcon={<Save />}>
              Save Widget Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Interface Tab */}
      {activeTab === 2 && (
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
              Customize the accent colors used throughout the dashboard. These colors are shared between light and dark themes.
            </Alert>
            
            <Box sx={{ maxWidth: 600, mx: 'auto' }}>
              {renderColorPicker('primary', '🎨 Primary Color')}
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
          </CardContent>
        </Card>
      )}

      {/* Users Tab */}
      {activeTab === 3 && (
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
                          {renderUserAvatar(user)}
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

      {/* Schedules Tab */}
      {activeTab === 5 && <SchedulesTab apiUrl={apiUrl} users={users} />}

      {/* Plugins Tab */}
      {activeTab === 6 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Plugin Management</Typography>
            
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
          </CardContent>
        </Card>
      )}

      {/* Security Tab */}
      {activeTab === 7 && (
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

              <Box sx={{ mt: 3 }}>
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
                    <TableCell>Day</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Repeat</TableCell>
                    <TableCell>Status</TableCell>
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
                        <Chip
                          label={chore.assigned_day_of_week}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {chore.time_period.replace('-', ' ')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {chore.repeat_type.replace('-', ' ')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={chore.completed ? 'Completed' : 'Pending'}
                          color={chore.completed ? 'success' : 'default'}
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

const SchedulesTab = ({ apiUrl, users }) => {
  const [schedules, setSchedules] = useState([]);
  const [chores, setChores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [newSchedule, setNewSchedule] = useState({
    chore_id: '',
    user_id: '',
    crontab: '',
    visible: true
  });
  const [showCronHelper, setShowCronHelper] = useState(false);
  const [cronHelper, setCronHelper] = useState({
    type: 'daily',
    dayOfWeek: 0,
    dayOfMonth: 1,
    hour: 0,
    minute: 0
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  useEffect(() => {
    fetchSchedules();
    fetchChores();
  }, []);

  const fetchSchedules = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/chore-schedules`);
      const data = await response.json();
      setSchedules(data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChores = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/chores`);
      const data = await response.json();
      setChores(data);
    } catch (error) {
      console.error('Error fetching chores:', error);
    }
  };

  const buildCrontab = () => {
    const { type, dayOfWeek, dayOfMonth, hour, minute } = cronHelper;

    if (type === 'daily') {
      return `${minute} ${hour} * * *`;
    } else if (type === 'weekly') {
      return `${minute} ${hour} * * ${dayOfWeek}`;
    } else if (type === 'monthly') {
      return `${minute} ${hour} ${dayOfMonth} * *`;
    } else if (type === 'one-time') {
      return null;
    }
    return '';
  };

  const applyCronHelper = () => {
    const crontab = buildCrontab();
    if (editingSchedule) {
      setEditingSchedule({ ...editingSchedule, crontab });
    } else {
      setNewSchedule({ ...newSchedule, crontab });
    }
    setShowCronHelper(false);
  };

  const describeCrontab = (crontab) => {
    if (!crontab) return 'One-time task';

    try {
      const parts = crontab.split(' ');
      if (parts.length !== 5) return crontab;

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return 'Daily at midnight';
      }

      if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
        const day = dayNames[parseInt(dayOfWeek)] || dayOfWeek;
        return `Weekly on ${day} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }

      if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
        return `Monthly on day ${dayOfMonth} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }

      if (hour !== '*' && minute !== '*') {
        return `At ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }

      return crontab;
    } catch {
      return crontab;
    }
  };

  const saveSchedule = async () => {
    try {
      if (editingSchedule?.id) {
        await fetch(`${apiUrl}/api/chore-schedules/${editingSchedule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chore_id: editingSchedule.chore_id,
            user_id: editingSchedule.user_id || null,
            crontab: editingSchedule.crontab || null,
            visible: editingSchedule.visible
          })
        });
        setEditingSchedule(null);
      } else {
        await fetch(`${apiUrl}/api/chore-schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chore_id: newSchedule.chore_id,
            user_id: newSchedule.user_id || null,
            crontab: newSchedule.crontab || null,
            visible: newSchedule.visible
          })
        });
        setNewSchedule({ chore_id: '', user_id: '', crontab: '', visible: true });
      }
      fetchSchedules();
    } catch (error) {
      console.error('Error saving schedule:', error);
    }
  };

  const deleteSchedule = async (id) => {
    if (!confirm('Delete this schedule?')) return;

    try {
      await fetch(`${apiUrl}/api/chore-schedules/${id}`, {
        method: 'DELETE'
      });
      fetchSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  const copyScheduleToUser = async (scheduleId, targetUserId) => {
    try {
      const schedule = schedules.find(s => s.id === scheduleId);
      if (!schedule) return;

      await fetch(`${apiUrl}/api/chore-schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chore_id: schedule.chore_id,
          user_id: targetUserId || null,
          crontab: schedule.crontab || null,
          visible: schedule.visible
        })
      });
      fetchSchedules();
    } catch (error) {
      console.error('Error copying schedule:', error);
    }
  };

  const getChoreById = (id) => chores.find(c => c.id === id);
  const getUserById = (id) => users.find(u => u.id === id);

  if (loading) {
    return <Box sx={{ p: 3, textAlign: 'center' }}>Loading schedules...</Box>;
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Chore Schedules</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Manage when chores appear for each user. Use crontab expressions for flexible scheduling.
        </Typography>

        <Box sx={{ mb: 3, p: 2, backgroundColor: 'rgba(0, 0, 0, 0.05)', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>Add New Schedule</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Chore</InputLabel>
                <Select
                  value={newSchedule.chore_id}
                  onChange={(e) => setNewSchedule({ ...newSchedule, chore_id: e.target.value })}
                  label="Chore"
                >
                  {chores.map(chore => (
                    <MenuItem key={chore.id} value={chore.id}>
                      {chore.title} {chore.clam_value > 0 ? `(${chore.clam_value} 🥟)` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Assign To</InputLabel>
                <Select
                  value={newSchedule.user_id}
                  onChange={(e) => setNewSchedule({ ...newSchedule, user_id: e.target.value })}
                  label="Assign To"
                >
                  <MenuItem value="">Unassigned (Anyone)</MenuItem>
                  {users.filter(u => u.id !== 0).map(user => (
                    <MenuItem key={user.id} value={user.id}>{user.username}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Crontab (or leave empty)"
                  value={newSchedule.crontab}
                  onChange={(e) => setNewSchedule({ ...newSchedule, crontab: e.target.value })}
                  placeholder="0 0 * * *"
                />
                <IconButton
                  size="small"
                  onClick={() => setShowCronHelper(true)}
                  sx={{ border: '1px solid rgba(0,0,0,0.23)' }}
                >
                  <Add />
                </IconButton>
              </Box>
            </Grid>
            <Grid item xs={12} sm={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={newSchedule.visible}
                    onChange={(e) => setNewSchedule({ ...newSchedule, visible: e.target.checked })}
                  />
                }
                label="Visible"
              />
            </Grid>
            <Grid item xs={12} sm={1}>
              <Button
                fullWidth
                variant="contained"
                onClick={saveSchedule}
                disabled={!newSchedule.chore_id}
              >
                Add
              </Button>
            </Grid>
          </Grid>
        </Box>

        <List>
          {schedules.map((schedule) => {
            const chore = getChoreById(schedule.chore_id);
            const user = schedule.user_id ? getUserById(schedule.user_id) : null;

            if (!chore) return null;

            return (
              <ListItem
                key={schedule.id}
                sx={{
                  border: '1px solid var(--card-border)',
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: schedule.visible ? 'transparent' : 'rgba(0,0,0,0.05)'
                }}
              >
                {editingSchedule?.id === schedule.id ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} sm={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Chore</InputLabel>
                          <Select
                            value={editingSchedule.chore_id}
                            onChange={(e) => setEditingSchedule({ ...editingSchedule, chore_id: e.target.value })}
                            label="Chore"
                          >
                            {chores.map(c => (
                              <MenuItem key={c.id} value={c.id}>
                                {c.title} {c.clam_value > 0 ? `(${c.clam_value} 🥟)` : ''}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Assign To</InputLabel>
                          <Select
                            value={editingSchedule.user_id || ''}
                            onChange={(e) => setEditingSchedule({ ...editingSchedule, user_id: e.target.value })}
                            label="Assign To"
                          >
                            <MenuItem value="">Unassigned (Anyone)</MenuItem>
                            {users.filter(u => u.id !== 0).map(u => (
                              <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Crontab"
                            value={editingSchedule.crontab || ''}
                            onChange={(e) => setEditingSchedule({ ...editingSchedule, crontab: e.target.value })}
                          />
                          <IconButton
                            size="small"
                            onClick={() => { setShowCronHelper(true); }}
                            sx={{ border: '1px solid rgba(0,0,0,0.23)' }}
                          >
                            <Edit />
                          </IconButton>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={editingSchedule.visible}
                              onChange={(e) => setEditingSchedule({ ...editingSchedule, visible: e.target.checked })}
                            />
                          }
                          label="Visible"
                        />
                      </Grid>
                      <Grid item xs={12} sm={1}>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton onClick={saveSchedule} color="primary" size="small">
                            <Save />
                          </IconButton>
                          <IconButton onClick={() => setEditingSchedule(null)} size="small">
                            <Cancel />
                          </IconButton>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
                ) : (
                  <>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body1" fontWeight="bold">{chore.title}</Typography>
                          {chore.clam_value > 0 && (
                            <Chip label={`${chore.clam_value} 🥟`} size="small" color="primary" />
                          )}
                          {!schedule.visible && (
                            <Chip label="Hidden" size="small" color="default" />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            Assigned to: {user ? user.username : 'Anyone'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Schedule: {describeCrontab(schedule.crontab)}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          onClick={() => setEditingSchedule({ ...schedule })}
                          color="primary"
                          size="small"
                        >
                          <Edit />
                        </IconButton>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <Select
                            displayEmpty
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                copyScheduleToUser(schedule.id, e.target.value);
                              }
                            }}
                            renderValue={() => 'Copy to...'}
                          >
                            <MenuItem value="" disabled>Copy to user...</MenuItem>
                            {users.filter(u => u.id !== 0 && u.id !== schedule.user_id).map(u => (
                              <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <IconButton
                          onClick={() => deleteSchedule(schedule.id)}
                          color="error"
                          size="small"
                        >
                          <Delete />
                        </IconButton>
                      </Box>
                    </ListItemSecondaryAction>
                  </>
                )}
              </ListItem>
            );
          })}
        </List>

        {schedules.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No schedules yet. Add your first schedule above.
            </Typography>
          </Box>
        )}
      </CardContent>

      <Dialog open={showCronHelper} onClose={() => setShowCronHelper(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crontab Helper</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Schedule Type</InputLabel>
              <Select
                value={cronHelper.type}
                onChange={(e) => setCronHelper({ ...cronHelper, type: e.target.value })}
                label="Schedule Type"
              >
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="one-time">One-time (no repeat)</MenuItem>
              </Select>
            </FormControl>

            {cronHelper.type === 'weekly' && (
              <FormControl fullWidth>
                <InputLabel>Day of Week</InputLabel>
                <Select
                  value={cronHelper.dayOfWeek}
                  onChange={(e) => setCronHelper({ ...cronHelper, dayOfWeek: e.target.value })}
                  label="Day of Week"
                >
                  {dayNames.map((day, idx) => (
                    <MenuItem key={idx} value={idx}>{day}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {cronHelper.type === 'monthly' && (
              <FormControl fullWidth>
                <TextField
                  label="Day of Month"
                  type="number"
                  value={cronHelper.dayOfMonth}
                  onChange={(e) => setCronHelper({ ...cronHelper, dayOfMonth: parseInt(e.target.value) || 1 })}
                  inputProps={{ min: 1, max: 31 }}
                />
              </FormControl>
            )}

            {cronHelper.type !== 'one-time' && (
              <>
                <TextField
                  label="Hour (0-23)"
                  type="number"
                  value={cronHelper.hour}
                  onChange={(e) => setCronHelper({ ...cronHelper, hour: parseInt(e.target.value) || 0 })}
                  inputProps={{ min: 0, max: 23 }}
                />
                <TextField
                  label="Minute (0-59)"
                  type="number"
                  value={cronHelper.minute}
                  onChange={(e) => setCronHelper({ ...cronHelper, minute: parseInt(e.target.value) || 0 })}
                  inputProps={{ min: 0, max: 59 }}
                />
              </>
            )}

            <Box sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.05)', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight="bold">Preview:</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 1 }}>
                {buildCrontab() || 'One-time task (no crontab)'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {describeCrontab(buildCrontab())}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCronHelper(false)}>Cancel</Button>
          <Button onClick={applyCronHelper} variant="contained">Apply</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default AdminPanel;
