import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, IconButton, Popover, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Switch, FormControlLabel, Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemText, ListItemSecondaryAction, CircularProgress, Alert, Chip } from '@mui/material';
import { Settings, Add, Delete, Edit, Refresh, ChevronLeft, ChevronRight, PlayArrow, Pause } from '@mui/icons-material';
import axios from 'axios';

const PhotoWidget = ({ transparentBackground }) => {
  const [photos, setPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [photoSources, setPhotoSources] = useState([]);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [sourceForm, setSourceForm] = useState({
    name: '',
    type: 'Immich',
    url: '',
    api_key: '',
    album_id: '',
    refresh_token: ''
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savingSource, setSavingSource] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [slideshowInterval, setSlideshowInterval] = useState(5000);

  useEffect(() => {
    fetchPhotoSources();
    fetchPhotos();
  }, []);

  // Slideshow timer
  useEffect(() => {
    if (!isPlaying || photos.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
    }, slideshowInterval);

    return () => clearInterval(timer);
  }, [isPlaying, photos.length, slideshowInterval, currentPhotoIndex]);

  const fetchPhotoSources = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photo-sources`);
      setPhotoSources(response.data);
    } catch (error) {
      console.error('Error fetching photo sources:', error);
    }
  };

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photo-items`);

      if (Array.isArray(response.data)) {
        setPhotos(response.data);
        setCurrentPhotoIndex(0);
      } else {
        setPhotos([]);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
      setError('Failed to load photos. Please configure photo sources in settings.');
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSource = () => {
    setEditingSource(null);
    setSourceForm({
      name: '',
      type: 'Immich',
      url: '',
      api_key: '',
      album_id: '',
      refresh_token: ''
    });
    setTestResult(null);
    setShowSourceDialog(true);
  };

  const handleEditSource = (source) => {
    setEditingSource(source);
    setSourceForm({
      name: source.name,
      type: source.type,
      url: source.url || '',
      api_key: '',
      album_id: source.album_id || '',
      refresh_token: ''
    });
    setTestResult(null);
    setShowSourceDialog(true);
  };

  const handleToggleSource = async (sourceId, enabled) => {
    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photo-sources/${sourceId}`, {
        enabled: !enabled
      });
      await fetchPhotoSources();
      await fetchPhotos();
    } catch (error) {
      console.error('Error toggling photo source:', error);
    }
  };

  const handleDeleteSource = async (sourceId) => {
    if (window.confirm('Are you sure you want to delete this photo source?')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photo-sources/${sourceId}`);
        await fetchPhotoSources();
        await fetchPhotos();
      } catch (error) {
        console.error('Error deleting photo source:', error);
      }
    }
  };

  const handleTestConnection = async () => {
    if (editingSource) {
      setTestingConnection(true);
      try {
        const response = await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photo-sources/${editingSource.id}/test`);
        setTestResult({ success: true, message: response.data.message });
      } catch (error) {
        setTestResult({ success: false, message: error.response?.data?.error || 'Connection failed' });
      } finally {
        setTestingConnection(false);
      }
    } else {
      setTestResult({ success: false, message: 'Please save the photo source before testing' });
    }
  };

  const handleSaveSource = async () => {
    setSavingSource(true);
    try {
      if (editingSource) {
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photo-sources/${editingSource.id}`, sourceForm);
      } else {
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photo-sources`, sourceForm);
      }
      await fetchPhotoSources();
      await fetchPhotos();
      setShowSourceDialog(false);
    } catch (error) {
      console.error('Error saving photo source:', error);
      alert('Failed to save photo source. Please try again.');
    } finally {
      setSavingSource(false);
    }
  };

  const handleSettingsClick = (event) => {
    setSettingsAnchor(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchor(null);
  };

  const handlePrevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleNextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const handleTogglePlayback = () => {
    setIsPlaying((prev) => !prev);
  };

  const currentPhoto = photos[currentPhotoIndex];

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Photos</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={handleTogglePlayback} size="small">
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton onClick={fetchPhotos} size="small" disabled={loading}>
            <Refresh />
          </IconButton>
          <IconButton onClick={handleSettingsClick} size="small">
            <Settings />
          </IconButton>
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && photos.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">No photos available. Add a photo source in settings.</Typography>
        </Box>
      )}

      {!loading && !error && photos.length > 0 && currentPhoto && (
        <Box>
          <Box sx={{ position: 'relative', height: 400, overflow: 'hidden', borderRadius: 2, mb: 2 }}>
            <img
              src={currentPhoto.url}
              alt="Photo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '8px'
              }}
              onError={(e) => {
                console.error('Image load error:', e);
                e.target.style.display = 'none';
              }}
            />

            {photos.length > 1 && (
              <>
                <IconButton
                  onClick={handlePrevPhoto}
                  sx={{
                    position: 'absolute',
                    left: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.7)' }
                  }}
                >
                  <ChevronLeft />
                </IconButton>
                <IconButton
                  onClick={handleNextPhoto}
                  sx={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.7)' }
                  }}
                >
                  <ChevronRight />
                </IconButton>
              </>
            )}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {currentPhotoIndex + 1} / {photos.length}
            </Typography>
            <Chip
              label={currentPhoto.source_name}
              size="small"
              variant="outlined"
            />
          </Box>
        </Box>
      )}

      {/* Settings Popover */}
      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={handleSettingsClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, minWidth: 300, maxWidth: 400 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold">Photo Sources</Typography>
            <Button
              startIcon={<Add />}
              onClick={handleAddSource}
              size="small"
              variant="outlined"
            >
              Add Source
            </Button>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Slideshow Speed
            </Typography>
            <Select
              fullWidth
              size="small"
              value={slideshowInterval}
              onChange={(e) => setSlideshowInterval(e.target.value)}
            >
              <MenuItem value={3000}>Fast (3s)</MenuItem>
              <MenuItem value={5000}>Normal (5s)</MenuItem>
              <MenuItem value={10000}>Slow (10s)</MenuItem>
              <MenuItem value={30000}>Very Slow (30s)</MenuItem>
            </Select>
          </Box>

          <List dense>
            {photoSources.map((source) => (
              <ListItem
                key={source.id}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1
                }}
              >
                <ListItemText
                  primary={source.name}
                  secondary={
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" component="span">{source.type}</Typography>
                      <Switch
                        edge="end"
                        size="small"
                        checked={source.enabled === 1}
                        onChange={() => handleToggleSource(source.id, source.enabled)}
                      />
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleEditSource(source)}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleDeleteSource(source.id)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
            {photoSources.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No photo sources configured
              </Typography>
            )}
          </List>
        </Box>
      </Popover>

      {/* Source Dialog */}
      <Dialog
        open={showSourceDialog}
        onClose={() => setShowSourceDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingSource ? 'Edit Photo Source' : 'Add Photo Source'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Source Name"
            value={sourceForm.name}
            onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
            margin="normal"
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Type</InputLabel>
            <Select
              value={sourceForm.type}
              onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value })}
              label="Type"
            >
              <MenuItem value="Immich">Immich</MenuItem>
              <MenuItem value="GooglePhotos">Google Photos (Coming Soon)</MenuItem>
            </Select>
          </FormControl>

          {sourceForm.type === 'Immich' && (
            <>
              <TextField
                fullWidth
                label="Immich Server URL"
                value={sourceForm.url}
                onChange={(e) => setSourceForm({ ...sourceForm, url: e.target.value })}
                margin="normal"
                placeholder="https://immich.example.com"
                helperText="Your Immich server URL"
              />
              <TextField
                fullWidth
                label="API Key"
                type="password"
                value={sourceForm.api_key}
                onChange={(e) => setSourceForm({ ...sourceForm, api_key: e.target.value })}
                margin="normal"
                helperText="Get from Immich Settings → API Keys"
              />
              <TextField
                fullWidth
                label="Album ID (Optional)"
                value={sourceForm.album_id}
                onChange={(e) => setSourceForm({ ...sourceForm, album_id: e.target.value })}
                margin="normal"
                helperText="Leave empty to show all photos"
              />
            </>
          )}

          {sourceForm.type === 'GooglePhotos' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Google Photos integration coming soon. Stay tuned!
            </Alert>
          )}

          {testResult && (
            <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
              {testResult.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          {editingSource && (
            <Button
              onClick={handleTestConnection}
              disabled={testingConnection}
              startIcon={testingConnection ? <CircularProgress size={16} /> : <Refresh />}
            >
              Test Connection
            </Button>
          )}
          <Button onClick={() => setShowSourceDialog(false)}>Cancel</Button>
          <Button
            onClick={handleSaveSource}
            variant="contained"
            disabled={savingSource || !sourceForm.name || !sourceForm.type}
          >
            {savingSource ? 'Saving...' : editingSource ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default PhotoWidget;
