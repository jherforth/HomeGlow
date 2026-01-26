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
  ViewQuilt
} from '@mui/icons-material';
import { ChromePicker } from 'react-color';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';

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
    fetchSettings();
    fetchUsers();
    fetchChores();
    fetchPrizes();
    fetchUploadedWidgets();
  }, []);

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
    'Plugins'
  ];

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

      {/* Plugins Tab */}
      {activeTab === 5 && (
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
    </Box>
  );
};

export default AdminPanel;
