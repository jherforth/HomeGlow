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
  Backdrop
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
  Warning
} from '@mui/icons-material';
import { ChromePicker } from 'react-color';
import axios from 'axios';

const AdminPanel = ({ setWidgetSettings, onWidgetUploaded }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState({
    WEATHER_API_KEY: '',
    ICS_CALENDAR_URL: '',
    PROXY_WHITELIST: ''
  });
  const [widgetSettings, setLocalWidgetSettings] = useState({
    chores: { enabled: false, transparent: false },
    calendar: { enabled: false, transparent: false },
    photos: { enabled: false, transparent: false },
    weather: { enabled: false, transparent: false },
    textSize: 16,
    cardSize: 300,
    cardPadding: 20,
    cardHeight: 200,
    refreshInterval: 'manual',
    enableGeoPatternBackground: false,
    enableCardShuffle: false,
    lightGradientStart: '#00ddeb',
    lightGradientEnd: '#ff6b6b',
    darkGradientStart: '#2e2767',
    darkGradientEnd: '#620808',
    lightButtonGradientStart: '#00ddeb',
    lightButtonGradientEnd: '#ff6b6b',
    darkButtonGradientStart: '#2e2767',
    darkButtonGradientEnd: '#620808'
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

  useEffect(() => {
    const savedSettings = localStorage.getItem('widgetSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setLocalWidgetSettings(prev => ({ ...prev, ...parsed }));
    }
    fetchSettings();
    fetchUsers();
    fetchChores();
    fetchPrizes();
    fetchUploadedWidgets();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(response.data); // Include all users including bonus user (ID 0)
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchChores = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`);
      setChores(response.data);
    } catch (error) {
      console.error('Error fetching chores:', error);
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

  const saveSetting = async (key, value) => {
    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`, { key, value });
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error(`Error saving ${key}:`, error);
    }
  };

  const saveWidgetSettings = () => {
    localStorage.setItem('widgetSettings', JSON.stringify(widgetSettings));
    setWidgetSettings(widgetSettings);
  };

  // Update the parent component's widgetSettings whenever localWidgetSettings changes
  useEffect(() => {
    setWidgetSettings(widgetSettings);
    // Save to localStorage whenever settings change
    localStorage.setItem('widgetSettings', JSON.stringify(widgetSettings));
  }, [widgetSettings, setWidgetSettings]);

  const handleWidgetToggle = (widget, field) => {
    setLocalWidgetSettings(prev => ({
      ...prev,
      [widget]: {
        ...prev[widget],
        [field]: !prev[widget][field]
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
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${editingUser.id}`, editingUser);
      } else {
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`, newUser);
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
      // First, delete all chores associated with this user
      const userChores = chores.filter(chore => chore.user_id === userId);
      for (const chore of userChores) {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${chore.id}`);
      }
      
      // Then delete the user
      await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}`);
      
      // Refresh data
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
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}/clams`, {
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
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes/${editingPrize.id}`, editingPrize);
      } else {
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`, newPrize);
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
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes/${prizeId}`);
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
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/upload`, formData, {
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
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/${filename}`);
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
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}`);
        fetchChores();
        // Update the modal with fresh data
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
        `${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}/upload-picture`,
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
        imageUrl = `${import.meta.env.VITE_REACT_APP_API_URL}/Uploads/users/${user.profile_picture}`;
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
            
            <TextField
              fullWidth
              label="OpenWeatherMap API Key"
              type="password"
              value={settings.WEATHER_API_KEY || ''}
              onChange={(e) => saveSetting('WEATHER_API_KEY', e.target.value)}
              sx={{ mb: 2 }}
              helperText="Get your free API key from openweathermap.org"
            />
            
            <TextField
              fullWidth
              label="ICS Calendar URL"
              value={settings.ICS_CALENDAR_URL || ''}
              onChange={(e) => saveSetting('ICS_CALENDAR_URL', e.target.value)}
              sx={{ mb: 2 }}
              helperText="Public ICS URL from Google Calendar or other calendar service"
            />
            
            <TextField
              fullWidth
              label="Proxy Whitelist (comma-separated domains)"
              value={settings.PROXY_WHITELIST || ''}
              onChange={(e) => saveSetting('PROXY_WHITELIST', e.target.value)}
              helperText="Domains allowed for proxy requests (e.g., api.example.com, another-api.com)"
            />
          </CardContent>
        </Card>
      )}

      {/* Widgets Tab */}
      {activeTab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Widget Settings</Typography>
            
            {Object.entries(widgetSettings).filter(([key]) => 
              ['chores', 'calendar', 'photos', 'weather'].includes(key)
            ).map(([widget, config]) => (
              <Box key={widget} sx={{ mb: 2, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, textTransform: 'capitalize' }}>
                  {widget} Widget
                </Typography>
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
              </Box>
            ))}
            
            <Button variant="contained" onClick={saveWidgetSettings} sx={{ mt: 2 }}>
              Save Widget Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Interface Tab */}
      {activeTab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Interface Customization</Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom>Display Settings</Typography>
                
                <TextField
                  fullWidth
                  label="Text Size (px)"
                  type="number"
                  value={widgetSettings.textSize}
                  onChange={(e) => handleSettingChange('textSize', parseInt(e.target.value))}
                  sx={{ mb: 2 }}
                />
                
                <TextField
                  fullWidth
                  label="Card Padding (px)"
                  type="number"
                  value={widgetSettings.cardPadding}
                  onChange={(e) => handleSettingChange('cardPadding', parseInt(e.target.value))}
                  sx={{ mb: 2 }}
                />
                
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Screen Refresh Interval</InputLabel>
                  <Select
                    value={widgetSettings.refreshInterval}
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
                      checked={widgetSettings.enableGeoPatternBackground}
                      onChange={(e) => handleSettingChange('enableGeoPatternBackground', e.target.checked)}
                    />
                  }
                  label="Enable Geometric Background Patterns"
                  sx={{ mb: 1 }}
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={widgetSettings.enableCardShuffle}
                      onChange={(e) => handleSettingChange('enableCardShuffle', e.target.checked)}
                    />
                  }
                  label="Enable Card Position Shuffle"
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom>Color Customization</Typography>
                
                {[
                  { key: 'lightGradientStart', label: 'Light Theme Gradient Start' },
                  { key: 'lightGradientEnd', label: 'Light Theme Gradient End' },
                  { key: 'darkGradientStart', label: 'Dark Theme Gradient Start' },
                  { key: 'darkGradientEnd', label: 'Dark Theme Gradient End' },
                  { key: 'lightButtonGradientStart', label: 'Light Button Gradient Start' },
                  { key: 'lightButtonGradientEnd', label: 'Light Button Gradient End' },
                  { key: 'darkButtonGradientStart', label: 'Dark Button Gradient Start' },
                  { key: 'darkButtonGradientEnd', label: 'Dark Button Gradient End' }
                ].map(({ key, label }) => (
                  <Box key={key} sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>{label}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          backgroundColor: widgetSettings[key],
                          border: '1px solid var(--card-border)',
                          borderRadius: 1,
                          cursor: 'pointer'
                        }}
                        onClick={() => setShowColorPicker(prev => ({ ...prev, [key]: !prev[key] }))}
                      />
                      <TextField
                        size="small"
                        value={widgetSettings[key]}
                        onChange={(e) => handleSettingChange(key, e.target.value)}
                        sx={{ flex: 1 }}
                      />
                    </Box>
                    {showColorPicker[key] && (
                      <Box sx={{ position: 'absolute', zIndex: 1000, mt: 1 }}>
                        <Box
                          sx={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
                          onClick={() => setShowColorPicker(prev => ({ ...prev, [key]: false }))}
                        />
                        <ChromePicker
                          color={widgetSettings[key]}
                          onChange={(color) => handleColorChange(key, color)}
                        />
                      </Box>
                    )}
                  </Box>
                ))}
              </Grid>
            </Grid>
            
            <Button variant="contained" onClick={saveWidgetSettings} sx={{ mt: 2 }}>
              Save Interface Settings
            </Button>
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

      {/* Fun Loading Indicator */}
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
          {/* Animated Clams */}
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
          
          {/* Loading Text */}
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
          
          {/* Subtle Progress Ring */}
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
