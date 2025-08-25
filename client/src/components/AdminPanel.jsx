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
  Slider,
  Grid,
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  Avatar
} from '@mui/material';
import { Delete, Edit, Add, Upload, CloudDownload, Refresh } from '@mui/icons-material';
import { ChromePicker } from 'react-color';
import axios from 'axios';

const AdminPanel = ({ setWidgetSettings, onWidgetUploaded }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState({
    chores: { enabled: false, transparent: false },
    calendar: { enabled: false, transparent: false },
    photos: { enabled: false, transparent: false },
    weather: { enabled: false, transparent: false },
    textSize: 16,
    cardPadding: 20,
    cardHeight: 200,
    refreshInterval: 'manual',
    enableGeoPatternBackground: false,
    enableCardShuffle: false,
    // Color settings
    lightGradientStart: '#00ddeb',
    lightGradientEnd: '#ff6b6b',
    darkGradientStart: '#2e2767',
    darkGradientEnd: '#620808',
    lightButtonGradientStart: '#00ddeb',
    lightButtonGradientEnd: '#ff6b6b',
    darkButtonGradientStart: '#2e2767',
    darkButtonGradientEnd: '#620808',
  });

  const [apiKeys, setApiKeys] = useState({
    WEATHER_API_KEY: '',
    ICS_CALENDAR_URL: '',
    PROXY_WHITELIST: 'calapi.inadiutorium.cz'
  });

  const [users, setUsers] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showPrizeDialog, setShowPrizeDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingPrize, setEditingPrize] = useState(null);
  const [newUser, setNewUser] = useState({ username: '', email: '', profile_picture: '' });
  const [newPrize, setNewPrize] = useState({ name: '', clam_cost: 0 });

  // Widget upload states
  const [uploadedWidgets, setUploadedWidgets] = useState([]);
  const [githubWidgets, setGithubWidgets] = useState([]);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [uploadingWidget, setUploadingWidget] = useState(false);
  const [installingWidget, setInstallingWidget] = useState(null);

  // Color picker states
  const [showColorPickers, setShowColorPickers] = useState({});

  useEffect(() => {
    const savedSettings = localStorage.getItem('widgetSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(prev => ({ ...prev, ...parsed }));
    }
    fetchApiKeys();
    fetchUsers();
    fetchPrizes();
    fetchUploadedWidgets();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`);
      setApiKeys(prev => ({ ...prev, ...response.data }));
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(response.data.filter(user => user.id !== 0)); // Exclude bonus user
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchPrizes = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`);
      setPrizes(response.data);
    } catch (error) {
      console.error('Error fetching prizes:', error);
    }
  };

  const fetchUploadedWidgets = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets`);
      setUploadedWidgets(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching uploaded widgets:', error);
      setUploadedWidgets([]);
    }
  };

  const fetchGithubWidgets = async () => {
    setLoadingGithub(true);
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/github`);
      setGithubWidgets(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching GitHub widgets:', error);
      setGithubWidgets([]);
    } finally {
      setLoadingGithub(false);
    }
  };

  const handleSettingChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('widgetSettings', JSON.stringify(newSettings));
    setWidgetSettings(newSettings);
  };

  const handleApiKeyChange = async (key, value) => {
    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`, { key, value });
      setApiKeys(prev => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error(`Error saving ${key}:`, error);
    }
  };

  const handleUserSave = async () => {
    try {
      if (editingUser) {
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${editingUser.id}`, newUser);
      } else {
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`, newUser);
      }
      fetchUsers();
      setShowUserDialog(false);
      setEditingUser(null);
      setNewUser({ username: '', email: '', profile_picture: '' });
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const handleUserDelete = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user? This will also delete all their assigned chores.')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}`);
        fetchUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user. Please try again.');
      }
    }
  };

  const handlePrizeSave = async () => {
    try {
      if (editingPrize) {
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes/${editingPrize.id}`, newPrize);
      } else {
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`, newPrize);
      }
      fetchPrizes();
      setShowPrizeDialog(false);
      setEditingPrize(null);
      setNewPrize({ name: '', clam_cost: 0 });
    } catch (error) {
      console.error('Error saving prize:', error);
    }
  };

  const handlePrizeDelete = async (prizeId) => {
    if (window.confirm('Are you sure you want to delete this prize?')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes/${prizeId}`);
        fetchPrizes();
      } catch (error) {
        console.error('Error deleting prize:', error);
      }
    }
  };

  const handleWidgetUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.html')) {
      alert('Please upload an HTML file.');
      return;
    }

    setUploadingWidget(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      fetchUploadedWidgets();
      if (onWidgetUploaded) onWidgetUploaded();
      alert('Widget uploaded successfully!');
    } catch (error) {
      console.error('Error uploading widget:', error);
      alert('Failed to upload widget.');
    } finally {
      setUploadingWidget(false);
      event.target.value = '';
    }
  };

  const handleWidgetDelete = async (filename) => {
    if (window.confirm(`Are you sure you want to delete ${filename}?`)) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/${filename}`);
        fetchUploadedWidgets();
        if (onWidgetUploaded) onWidgetUploaded();
        alert('Widget deleted successfully!');
      } catch (error) {
        console.error('Error deleting widget:', error);
        alert('Failed to delete widget.');
      }
    }
  };

  const handleGithubWidgetInstall = async (widget) => {
    setInstallingWidget(widget.filename);
    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/github/install`, {
        download_url: widget.download_url,
        filename: widget.filename,
        name: widget.name
      });
      
      fetchUploadedWidgets();
      if (onWidgetUploaded) onWidgetUploaded();
      alert(`Widget "${widget.name}" installed successfully!`);
    } catch (error) {
      console.error('Error installing GitHub widget:', error);
      alert(`Failed to install widget: ${error.response?.data?.error || error.message}`);
    } finally {
      setInstallingWidget(null);
    }
  };

  const handleColorChange = (colorKey, color) => {
    handleSettingChange(colorKey, color.hex);
  };

  const toggleColorPicker = (colorKey) => {
    setShowColorPickers(prev => ({
      ...prev,
      [colorKey]: !prev[colorKey]
    }));
  };

  const renderUserAvatar = (user) => {
    const handleImageError = (e) => {
      e.target.style.display = 'none';
      e.target.nextSibling.style.display = 'flex';
    };

    let imageUrl = null;
    if (user.profile_picture) {
      if (user.profile_picture.startsWith('data:')) {
        imageUrl = user.profile_picture;
      } else {
        imageUrl = `${import.meta.env.VITE_REACT_APP_API_URL}/Uploads/users/${user.profile_picture}`;
      }
    }

    return (
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={user.username}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--accent)',
                display: 'block'
              }}
              onError={handleImageError}
            />
            <Avatar
              sx={{
                width: 40,
                height: 40,
                bgcolor: 'var(--accent)',
                border: '2px solid var(--accent)',
                fontSize: '1rem',
                fontWeight: 'bold',
                display: 'none'
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
          </>
        ) : (
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: 'var(--accent)',
              border: '2px solid var(--accent)',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </Avatar>
        )}
      </Box>
    );
  };

  const ColorPickerButton = ({ label, colorKey, color }) => (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            backgroundColor: color,
            border: '1px solid var(--card-border)',
            borderRadius: 1,
            cursor: 'pointer'
          }}
          onClick={() => toggleColorPicker(colorKey)}
        />
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {color}
        </Typography>
      </Box>
      {showColorPickers[colorKey] && (
        <Box sx={{ position: 'absolute', zIndex: 2, mt: 1 }}>
          <Box
            sx={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
            onClick={() => toggleColorPicker(colorKey)}
          />
          <ChromePicker
            color={color}
            onChange={(color) => handleColorChange(colorKey, color)}
          />
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        Admin Panel
      </Typography>
      
      <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
        <Tab label="APIs" />
        <Tab label="Widgets" />
        <Tab label="Interface" />
        <Tab label="Users" />
        <Tab label="Prizes" />
        <Tab label="Plugins" />
      </Tabs>

      {/* APIs Tab */}
      {activeTab === 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>API Configuration</Typography>
          
          <TextField
            fullWidth
            label="OpenWeatherMap API Key"
            value={apiKeys.WEATHER_API_KEY || ''}
            onChange={(e) => handleApiKeyChange('WEATHER_API_KEY', e.target.value)}
            sx={{ mb: 2 }}
            helperText="Get your free API key from openweathermap.org"
          />
          
          <TextField
            fullWidth
            label="ICS Calendar URL"
            value={apiKeys.ICS_CALENDAR_URL || ''}
            onChange={(e) => handleApiKeyChange('ICS_CALENDAR_URL', e.target.value)}
            sx={{ mb: 2 }}
            helperText="Public ICS calendar URL (e.g., from Google Calendar)"
          />
          
          <TextField
            fullWidth
            label="Proxy Whitelist"
            value={apiKeys.PROXY_WHITELIST || ''}
            onChange={(e) => handleApiKeyChange('PROXY_WHITELIST', e.target.value)}
            sx={{ mb: 2 }}
            helperText="Comma-separated list of allowed domains for API proxy"
          />
        </Box>
      )}

      {/* Widgets Tab */}
      {activeTab === 1 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>Widget Settings</Typography>
          
          <Grid container spacing={3}>
            {Object.entries(settings).filter(([key]) => 
              ['chores', 'calendar', 'photos', 'weather'].includes(key)
            ).map(([key, value]) => (
              <Grid item xs={12} sm={6} md={3} key={key}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ textTransform: 'capitalize', mb: 2 }}>
                      {key} Widget
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={value.enabled}
                          onChange={(e) => handleSettingChange(key, { ...value, enabled: e.target.checked })}
                        />
                      }
                      label="Enabled"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={value.transparent}
                          onChange={(e) => handleSettingChange(key, { ...value, transparent: e.target.checked })}
                        />
                      }
                      label="Transparent"
                    />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Interface Tab */}
      {activeTab === 2 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>Interface Settings</Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography gutterBottom>Text Size: {settings.textSize}px</Typography>
              <Slider
                value={settings.textSize}
                onChange={(e, value) => handleSettingChange('textSize', value)}
                min={12}
                max={24}
                step={1}
                sx={{ mb: 3 }}
              />
              
              <Typography gutterBottom>Card Padding: {settings.cardPadding}px</Typography>
              <Slider
                value={settings.cardPadding}
                onChange={(e, value) => handleSettingChange('cardPadding', value)}
                min={10}
                max={40}
                step={2}
                sx={{ mb: 3 }}
              />
              
              <Typography gutterBottom>Card Height: {settings.cardHeight}px</Typography>
              <Slider
                value={settings.cardHeight}
                onChange={(e, value) => handleSettingChange('cardHeight', value)}
                min={150}
                max={400}
                step={10}
                sx={{ mb: 3 }}
              />
              
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Screen Refresh Interval</InputLabel>
                <Select
                  value={settings.refreshInterval}
                  onChange={(e) => handleSettingChange('refreshInterval', e.target.value)}
                >
                  <MenuItem value="manual">Manual Only</MenuItem>
                  <MenuItem value="1">Every 1 Hour</MenuItem>
                  <MenuItem value="3">Every 3 Hours</MenuItem>
                  <MenuItem value="6">Every 6 Hours</MenuItem>
                  <MenuItem value="9">Every 9 Hours</MenuItem>
                  <MenuItem value="12">Every 12 Hours</MenuItem>
                </Select>
              </FormControl>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.enableGeoPatternBackground}
                    onChange={(e) => handleSettingChange('enableGeoPatternBackground', e.target.checked)}
                  />
                }
                label="Enable Geometric Background Patterns"
                sx={{ mb: 2 }}
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.enableCardShuffle}
                    onChange={(e) => handleSettingChange('enableCardShuffle', e.target.checked)}
                  />
                }
                label="Enable Card Shuffle (Prevents Burn-in)"
                sx={{ mb: 2 }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Custom Colors</Typography>
              
              <Typography variant="subtitle1" gutterBottom>Light Theme</Typography>
              <ColorPickerButton
                label="Light Gradient Start"
                colorKey="lightGradientStart"
                color={settings.lightGradientStart}
              />
              <ColorPickerButton
                label="Light Gradient End"
                colorKey="lightGradientEnd"
                color={settings.lightGradientEnd}
              />
              <ColorPickerButton
                label="Light Button Gradient Start"
                colorKey="lightButtonGradientStart"
                color={settings.lightButtonGradientStart}
              />
              <ColorPickerButton
                label="Light Button Gradient End"
                colorKey="lightButtonGradientEnd"
                color={settings.lightButtonGradientEnd}
              />
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle1" gutterBottom>Dark Theme</Typography>
              <ColorPickerButton
                label="Dark Gradient Start"
                colorKey="darkGradientStart"
                color={settings.darkGradientStart}
              />
              <ColorPickerButton
                label="Dark Gradient End"
                colorKey="darkGradientEnd"
                color={settings.darkGradientEnd}
              />
              <ColorPickerButton
                label="Dark Button Gradient Start"
                colorKey="darkButtonGradientStart"
                color={settings.darkButtonGradientStart}
              />
              <ColorPickerButton
                label="Dark Button Gradient End"
                colorKey="darkButtonGradientEnd"
                color={settings.darkButtonGradientEnd}
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Users Tab */}
      {activeTab === 3 && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Users</Typography>
            <Button
              startIcon={<Add />}
              onClick={() => {
                setEditingUser(null);
                setNewUser({ username: '', email: '', profile_picture: '' });
                setShowUserDialog(true);
              }}
              variant="contained"
            >
              Add User
            </Button>
          </Box>
          
          <List>
            {users.map((user) => (
              <ListItem key={user.id} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                  {renderUserAvatar(user)}
                  <ListItemText
                    primary={user.username}
                    secondary={
                      <Box>
                        <Typography variant="body2">{user.email}</Typography>
                        <Chip
                          label={`${user.clam_total || 0} 🥟`}
                          size="small"
                          sx={{ mt: 1, bgcolor: 'var(--accent)', color: 'white' }}
                        />
                      </Box>
                    }
                  />
                </Box>
                <ListItemSecondaryAction>
                  <IconButton
                    onClick={() => {
                      setEditingUser(user);
                      setNewUser({ username: user.username, email: user.email, profile_picture: user.profile_picture });
                      setShowUserDialog(true);
                    }}
                  >
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => handleUserDelete(user.id)}>
                    <Delete />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Prizes Tab */}
      {activeTab === 4 && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Prizes</Typography>
            <Button
              startIcon={<Add />}
              onClick={() => {
                setEditingPrize(null);
                setNewPrize({ name: '', clam_cost: 0 });
                setShowPrizeDialog(true);
              }}
              variant="contained"
            >
              Add Prize
            </Button>
          </Box>
          
          <List>
            {prizes.map((prize) => (
              <ListItem key={prize.id} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                <ListItemText
                  primary={prize.name}
                  secondary={
                    <Chip
                      label={`${prize.clam_cost} 🥟`}
                      size="small"
                      sx={{ bgcolor: 'var(--accent)', color: 'white' }}
                    />
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    onClick={() => {
                      setEditingPrize(prize);
                      setNewPrize({ name: prize.name, clam_cost: prize.clam_cost });
                      setShowPrizeDialog(true);
                    }}
                  >
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => handlePrizeDelete(prize.id)}>
                    <Delete />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Plugins Tab */}
      {activeTab === 5 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>Widget Management</Typography>
          
          <Grid container spacing={3}>
            {/* Upload Widget Section */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Upload Custom Widget</Typography>
                  <Button
                    variant="contained"
                    component="label"
                    startIcon={uploadingWidget ? <CircularProgress size={20} /> : <Upload />}
                    disabled={uploadingWidget}
                    fullWidth
                    sx={{ mb: 2 }}
                  >
                    {uploadingWidget ? 'Uploading...' : 'Upload HTML Widget'}
                    <input
                      type="file"
                      hidden
                      accept=".html"
                      onChange={handleWidgetUpload}
                    />
                  </Button>
                  
                  <Typography variant="body2" color="text.secondary">
                    Upload custom HTML widgets to extend HomeGlow functionality.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            {/* GitHub Widgets Section */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">GitHub Widget Library</Typography>
                    <Button
                      startIcon={loadingGithub ? <CircularProgress size={20} /> : <Refresh />}
                      onClick={fetchGithubWidgets}
                      disabled={loadingGithub}
                    >
                      {loadingGithub ? 'Loading...' : 'Refresh'}
                    </Button>
                  </Box>
                  
                  {githubWidgets.length === 0 && !loadingGithub && (
                    <Alert severity="info">
                      Click "Refresh" to load available widgets from GitHub.
                    </Alert>
                  )}
                  
                  <List sx={{ maxHeight: 300, overflowY: 'auto' }}>
                    {githubWidgets.map((widget, index) => (
                      <ListItem key={index} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                        <ListItemText
                          primary={widget.name}
                          secondary={widget.description}
                        />
                        <ListItemSecondaryAction>
                          <Button
                            startIcon={installingWidget === widget.filename ? <CircularProgress size={16} /> : <CloudDownload />}
                            onClick={() => handleGithubWidgetInstall(widget)}
                            disabled={installingWidget === widget.filename}
                            size="small"
                          >
                            {installingWidget === widget.filename ? 'Installing...' : 'Install'}
                          </Button>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Uploaded Widgets Section */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Installed Widgets</Typography>
                  
                  {uploadedWidgets.length === 0 ? (
                    <Alert severity="info">
                      No custom widgets uploaded yet. Upload an HTML file to get started.
                    </Alert>
                  ) : (
                    <List>
                      {uploadedWidgets.map((widget, index) => (
                        <ListItem key={index} sx={{ border: '1px solid var(--card-border)', borderRadius: 1, mb: 1 }}>
                          <ListItemText
                            primary={widget.name}
                            secondary={`Filename: ${widget.filename} | Uploaded: ${new Date(widget.uploadedAt).toLocaleDateString()}`}
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              onClick={() => handleWidgetDelete(widget.filename)}
                              color="error"
                            >
                              <Delete />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* User Dialog */}
      <Dialog open={showUserDialog} onClose={() => setShowUserDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth
            label="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Profile Picture URL"
            value={newUser.profile_picture}
            onChange={(e) => setNewUser({ ...newUser, profile_picture: e.target.value })}
            helperText="Optional: URL to profile picture"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowUserDialog(false)}>Cancel</Button>
          <Button onClick={handleUserSave} variant="contained">
            {editingUser ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Prize Dialog */}
      <Dialog open={showPrizeDialog} onClose={() => setShowPrizeDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPrize ? 'Edit Prize' : 'Add Prize'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Prize Name"
            value={newPrize.name}
            onChange={(e) => setNewPrize({ ...newPrize, name: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth
            type="number"
            label="🥟 Clam Cost"
            value={newPrize.clam_cost}
            onChange={(e) => setNewPrize({ ...newPrize, clam_cost: parseInt(e.target.value) || 0 })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPrizeDialog(false)}>Cancel</Button>
          <Button onClick={handlePrizeSave} variant="contained">
            {editingPrize ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPanel;