import React, { useState } from 'react';
import axios from 'axios';
import { Button, Card, Typography, TextField, Box, Switch, FormControlLabel } from '@mui/material';
import '../index.css';

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
    const defaultSettings = { // Define default structure for widget settings
      chores: { enabled: false, transparent: false },
      calendar: { enabled: false, transparent: false },
      photos: { enabled: false, transparent: false },
      weather: { enabled: false, transparent: false },
    };
    // Merge saved settings with defaults to ensure new properties are present
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });

  // Handle widget toggle changes (for both enabled and transparent)
  const handleToggleChange = (event) => {
    const { name, checked } = event.target; // name will be like 'chores.enabled' or 'chores.transparent'
    const [widgetName, settingType] = name.split('.'); // Split to get widget name and setting type

    const newToggles = {
      ...toggles,
      [widgetName]: {
        ...toggles[widgetName],
        [settingType]: checked,
      },
    };
    setToggles(newToggles);
    setWidgetSettings(newToggles); // Update parent component's state
    localStorage.setItem('widgetSettings', JSON.stringify(newToggles));
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
    } catch (error) {
      console.error('Error adding user:', error);
      setError(error.response?.data?.error || 'Failed to add user');
      setSuccess(null);
    }
  };

  return (
    <Card className="card">
      <Typography variant="h6">Admin Panel</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {success && <Typography color="success.main">{success}</Typography>}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle1">Widget Toggles</Typography>

        {/* Chores Widget Toggles */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.chores.enabled} onChange={handleToggleChange} name="chores.enabled" />}
            label="Enable Chores Widget"
            className="toggle-label"
          />
          {toggles.chores.enabled && ( // Conditionally render transparency toggle
            <Box sx={{ ml: 4 }}> {/* Indent */}
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
          {toggles.calendar.enabled && ( // Conditionally render transparency toggle
            <Box sx={{ ml: 4 }}> {/* Indent */}
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
          {toggles.photos.enabled && ( // Conditionally render transparency toggle
            <Box sx={{ ml: 4 }}> {/* Indent */}
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
          {toggles.weather.enabled && ( // Conditionally render transparency toggle
            <Box sx={{ ml: 4 }}> {/* Indent */}
              <FormControlLabel
                control={<Switch checked={toggles.weather.transparent} onChange={handleToggleChange} name="weather.transparent" />}
                label="Weather Transparent"
                className="toggle-label"
              />
            </Box>
          )}
        </Box>
      </Box>

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
          label="Profile Picture"
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
    </Card>
  );
};

export default AdminPanel;
