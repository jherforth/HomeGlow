import React, { useState } from 'react';
import axios from 'axios';
import { Button, Card, Typography, TextField, Box } from '@mui/material';

const AdminPanel = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    profilePicture: null,
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Handle text input changes
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
    setSuccess(null);
  };

  // Handle file input for profile picture
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type and size (max 1MB)
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        setError('Only JPEG or PNG images are allowed');
        return;
      }
      if (file.size > 1 * 1024 * 1024) {
        setError('Image size must be less than 1MB');
        return;
      }
      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profilePicture: reader.result });
        setError(null);
        setSuccess(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.email.trim()) {
      setError('Username and email are required');
      return;
    }
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/users`, {
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
    <Card style={{ padding: '20px', width: '300px', touchAction: 'manipulation' }}>
      <Typography variant="h6">Admin Panel - Add User</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {success && <Typography color="success.main">{success}</Typography>}
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
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
              style={{ maxWidth: '100px', maxHeight: '100px' }}
            />
          </Box>
        )}
        <Button type="submit" variant="contained" fullWidth>
          Add User
        </Button>
      </Box>
    </Card>
  );
};

export default AdminPanel;