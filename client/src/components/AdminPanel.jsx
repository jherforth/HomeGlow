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
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import '../index.css';

const AdminPanel = ({ setWidgetSettings /* Removed handleFocus */ }) => {
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
      // Removed enableOnscreenKeyboard
      textSize: 16,
      cardSize: 300,
      cardPadding: 20,
      // cardHeight: 200, // Removed
    };
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);

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

  const handleToggleChange = (event) => {
    const { name, checked } = event.target;

    // console.log('AdminPanel.jsx toggles.enableOnscreenKeyboard (before change):', toggles.enableOnscreenKeyboard); // Removed log

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

    // console.log('AdminPanel.jsx newToggles.enableOnscreenKeyboard (after change):', newToggles.enableOnscreenKeyboard); // Removed log

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

        {/* Removed Onscreen Keyboard Toggle */}
      </Box>

      {/* New Sliders for Customization */}
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

        {/* Removed Card Height Slider */}
      </Box>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        <Typography variant="subtitle1">Add User</Typography>
        <TextField
          name="username"
          value={formData.username}
          onChange={handleInputChange}
          // Removed onFocus={handleFocus}
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
          // Removed onFocus={handleFocus}
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
          // Removed onFocus={handleFocus}
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
    </Card>
  );
};

export default AdminPanel;
