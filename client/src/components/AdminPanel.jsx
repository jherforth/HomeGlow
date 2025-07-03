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
  Accordion, // New import
  AccordionSummary, // New import
  AccordionDetails, // New import
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; // New import
import DeleteIcon from '@mui/icons-material/Delete'; // New import
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
      menu: { enabled: false, transparent: false },
      enableOnscreenKeyboard: false, // Add new setting for onscreen keyboard
    };
    // Merge saved settings with defaults to ensure new properties are present
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const [users, setUsers] = useState([]); // State for users in Admin Panel

  // Function to fetch users for the Admin Panel
  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching users for Admin Panel:', err);
      // Optionally set an error state for the Admin Panel itself
    }
  };

  // Fetch users on component mount and after user-related actions
  useEffect(() => {
    fetchUsers();
  }, []);

  // Handle widget toggle changes (for both enabled and transparent)
  const handleToggleChange = (event) => {
    const { name, checked } = event.target; // name will be like 'chores.enabled', 'chores.transparent', or 'enableOnscreenKeyboard'

    let newToggles;
    if (name.includes('.')) { // It's a widget-specific setting (e.g., chores.enabled)
      const [widgetName, settingType] = name.split('.'); // Split to get widget name and setting type
      newToggles = {
        ...toggles,
        [widgetName]: {
          ...toggles[widgetName],
          [settingType]: checked,
        },
      };
    } else { // It's a global setting (e.g., enableOnscreenKeyboard)
      newToggles = {
        ...toggles,
        [name]: checked,
      };
    }

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
      fetchUsers(); // Re-fetch users after adding a new one
    } catch (error) {
      console.error('Error adding user:', error);
      setError(error.response?.data?.error || 'Failed to add user');
      setSuccess(null);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}`);
        setSuccess('User deleted successfully!');
        setError(null);
        fetchUsers(); // Re-fetch users after deletion
      } catch (error) {
        console.error('Error deleting user:', error);
        setError(error.response?.data?.error || 'Failed to delete user');
        setSuccess(null);
      }
    }
  };

  const handleResetClams = async (userId) => {
    if (window.confirm('Are you sure you want to reset this user\'s clam total to zero?')) {
      try {
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users/${userId}/clams`, { clam_total: 0 });
        setSuccess('Clam total reset successfully!');
        setError(null);
        fetchUsers(); // Re-fetch users after resetting clams
      } catch (error) {
        console.error('Error resetting clams:', error);
        setError(error.response?.data?.error || 'Failed to reset clam total');
        setSuccess(null);
      }
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

        {/* Menu Widget Toggles */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={toggles.menu.enabled} onChange={handleToggleChange} name="menu.enabled" />}
            label="Enable Menu Widget"
            className="toggle-label"
          />
          {toggles.menu.enabled && ( // Conditionally render transparency toggle
            <Box sx={{ ml: 4 }}> {/* Indent */}
              <FormControlLabel
                control={<Switch checked={toggles.menu.transparent} onChange={handleToggleChange} name="menu.transparent" />}
                label="Menu Transparent"
                className="toggle-label"
              />
            </Box>
          )}
        </Box>

        {/* Onscreen Keyboard Toggle */}
        <Box sx={{ mb: 1, mt: 2 }}> {/* Added some top margin for separation */}
          <Typography variant="subtitle1">Global Settings</Typography>
          <FormControlLabel
            control={<Switch checked={toggles.enableOnscreenKeyboard} onChange={handleToggleChange} name="enableOnscreenKeyboard" />}
            label="Enable Onscreen Keyboard"
            className="toggle-label"
          />
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
              {/* Master detailed list of tasks will go here in a later step */}
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Card>
  );
};

export default AdminPanel;
