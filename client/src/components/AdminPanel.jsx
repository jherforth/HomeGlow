// client/src/components/AdminPanel.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Button,
  Card,
  Typography,
  TextField,
  Box,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Slider,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Radio,
  RadioGroup,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import '../index.css';
import { SketchPicker } from 'react-color';

// Helper component for Tab Panels
function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

const AdminPanel = ({ setWidgetSettings }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    profilePicture: null,
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [toggles, setToggles] = useState(() => {
    const saved = localStorage.getItem('widgetSettings');
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      menu: { enabled: false, transparent: false },
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
      darkButtonGradientEnd: '#620808',
    };
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);

  // Prizes
  const [prizes, setPrizes] = useState([]);
  const [openAddEditPrizeDialog, setOpenAddEditPrizeDialog] = useState(false);
  const [currentPrize, setCurrentPrize] = useState(null);
  const [selectedPrizeId, setSelectedPrizeId] = useState(null);
  const [clamInput, setClamInput] = useState('');

  // API settings
  const [apiSettings, setApiSettings] = useState({
    WEATHER_API_KEY: '',
    ICS_CALENDAR_URL: '',
  });

  // Color picker
  const [displayColorPicker, setDisplayColorPicker] = useState({
    lightGradientStart: false,
    lightGradientEnd: false,
    darkGradientStart: false,
    darkGradientEnd: false,
    lightButtonGradientStart: false,
    lightButtonGradientEnd: false,
    darkButtonGradientStart: false,
    darkButtonGradientEnd: false,
  });

  // Plugins state
  const [plugins, setPlugins] = useState([]);
  const [pluginUploadError, setPluginUploadError] = useState(null);
  const [pluginUploadSuccess, setPluginUploadSuccess] = useState(null);
  const [pluginUploading, setPluginUploading] = useState(false);

  // Fetch all data
  const fetchData = async () => {
    try {
      const usersResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
      const choresResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`);
      setChores(Array.isArray(choresResponse.data) ? choresResponse.data : []);
      const prizesResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`);
      setPrizes(Array.isArray(prizesResponse.data) ? prizesResponse.data : []);
      const settingsResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`);
      setApiSettings(settingsResponse.data);
    } catch (err) {
      console.error('Error fetching data for Admin Panel:', err);
    }
  };

  // Fetch plugins
  const fetchPlugins = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets`);
      setPlugins(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setPlugins([]);
    }
  };

  useEffect(() => {
    fetchData();
    fetchPlugins();
  }, []);

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  const handleToggleChange = (event) => {
    const { name, checked } = event.target;

    let newToggles;
    if (name.includes('.')) {
      const [widgetName, settingType] = name.split('.');
      newToggles = {
        ...toggles,
        [widgetName]: {
          ...toggles[widgetName],
          [settingType]: checked,
        },
      };
    } else {
      newToggles = {
        ...toggles,
        [name]: checked,
      };
    }

    setToggles(newToggles);
    setWidgetSettings(newToggles);
    localStorage.setItem('widgetSettings', JSON.stringify(newToggles));
  };

  const handleSelectChange = (event) => {
    const { name, value } = event.target;
    const newToggles = {
      ...toggles,
      [name]: value,
    };
    setToggles(newToggles);
    setWidgetSettings(newToggles);
    localStorage.setItem('widgetSettings', JSON.stringify(newToggles));
  };

  const handleSliderChange = (name) => (event, newValue) => {
    const newToggles = {
      ...toggles,
      [name]: newValue,
    };
    setToggles(newToggles);
    setWidgetSettings(newToggles);
    localStorage.setItem('widgetSettings', JSON.stringify(newToggles));
  };

  // Handle color input changes from TextField (if still used) or SketchPicker
  const handleColorChange = (name, color) => {
    const newToggles = {
      ...toggles,
      [name]: color.hex, // react-color provides a color object, we need the hex value
    };
    setToggles(newToggles);
    setWidgetSettings(newToggles);
    localStorage.setItem('widgetSettings', JSON.stringify(newToggles));
  };

  // Toggle color picker visibility
  const handleClickColorSwatch = (name) => {
    setDisplayColorPicker(prevState => ({
      ...prevState,
      [name]: !prevState[name],
    }));
  };

  // Close color picker when clicking outside
  const handleCloseColorPicker = (name) => {
    setDisplayColorPicker(prevState => ({
      ...prevState,
      [name]: false,
    }));
  };

  // NEW: Save current colors as default
  const handleSaveColorsAsDefault = () => {
    const currentSettings = JSON.parse(localStorage.getItem('widgetSettings')) || {};
    const updatedSettings = {
      ...currentSettings,
      lightGradientStart: toggles.lightGradientStart,
      lightGradientEnd: toggles.lightGradientEnd,
      darkGradientStart: toggles.darkGradientStart,
      darkGradientEnd: toggles.darkGradientEnd,
      lightButtonGradientStart: toggles.lightButtonGradientStart,
      lightButtonGradientEnd: toggles.lightButtonGradientEnd,
      darkButtonGradientStart: toggles.darkButtonGradientStart,
      darkButtonGradientEnd: toggles.darkButtonGradientEnd,
    };
    localStorage.setItem('widgetSettings', JSON.stringify(updatedSettings));
    setSuccess('Current colors saved as new defaults!');
  };

  // NEW: Reset colors to default
  const handleResetColorsToDefault = () => {
    const defaultSettings = {
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
      menu: { enabled: false, transparent: false },
      textSize: 16,
      cardSize: 300,
      cardPadding: 20,
      cardHeight: 200,
      refreshInterval: 'manual',
      enableGeoPatternBackground: false,
      enableCardShuffle: false,
      // Original hardcoded defaults for reset
      lightGradientStart: '#00ddeb',
      lightGradientEnd: '#ff6b6b',
      darkGradientStart: '#2e2767',
      darkGradientEnd: '#620808',
      lightButtonGradientStart: '#00ddeb',
      lightButtonGradientEnd: '#ff6b6b',
      darkButtonGradientStart: '#2e2767',
      darkButtonGradientEnd: '#620808',
    };
    const savedSettingsString = localStorage.getItem('widgetSettings');
    let settingsToApply;
    if (savedSettingsString) {
      // If there are saved settings, use them as the reset target
      settingsToApply = JSON.parse(savedSettingsString);
    } else {
      // If no saved settings, fall back to hardcoded defaults
      settingsToApply = defaultSettings;
    }

    setToggles(settingsToApply);
    setWidgetSettings(settingsToApply);
    localStorage.setItem('widgetSettings', JSON.stringify(settingsToApply));
    setSuccess('Colors reset to default values!');
  };

  // NEW: Prize Management Functions
  const handleOpenAddPrizeDialog = () => {
    setCurrentPrize(null);
    setOpenAddEditPrizeDialog(true);
    setError(null);
  };

  const handleOpenEditPrizeDialog = (prize) => {
    setCurrentPrize(prize);
    setOpenAddEditPrizeDialog(true);
    setError(null);
  };

  const handleCloseAddEditPrizeDialog = () => {
    setOpenAddEditPrizeDialog(false);
    setCurrentPrize(null);
    setError(null);
  };

  const handleSavePrize = async (prizeData) => {
    try {
      if (prizeData.id) {
        // Edit existing prize
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes/${prizeData.id}`, prizeData);
        setSuccess('Prize updated successfully!');
      } else {
        // Add new prize
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`, prizeData);
        setSuccess('Prize added successfully!');
      }
      setError(null);
      handleCloseAddEditPrizeDialog();
      fetchData(); // Re-fetch prizes to update the list
    } catch (err) {
      console.error('Error saving prize:', err);
      setError(err.response?.data?.error || 'Failed to save prize.');
    }
  };

  const handleDeleteSelectedPrize = async () => {
    if (!selectedPrizeId) {
      setError('Please select a prize to delete.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this prize?')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes/${selectedPrizeId}`);
        setSuccess('Prize deleted successfully!');
        setError(null);
        setSelectedPrizeId(null);
        fetchData(); // Re-fetch prizes to update the list
      } catch (err) {
        console.error('Error deleting prize:', err);
        setError(err.response?.data?.error || 'Failed to delete prize.');
      }
    }
  };

  const handleSelectPrizeForDeletion = (event) => {
    setSelectedPrizeId(parseInt(event.target.value));
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
    setSuccess(null);
  };

  // NEW: Handle API settings input change
  const handleApiSettingChange = (e) => {
    setApiSettings({ ...apiSettings, [e.target.name]: e.target.value });
  };

  // NEW: Handle saving API settings
  const handleSaveApiSettings = async () => {
    try {
      // Send each setting individually or as a batch if backend supports
      // For now, send individually as per backend POST /api/settings
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`, {
        key: 'WEATHER_API_KEY',
        value: apiSettings.WEATHER_API_KEY,
      });
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`, {
        key: 'ICS_CALENDAR_URL',
        value: apiSettings.ICS_CALENDAR_URL,
      });
      setSuccess('API settings saved successfully!');
      setError(null);
    } catch (error) {
      console.error('Error saving API settings:', error);
      setError(error.response?.data?.error || 'Failed to save API settings');
      setSuccess(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        setError('Only JPEG or PNG images are allowed');
        return;
      }
      if (file.size > 1 * 1024 * 1024) {
        setError('Image size must be less than 1MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profilePicture: reader.result });
        setError(null);
        setSuccess(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.email.trim()) {
      setError('Username and email are required');
      return;
    }
    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`, {
        username: formData.username,
        email: formData.email,
        profile_picture: formData.profilePicture,
      });
      setSuccess('User added successfully!');
      setFormData({ username: '', email: '', profilePicture: null });
      setError(null);
      fetchData();
    } catch (error) {
      console.error('Error adding user:', error);
      setError(error.response?.data?.error || 'Failed to add user');
      setSuccess(null);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user? This will also delete any associated chores.')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}`);
        setSuccess('User deleted successfully!');
        setError(null);
        fetchData();
      } catch (error) {
        console.error('Error deleting user:', error);
        setError(error.response?.data?.error || 'Failed to delete user');
        setSuccess(null);
      }
    }
  };

  const handleClamInputChange = (e) => {
    setClamInput(e.target.value);
  };

  const handleSetClams = async (userId) => {
    if (!clamInput || parseInt(clamInput) < 0) {
      setError('Please enter a valid non-negative clam value.');
      return;
    }
    if (window.confirm(`Are you sure you want to set this user's clam total to ${clamInput}?`)) {
      try {
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}/clams`, { clam_total: parseInt(clamInput) });
        setSuccess('Clam total updated successfully!');
        setError(null);
        setClamInput(''); // Clear input after successful update
        fetchData();
      } catch (error) {
        console.error('Error setting clams:', error);
        setError(error.response?.data?.error || 'Failed to set clam total');
        setSuccess(null);
      }
    }
  };

  const handleDeleteChore = async (choreId) => {
    if (window.confirm('Are you sure you want to delete this chore?')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}`);
        setSuccess('Chore deleted successfully!');
        setError(null);
        fetchData();
      } catch (error) {
        console.error('Error deleting chore:', error);
        setError(error.response?.data?.error || 'Failed to delete chore');
        setSuccess(null);
      }
    }
  };

  return (
    <Card className="card" sx={{ maxWidth: 'none', width: '100%' }}>
      <Typography variant="h6">Admin Panel</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {success && <Typography color="success.main">{success}</Typography>}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={selectedTab} onChange={handleTabChange} aria-label="admin panel tabs">
          <Tab label="Widgets" {...a11yProps(0)} />
          <Tab label="Interface" {...a11yProps(1)} />
          <Tab label="Users" {...a11yProps(2)} />
          <Tab label="Prizes" {...a11yProps(3)} />
          <Tab label="Plugins" {...a11yProps(4)} />
          <Tab label="APIs" {...a11yProps(5)} />
        </Tabs>
      </Box>

      {/* Widgets Tab */}
      <TabPanel value={selectedTab} index={0}>
        <Typography variant="subtitle1">Widget Toggles</Typography>

        {/* Chores Widget Toggles */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.chores.enabled} onChange={handleToggleChange} name="chores.enabled" />}
            label="Enable Chores Widget"
            className="toggle-label"
          />
          {toggles.chores.enabled && (
            <Box sx={{ ml: 4 }}>
              <FormControlLabel
                control={<Switch checked={toggles.chores.transparent} onChange={handleToggleChange} name="chores.transparent" />}
                label="Chores Transparent"
                className="toggle-label"
              />
            </Box>
          )}
        </Box>

        {/* Calendar Widget Toggles */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.calendar.enabled} onChange={handleToggleChange} name="calendar.enabled" />}
            label="Enable Calendar Widget"
            className="toggle-label"
          />
          {toggles.calendar.enabled && (
            <Box sx={{ ml: 4 }}>
              <FormControlLabel
                control={<Switch checked={toggles.calendar.transparent} onChange={handleToggleChange} name="calendar.transparent" />}
                label="Calendar Transparent"
                className="toggle-label"
              />
            </Box>
          )}
        </Box>

        {/* Photos Widget Toggles */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.photos.enabled} onChange={handleToggleChange} name="photos.enabled" />}
            label="Enable Photos Widget"
            className="toggle-label"
          />
          {toggles.photos.enabled && (
            <Box sx={{ ml: 4 }}>
              <FormControlLabel
                control={<Switch checked={toggles.photos.transparent} onChange={handleToggleChange} name="photos.transparent" />}
                label="Photos Transparent"
                className="toggle-label"
              />
            </Box>
          )}
        </Box>

        {/* Weather Widget Toggles */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.weather.enabled} onChange={handleToggleChange} name="weather.enabled" />}
            label="Enable Weather Widget"
            className="toggle-label"
          />
          {toggles.weather.enabled && (
            <Box sx={{ ml: 4 }}>
              <FormControlLabel
                control={<Switch checked={toggles.weather.transparent} onChange={handleToggleChange} name="weather.transparent" />}
                label="Weather Transparent"
                className="toggle-label"
              />
            </Box>
          )}
        </Box>

        {/* Menu Widget Toggles */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.menu.enabled} onChange={handleToggleChange} name="menu.enabled" />}
            label="Enable Menu Widget"
            className="toggle-label"
          />
          {toggles.menu.enabled && (
            <Box sx={{ ml: 4 }}>
              <FormControlLabel
                control={<Switch checked={toggles.menu.transparent} onChange={handleToggleChange} name="menu.transparent" />}
                label="Menu Transparent"
                className="toggle-label"
              />
            </Box>
          )}
        </Box>
      </TabPanel>

      {/* Interface Tab */}
      <TabPanel value={selectedTab} index={1}>
        <Typography variant="subtitle1" gutterBottom>Screen Refresh Options</Typography>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel id="refresh-interval-label">Refresh Interval</InputLabel>
          <Select
            labelId="refresh-interval-label"
            id="refresh-interval-select"
            value={toggles.refreshInterval}
            label="Refresh Interval"
            onChange={handleSelectChange}
            name="refreshInterval"
          >
            <MenuItem value="manual">Manual Only</MenuItem>
            <MenuItem value="1">1 Hour</MenuItem>
            <MenuItem value="3">3 Hours</MenuItem>
            <MenuItem value="6">6 Hours</MenuItem>
            <MenuItem value="9">9 Hours</MenuItem>
            <MenuItem value="12">12 Hours</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.enableGeoPatternBackground} onChange={handleToggleChange} name="enableGeoPatternBackground" />}
            label="Enable Geometric Background"
            className="toggle-label"
          />
        </Box>

        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.enableCardShuffle} onChange={handleToggleChange} name="enableCardShuffle" />}
            label="Enable Card Shuffle"
            className="toggle-label"
          />
        </Box>

        <Box sx={{ mt: 3, p: 2, borderTop: '1px solid var(--card-border)' }}>
          <Typography variant="subtitle1" gutterBottom>Display Settings</Typography>

          <Typography id="text-size-slider" gutterBottom>
            Text Size: {toggles.textSize}px
          </Typography>
          <Slider
            aria-labelledby="text-size-slider"
            value={toggles.textSize}
            onChange={handleSliderChange('textSize')}
            min={10}
            max={24}
            step={1}
            valueLabelDisplay="auto"
            sx={{ width: '90%', mb: 2 }}
          />

          <Typography id="card-size-slider" gutterBottom>
            Card Width: {toggles.cardSize}px
          </Typography>
          <Slider
            aria-labelledby="card-size-slider"
            value={toggles.cardSize}
            onChange={handleSliderChange('cardSize')}
            min={200}
            max={500}
            step={10}
            valueLabelDisplay="auto"
            sx={{ width: '90%', mb: 2 }}
          />

          <Typography id="card-padding-slider" gutterBottom>
            Card Padding: {toggles.cardPadding}px
          </Typography>
          <Slider
            aria-labelledby="card-padding-slider"
            value={toggles.cardPadding}
            onChange={handleSliderChange('cardPadding')}
            min={10}
            max={40}
            step={2}
            valueLabelDisplay="auto"
            sx={{ width: '90%', mb: 2 }}
          />
        </Box>

        {/* NEW: Color Pickers */}
        <Box sx={{ mt: 3, p: 2, borderTop: '1px solid var(--card-border)' }}>
          <Typography variant="subtitle1" gutterBottom>Custom Colors</Typography>

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Light Theme Gradients</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, position: 'relative' }}>
            <TextField
              label="Background Gradient Start (Light)"
              name="lightGradientStart"
              value={toggles.lightGradientStart}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })} // Allow direct hex input
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.lightGradientStart,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('lightGradientStart')}
            />
            {displayColorPicker.lightGradientStart && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('lightGradientStart')} />
                <SketchPicker
                  color={toggles.lightGradientStart}
                  onChange={(color) => handleColorChange('lightGradientStart', color)}
                />
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, position: 'relative' }}>
            <TextField
              label="Background Gradient End (Light)"
              name="lightGradientEnd"
              value={toggles.lightGradientEnd}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })}
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.lightGradientEnd,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('lightGradientEnd')}
            />
            {displayColorPicker.lightGradientEnd && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('lightGradientEnd')} />
                <SketchPicker
                  color={toggles.lightGradientEnd}
                  onChange={(color) => handleColorChange('lightGradientEnd', color)}
                />
              </Box>
            )}
          </Box>

          <Typography variant="subtitle2">Dark Theme Gradients</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, position: 'relative' }}>
            <TextField
              label="Background Gradient Start (Dark)"
              name="darkGradientStart"
              value={toggles.darkGradientStart}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })}
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.darkGradientStart,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('darkGradientStart')}
            />
            {displayColorPicker.darkGradientStart && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('darkGradientStart')} />
                <SketchPicker
                  color={toggles.darkGradientStart}
                  onChange={(color) => handleColorChange('darkGradientStart', color)}
                />
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, position: 'relative' }}>
            <TextField
              label="Background Gradient End (Dark)"
              name="darkGradientEnd"
              value={toggles.darkGradientEnd}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })}
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.darkGradientEnd,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('darkGradientEnd')}
            />
            {displayColorPicker.darkGradientEnd && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('darkGradientEnd')} />
                <SketchPicker
                  color={toggles.darkGradientEnd}
                  onChange={(color) => handleColorChange('darkGradientEnd', color)}
                />
              </Box>
            )}
          </Box>

          <Typography variant="subtitle2">Light Theme Button Gradients</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, position: 'relative' }}>
            <TextField
              label="Button Gradient Start (Light)"
              name="lightButtonGradientStart"
              value={toggles.lightButtonGradientStart}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })}
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.lightButtonGradientStart,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('lightButtonGradientStart')}
            />
            {displayColorPicker.lightButtonGradientStart && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('lightButtonGradientStart')} />
                <SketchPicker
                  color={toggles.lightButtonGradientStart}
                  onChange={(color) => handleColorChange('lightButtonGradientStart', color)}
                />
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, position: 'relative' }}>
            <TextField
              label="Button Gradient End (Light)"
              name="lightButtonGradientEnd"
              value={toggles.lightButtonGradientEnd}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })}
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.lightButtonGradientEnd,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('lightButtonGradientEnd')}
            />
            {displayColorPicker.lightButtonGradientEnd && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('lightButtonGradientEnd')} />
                <SketchPicker
                  color={toggles.lightButtonGradientEnd}
                  onChange={(color) => handleColorChange('lightButtonGradientEnd', color)}
                />
              </Box>
            )}
          </Box>

          <Typography variant="subtitle2">Dark Theme Button Gradients</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, position: 'relative' }}>
            <TextField
              label="Button Gradient Start (Dark)"
              name="darkButtonGradientStart"
              value={toggles.darkButtonGradientStart}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })}
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.darkButtonGradientStart,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('darkButtonGradientStart')}
            />
            {displayColorPicker.darkButtonGradientStart && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('darkButtonGradientStart')} />
                <SketchPicker
                  color={toggles.darkButtonGradientStart}
                  onChange={(color) => handleColorChange('darkButtonGradientStart', color)}
                />
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, position: 'relative' }}>
            <TextField
              label="Button Gradient End (Dark)"
              name="darkButtonGradientEnd"
              value={toggles.darkButtonGradientEnd}
              onChange={(e) => handleColorChange(e.target.name, { hex: e.target.value })}
              fullWidth
              size="small"
            />
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: toggles.darkButtonGradientEnd,
                cursor: 'pointer',
              }}
              onClick={() => handleClickColorSwatch('darkButtonGradientEnd')}
            />
            {displayColorPicker.darkButtonGradientEnd && (
              <Box sx={{ position: 'absolute', zIndex: '2', top: '100%', left: 0 }}>
                <Box sx={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={() => handleCloseColorPicker('darkButtonGradientEnd')} />
                <SketchPicker
                  color={toggles.darkButtonGradientEnd}
                  onChange={(color) => handleColorChange('darkButtonGradientEnd', color)}
                />
              </Box>
            )}
          </Box>

          <Button variant="contained" onClick={handleSaveColorsAsDefault} sx={{ mt: 2, mr: 1 }}>
            Save Colors as Default
          </Button>
          <Button variant="outlined" onClick={handleResetColorsToDefault} sx={{ mt: 2 }}>
            Reset Colors
          </Button>
        </Box>
      </TabPanel>

      {/* Users Tab */}
      <TabPanel value={selectedTab} index={2}>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
          <Typography variant="subtitle1">Add User</Typography>
          <TextField
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            label="Username"
            variant="outlined"
            size="small"
            fullWidth
            margin="normal"
          />
          <TextField
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            label="Email"
            type="email"
            variant="outlined"
            size="small"
            fullWidth
            margin="normal"
          />
          <TextField
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            variant="outlined"
            size="small"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          {formData.profilePicture && (
                        <Box sx={{ mt: 2, mb: 2 }}>
              <img
                src={formData.profilePicture}
                alt="Profile Preview"
                style={{
                  maxWidth: '100px',
                  maxHeight: '100px',
                  borderRadius: '8px',
                  border: '1px solid var(--card-border)',
                }}
              />
            </Box>
          )}
          <Button type="submit">Add User</Button>
        </Box>

        {/* Collapsible User List */}
        <Box sx={{ mt: 3, p: 2, borderTop: '1px solid var(--card-border)' }}>
          <Typography variant="subtitle1" gutterBottom>Manage Users</Typography>
          {users.length === 0 && <Typography variant="body2" color="text.secondary">No users added yet.</Typography>}
          {users.map((user) => (
            <Accordion key={user.id} sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body1" sx={{ textTransform: 'capitalize', flexGrow: 1 }}>
                  {user.username} (Clams: {user.clam_total || 0} 🥟)
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2">Email: {user.email}</Typography>
                {user.profile_picture && (
                  <Box sx={{ mt: 1, mb: 1 }}>
                    <img
                      src={user.profile_picture}
                      alt={user.username}
                      style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  </Box>
                )}
                <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                  <TextField
                    label="Set Clam Total"
                    type="number"
                    size="small"
                    value={clamInput}
                    onChange={handleClamInputChange}
                    inputProps={{ min: 0 }}
                    sx={{ width: '120px' }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => handleSetClams(user.id)}
                    size="small"
                  >
                    Set Clams
                  </Button>
                </Box>

                {/* Master detailed list of tasks for this user */}
                <Box sx={{ mt: 2, borderTop: '1px dashed rgba(0,0,0,0.1)', pt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Assigned Tasks:</Typography>
                  {chores.filter(chore => parseInt(chore.user_id) === user.id).length === 0 && (
                    <Typography variant="body2" color="text.secondary">No tasks assigned to this user.</Typography>
                  )}
                  <List dense>
                    {chores.filter(chore => parseInt(chore.user_id) === user.id).map(chore => (
                      <ListItem
                        key={chore.id}
                        secondaryAction={
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteChore(chore.id)} size="small">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        }
                      >
                        <ListItemText
                          primary={`${chore.title} (${chore.assigned_day_of_week}, ${chore.time_period})`}
                          secondary={`Repeats: ${chore.repeats} | Completed: ${chore.completed ? 'Yes' : 'No'}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </TabPanel>

      {/* Prizes Tab */}
      <TabPanel value={selectedTab} index={3}>
        <Typography variant="subtitle1" gutterBottom>Manage Prizes</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1, mb: 2 }}>
          <Button
            variant="contained"
            onClick={handleOpenAddPrizeDialog}
            sx={{
              minWidth: 'auto',
              padding: '8px 12px',
              fontSize: '1.2rem',
              lineHeight: 1,
            }}
          >
            +
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteSelectedPrize}
            disabled={!selectedPrizeId}
            sx={{
              minWidth: 'auto',
              padding: '8px 12px',
              fontSize: '1.2rem',
              lineHeight: 1,
            }}
          >
            -
          </Button>
        </Box>

        {prizes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No prizes available. Click '+' to add a prize.</Typography>
        ) : (
          <FormControl component="fieldset" fullWidth>
            <RadioGroup
              aria-label="prize-selection"
              name="prize-selection-group"
              value={selectedPrizeId}
              onChange={handleSelectPrizeForDeletion}
            >
              <List dense>
                {prizes.map((prize) => (
                  <ListItem
                    key={prize.id}
                    secondaryAction={
                      <IconButton edge="end" aria-label="edit" onClick={() => handleOpenEditPrizeDialog(prize)} size="small">
                        <EditIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <FormControlLabel
                      value={prize.id}
                      control={<Radio />}
                      label={`${prize.name} (${prize.clam_cost} 🥟)`}
                    />
                  </ListItem>
                ))}
              </List>
            </RadioGroup>
          </FormControl>
        )}

        {/* Add/Edit Prize Dialog */}
        <Dialog open={openAddEditPrizeDialog} onClose={handleCloseAddEditPrizeDialog}>
          <DialogTitle>{currentPrize ? 'Edit Prize' : 'Add New Prize'}</DialogTitle>
          <DialogContent>
            {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
            <TextField
              autoFocus
              margin="dense"
              name="name"
              label="Prize Name"
              type="text"
              fullWidth
              variant="outlined"
              value={currentPrize ? currentPrize.name : ''}
              onChange={(e) => setCurrentPrize({ ...currentPrize, name: e.target.value })}
              inputProps={{ maxLength: 100 }}
              required
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              name="clam_cost"
              label="Clam Value 🥟"
              type="number"
              fullWidth
              variant="outlined"
              value={currentPrize ? currentPrize.clam_cost : ''}
              onChange={(e) => setCurrentPrize({ ...currentPrize, clam_cost: parseInt(e.target.value) || '' })}
              inputProps={{ min: 1 }}
              required
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseAddEditPrizeDialog}>Cancel</Button>
            <Button onClick={() => handleSavePrize(currentPrize)} variant="contained">
              {currentPrize ? 'Save Changes' : 'Add Prize'}
            </Button>
          </DialogActions>
        </Dialog>
      </TabPanel>

      {/* Plugins Tab */}
      <TabPanel value={selectedTab} index={4}>
        <Typography variant="subtitle1" gutterBottom>Widget Plugins</Typography>
        <Box sx={{ mb: 2 }}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPluginUploadError(null);
              setPluginUploadSuccess(null);
              setPluginUploading(true);
              const fileInput = e.target.elements.pluginFile;
              if (!fileInput.files[0]) {
                setPluginUploadError('Please select an HTML file to upload.');
                setPluginUploading(false);
                return;
              }
              const formData = new FormData();
              formData.append('file', fileInput.files[0]);
              try {
                await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/upload`, formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                setPluginUploadSuccess('Widget uploaded successfully!');
                fetchPlugins();
                fileInput.value = '';
              } catch (err) {
                setPluginUploadError(err.response?.data?.error || 'Failed to upload widget.');
              }
              setPluginUploading(false);
            }}
          >
            <input type="file" name="pluginFile" accept=".html" style={{ marginRight: 8 }} />
            <Button type="submit" variant="contained" disabled={pluginUploading}>
              {pluginUploading ? 'Uploading...' : 'Upload Widget'}
            </Button>
          </form>
          {pluginUploadError && <Typography color="error">{pluginUploadError}</Typography>}
          {pluginUploadSuccess && <Typography color="success.main">{pluginUploadSuccess}</Typography>}
        </Box>
        <Typography variant="subtitle2" gutterBottom>Uploaded Plugins</Typography>
        {plugins.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No plugins uploaded yet.</Typography>
        ) : (
          <List dense>
            {plugins.map((plugin) => (
              <ListItem key={plugin.filename} secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={async () => {
                  if (window.confirm('Delete this plugin?')) {
                    try {
                      await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets/${plugin.filename}`);
                      fetchPlugins();
                    } catch (err) {
                      setPluginUploadError('Failed to delete plugin.');
                    }
                  }
                }}>
                  <DeleteIcon />
                </IconButton>
              }>
                <ListItemText
                  primary={plugin.name}
                  secondary={`File: ${plugin.filename}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </TabPanel>

      {/* APIs Tab */}
      <TabPanel value={selectedTab} index={5}>
        <Typography variant="subtitle1" gutterBottom>API Integrations</Typography>
        <TextField
          name="WEATHER_API_KEY"
          label="OpenWeatherMap API Key"
          variant="outlined"
          size="small"
          fullWidth
          margin="normal"
          value={apiSettings.WEATHER_API_KEY}
          onChange={handleApiSettingChange}
        />
        <TextField
          name="ICS_CALENDAR_URL"
          label="ICS Calendar URL"
          variant="outlined"
          size="small"
          fullWidth
          margin="normal"
          value={apiSettings.ICS_CALENDAR_URL}
          onChange={handleApiSettingChange}
        />
        <Button variant="contained" onClick={handleSaveApiSettings} sx={{ mt: 2 }}>
          Save API Settings
        </Button>
      </TabPanel>
    </Card>
  );
};

export default AdminPanel;

