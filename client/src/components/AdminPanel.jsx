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
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import '../index.css';

// Import react-color SketchPicker
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
      // NEW: Color settings
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
  const [selectedTab, setSelectedTab] = useState(0); // State for selected tab

  // State for managing color picker visibility
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

  const fetchData = async () => {
    try {
      const usersResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);

      const choresResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`);
      setChores(Array.isArray(choresResponse.data) ? choresResponse.data : []);
    } catch (err) {
      console.error('Error fetching data for Admin Panel:', err);
    }
  };

  useEffect(() => {
    fetchData();
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


  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
    setSuccess(null);
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

  const handleResetClams = async (userId) => {
    if (window.confirm("Are you sure you want to reset this user's clam total to zero?")) {
      try {
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}/clams`, { clam_total: 0 });
        setSuccess('Clam total reset successfully!');
        setError(null);
        fetchData();
      } catch (error) {
        console.error('Error resetting clams:', error);
        setError(error.response?.data?.error || 'Failed to reset clam total');
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
    <Card className="card" sx={{ maxWidth: 'none', width: '100%' }}> {/* ADDED THIS SX PROP */}
      <Typography variant="h6">Admin Panel</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {success && <Typography color="success.main">{success}</Typography>}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={selectedTab} onChange={handleTabChange} aria-label="admin panel tabs">
          <Tab label="Widgets" {...a11yProps(0)} />
          <Tab label="Interface" {...a11yProps(1)} />
          <Tab label="Users" {...a11yProps(2)} />
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
                  {user.username} (Clams: {user.clam_total || 0} 🐚)
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
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => handleDeleteUser(user.id)}
                    size="small"
                  >
                    Delete User
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => handleResetClams(user.id)}
                    size="small"
                  >
                    Reset Clams
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
    </Card>
  );
};

export default AdminPanel;

