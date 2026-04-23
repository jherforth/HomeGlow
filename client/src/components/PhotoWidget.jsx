import React, { useState, useEffect } from 'react';
import { Typography, Box, IconButton, Popover, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Switch, FormControlLabel, Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemText, ListItemSecondaryAction, CircularProgress, Alert, Chip } from '@mui/material';
import { Settings, Add, Delete, Edit, Refresh, ChevronLeft, ChevronRight, PlayArrow, Pause } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';

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
  const [googleAlbums, setGoogleAlbums] = useState([]);
  const [googleAlbumsLoading, setGoogleAlbumsLoading] = useState(false);
  const [googleAlbumsError, setGoogleAlbumsError] = useState('');
  const [googleAccountConnected, setGoogleAccountConnected] = useState(false);

  const loadGoogleAlbums = async () => {
    setGoogleAlbumsLoading(true);
    setGoogleAlbumsError('');
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/connections/google/albums`);
      setGoogleAlbums(Array.isArray(data.albums) ? data.albums : []);
      setGoogleAccountConnected(true);
    } catch (err) {
      setGoogleAlbums([]);
      if (err?.response?.status === 404) {
        setGoogleAccountConnected(false);
        setGoogleAlbumsError('No Google account connected. Add one in Admin > Connections.');
      } else {
        setGoogleAlbumsError(err?.response?.data?.error || 'Failed to load Google albums.');
      }
    } finally {
      setGoogleAlbumsLoading(false);
    }
  };

  const checkGoogleAccount = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/connections/google/status`);
      setGoogleAccountConnected(!!data?.account);
    } catch (_) {
      setGoogleAccountConnected(false);
    }
  };

  useEffect(() => {
    checkGoogleAccount();
  }, []);

  useEffect(() => {
    if (showSourceDialog && sourceForm.type === 'GooglePhotos' && googleAlbums.length === 0 && !googleAlbumsLoading) {
      loadGoogleAlbums();
    }
  }, [showSourceDialog, sourceForm.type]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [slideshowInterval, setSlideshowInterval] = useState(5000);
  const [photosPerView, setPhotosPerView] = useState(1);
  const [transitionType, setTransitionType] = useState('none');

  useEffect(() => {
    fetchPhotoSources();
    fetchPhotos();
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      // If we make it clear what we are searching for in settings, our db can be happier.
      const response = await axios.post(`${API_BASE_URL}/api/settings/search`, ['PHOTO_WIDGET_*']);
      const settings = response.data;

      if (settings.PHOTO_WIDGET_PHOTOS_PER_VIEW) {
        setPhotosPerView(parseInt(settings.PHOTO_WIDGET_PHOTOS_PER_VIEW));
      }
      if (settings.PHOTO_WIDGET_TRANSITION_TYPE) {
        setTransitionType(settings.PHOTO_WIDGET_TRANSITION_TYPE);
      }
      if (settings.PHOTO_WIDGET_SLIDESHOW_INTERVAL) {
        setSlideshowInterval(parseInt(settings.PHOTO_WIDGET_SLIDESHOW_INTERVAL));
      }
    } catch (error) {
      console.error('Error loading photo widget preferences:', error);
    }
  };

  const savePreference = async (key, value) => {
    try {
      await axios.post(`${API_BASE_URL}/api/settings`, {
        key,
        value: value.toString()
      });
    } catch (error) {
      console.error('Error saving photo widget preference:', error);
    }
  };

  // Auto-refresh functionality
  useEffect(() => {
    const widgetSettings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');
    const refreshInterval = widgetSettings.photo?.refreshInterval || 0;

    if (refreshInterval > 0) {
      console.log(`PhotoWidget: Auto-refresh enabled (${refreshInterval}ms)`);
      
      const intervalId = setInterval(() => {
        console.log('PhotoWidget: Auto-refreshing data...');
        fetchPhotos();
      }, refreshInterval);

      return () => {
        console.log('PhotoWidget: Clearing auto-refresh interval');
        clearInterval(intervalId);
      };
    }
  }, []);

  // Slideshow timer
  useEffect(() => {
    if (!isPlaying || photos.length <= photosPerView) return;

    const timer = setInterval(() => {
      setCurrentPhotoIndex((prev) => (prev + photosPerView) % photos.length);
    }, slideshowInterval);

    return () => clearInterval(timer);
  }, [isPlaying, photos.length, slideshowInterval, currentPhotoIndex, photosPerView]);

  const fetchPhotoSources = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/photo-sources`);
      setPhotoSources(response.data);
    } catch (error) {
      console.error('Error fetching photo sources:', error);
    }
  };

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${API_BASE_URL}/api/photo-items`);

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
      await axios.patch(`${API_BASE_URL}/api/photo-sources/${sourceId}`, {
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
        await axios.delete(`${API_BASE_URL}/api/photo-sources/${sourceId}`);
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
        const response = await axios.post(`${API_BASE_URL}/api/photo-sources/${editingSource.id}/test`);
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
        await axios.patch(`${API_BASE_URL}/api/photo-sources/${editingSource.id}`, sourceForm);
      } else {
        await axios.post(`${API_BASE_URL}/api/photo-sources`, sourceForm);
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
    setCurrentPhotoIndex((prev) => (prev - photosPerView + photos.length) % photos.length);
  };

  const handleNextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + photosPerView) % photos.length);
  };

  const handleTogglePlayback = () => {
    setIsPlaying((prev) => !prev);
  };

  const getCurrentPhotos = () => {
    const result = [];
    for (let i = 0; i < photosPerView; i++) {
      const index = (currentPhotoIndex + i) % photos.length;
      if (photos[index]) {
        result.push(photos[index]);
      }
    }
    return result;
  };

  const currentPhotos = getCurrentPhotos();

  return (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      p: 2
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">📷 Photos</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={handleTogglePlayback} size="small" sx={{ color: 'var(--text-color)' }}>
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton onClick={fetchPhotos} size="small" disabled={loading} sx={{ color: 'var(--text-color)' }}>
            <Refresh />
          </IconButton>
          <IconButton onClick={handleSettingsClick} size="small" sx={{ color: 'var(--text-color)' }}>
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
          <Typography sx={{ color: 'var(--text-color)', opacity: 0.6 }}>No photos available. Add a photo source in settings.</Typography>
        </Box>
      )}

      {!loading && !error && photos.length > 0 && currentPhotos.length > 0 && (
        <Box>
          <Box sx={{ position: 'relative', height: 400, overflow: 'hidden', borderRadius: 2, mb: 2 }}>
            <Box
              key={currentPhotoIndex}
              sx={{
                display: 'grid',
                gridTemplateColumns: photosPerView === 1 ? '1fr' : photosPerView === 2 ? '1fr 1fr' : '1fr 1fr 1fr',
                gap: 1,
                height: '100%',
                animation: transitionType === 'fade' ? 'fadeIn 0.5s ease-in-out' :
                          transitionType === 'slide' ? 'slideIn 0.5s ease-in-out' : 'none',
                '@keyframes fadeIn': {
                  '0%': {
                    opacity: 0,
                  },
                  '100%': {
                    opacity: 1,
                  }
                },
                '@keyframes slideIn': {
                  '0%': {
                    transform: 'translateX(100%)',
                    opacity: 0,
                  },
                  '100%': {
                    transform: 'translateX(0)',
                    opacity: 1,
                  }
                }
              }}
            >
              {currentPhotos.map((photo, index) => (
                <Box key={`${photo.id}-${index}`} sx={{ height: '100%', overflow: 'hidden', borderRadius: 1 }}>
                  <img
                    src={`${API_BASE_URL}${photo.url}`}
                    alt="Photo"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      backgroundColor: 'rgba(0, 0, 0, 0.05)'
                    }}
                    onError={(e) => {
                      console.error('Image load error:', e);
                      e.target.style.display = 'none';
                    }}
                  />
                </Box>
              ))}
            </Box>

            {photos.length > photosPerView && (
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
              {currentPhotoIndex + 1} - {Math.min(currentPhotoIndex + photosPerView, photos.length)} / {photos.length}
            </Typography>
            {currentPhotos.length === 1 && (
              <Chip
                label={currentPhotos[0].source_name}
                size="small"
                variant="outlined"
              />
            )}
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
              Photos Per View
            </Typography>
            <Select
              fullWidth
              size="small"
              value={photosPerView}
              onChange={(e) => {
                const value = e.target.value;
                setPhotosPerView(value);
                savePreference('PHOTO_WIDGET_PHOTOS_PER_VIEW', value);
              }}
            >
              <MenuItem value={1}>1 Photo</MenuItem>
              <MenuItem value={2}>2 Photos</MenuItem>
              <MenuItem value={3}>3 Photos</MenuItem>
            </Select>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Transition Effect
            </Typography>
            <Select
              fullWidth
              size="small"
              value={transitionType}
              onChange={(e) => {
                const value = e.target.value;
                setTransitionType(value);
                savePreference('PHOTO_WIDGET_TRANSITION_TYPE', value);
              }}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="fade">Fade</MenuItem>
              <MenuItem value="slide">Slide</MenuItem>
            </Select>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Slideshow Speed
            </Typography>
            <Select
              fullWidth
              size="small"
              value={slideshowInterval}
              onChange={(e) => {
                const value = e.target.value;
                setSlideshowInterval(value);
                savePreference('PHOTO_WIDGET_SLIDESHOW_INTERVAL', value);
              }}
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
              <MenuItem value="GooglePhotos" disabled={!googleAccountConnected}>
                Google Photos{googleAccountConnected ? '' : ' (connect in Admin > Connections)'}
              </MenuItem>
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
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FormControl fullWidth>
                  <InputLabel>Album</InputLabel>
                  <Select
                    value={sourceForm.album_id || ''}
                    label="Album"
                    onChange={(e) => {
                      const value = e.target.value;
                      const album = googleAlbums.find((a) => a.id === value);
                      setSourceForm({
                        ...sourceForm,
                        album_id: value,
                        name: sourceForm.name || (album ? album.title : ''),
                      });
                    }}
                  >
                    <MenuItem value="">
                      <em>All recent photos</em>
                    </MenuItem>
                    {googleAlbums.length === 0 && (
                      <MenuItem value="placeholder" disabled>
                        {googleAlbumsLoading ? 'Loading albums...' : 'No albums available'}
                      </MenuItem>
                    )}
                    {googleAlbums.map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.title}{a.shared ? ' (shared)' : ''}
                        {typeof a.mediaItemsCount === 'number' ? ` — ${a.mediaItemsCount} items` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <IconButton onClick={loadGoogleAlbums} disabled={googleAlbumsLoading}>
                  {googleAlbumsLoading ? <CircularProgress size={18} /> : <Refresh />}
                </IconButton>
              </Box>
              {googleAlbumsError && (
                <Alert severity="warning" sx={{ mt: 1 }}>{googleAlbumsError}</Alert>
              )}
              <Alert severity="info" sx={{ mt: 1 }}>
                Google deprecated the broad Photos API scope on 2025-03-31. HomeGlow now uses
                <code> photoslibrary.readonly.appcreateddata</code>, which only returns media
                created by this app or albums explicitly shared with it. If you connected
                Google earlier, open Admin &gt; Connections and click Disconnect then
                Authorize with Google again so the new scope is granted. To populate an album,
                share it into the connected account or create a new album from HomeGlow.
              </Alert>
            </Box>
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
    </Box>
  );
};

export default PhotoWidget;
