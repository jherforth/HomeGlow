import React, { useState, useEffect, useRef } from 'react';
import { Typography, Box, IconButton, Popover, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Switch, FormControlLabel, Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemText, ListItemSecondaryAction, CircularProgress, Alert, Chip } from '@mui/material';
import { Settings, Add, Delete, Edit, Refresh, ChevronLeft, ChevronRight, PlayArrow, Pause, CloudUpload } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';

const PhotoWidget = ({ refreshNonce = 0, isActive = true }) => {
  const { t } = useTranslation(['photos', 'common']);
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
  const [googleStatus, setGoogleStatus] = useState(null);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(false);
  const [pickerWaiting, setPickerWaiting] = useState(false);
  const [pickerUri, setPickerUri] = useState(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const [pickerResult, setPickerResult] = useState(null);
  const [pickedItems, setPickedItems] = useState([]);
  const [pickedLoading, setPickedLoading] = useState(false);
  const pollIntervalRef = useRef(null);
  const pollTimeoutRef = useRef(null);
  const pickerActiveRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [slideshowInterval, setSlideshowInterval] = useState(5000);
  const [photosPerView, setPhotosPerView] = useState(1);
  const [transitionType, setTransitionType] = useState('none');
  const [photoHeight, setPhotoHeight] = useState('auto');

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
      if (settings.PHOTO_WIDGET_PHOTO_SIZE) {
        const storedSize = settings.PHOTO_WIDGET_PHOTO_SIZE;
        setPhotoHeight(storedSize === 'auto' ? 'auto' : parseInt(storedSize));
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

  // Auto/manual refresh: WidgetContainer's countdown ring owns the schedule
  // and bumps refreshNonce; refetch in place instead of remounting.
  const lastRefreshNonceRef = useRef(refreshNonce);
  useEffect(() => {
    if (refreshNonce === lastRefreshNonceRef.current) return;
    lastRefreshNonceRef.current = refreshNonce;
    fetchPhotos();
  }, [refreshNonce]);

  // Slideshow timer — paused while nobody can see the widget (hidden tab or
  // photos-mode screensaver covering the dashboard).
  useEffect(() => {
    if (!isActive || !isPlaying || photos.length <= photosPerView) return;

    const timer = setInterval(() => {
      setCurrentPhotoIndex((prev) => (prev + photosPerView) % photos.length);
    }, slideshowInterval);

    return () => clearInterval(timer);
  }, [isActive, isPlaying, photos.length, slideshowInterval, currentPhotoIndex, photosPerView]);

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
    if (window.confirm(t('photos:confirm.deleteSource'))) {
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
      setTestResult({ success: false, message: t('photos:errors.saveBeforeTesting') });
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
      alert(t('photos:errors.saveFailed'));
    } finally {
      setSavingSource(false);
    }
  };

  // "5s" / "1799.969983s" → seconds as a number. Google returns picker
  // pollingConfig values as duration strings, not numbers.
  const parseDurationSeconds = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string') return null;
    const m = v.match(/^([\d.]+)s?$/);
    return m ? parseFloat(m[1]) : null;
  };

  const stopPicker = () => {
    pickerActiveRef.current = false;
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
    setPickerWaiting(false);
    setPickerUri(null);
    setPopupBlocked(false);
  };

  const fetchGoogleStatus = async () => {
    setGoogleStatusLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/connections/google/status`);
      setGoogleStatus(response.data);
    } catch (error) {
      console.error('Error fetching Google connection status:', error);
      setGoogleStatus(null);
    } finally {
      setGoogleStatusLoading(false);
    }
  };

  const fetchPickedMedia = async (sourceId) => {
    setPickedLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/photo-sources/${sourceId}/picked`);
      setPickedItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error listing picked media:', error);
      setPickedItems([]);
    } finally {
      setPickedLoading(false);
    }
  };

  const handleDeletePicked = async (mediaRowId) => {
    if (!editingSource) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/photo-sources/${editingSource.id}/picked/${mediaRowId}`);
      await fetchPickedMedia(editingSource.id);
      await fetchPhotos();
    } catch (error) {
      console.error('Error deleting picked media:', error);
    }
  };

  const ingestPickedSession = async (sourceId) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/photo-sources/${sourceId}/picker-session/ingest`);
      setPickerResult(response.data);
      await fetchPickedMedia(sourceId);
      await fetchPhotos();
    } catch (error) {
      console.error('Error ingesting picked media:', error);
      setPickerError(error.response?.data?.error || t('photos:source.googlePicker.ingestFailed'));
    }
  };

  const handleStartPicker = async () => {
    if (!editingSource) return;
    setPickerError(null);
    setPickerResult(null);
    setPickerWaiting(true);
    let session;
    try {
      const response = await axios.post(`${API_BASE_URL}/api/photo-sources/${editingSource.id}/picker-session`);
      session = response.data;
    } catch (error) {
      console.error('Error creating picker session:', error);
      setPickerWaiting(false);
      setPickerError(error.response?.data?.error || t('photos:source.googlePicker.startFailed'));
      return;
    }

    const uri = session.pickerUri;
    setPickerUri(uri);

    const opened = uri ? window.open(uri, '_blank') : null;
    if (opened) {
      // Sever the opener reference so the Google-hosted page can't script back.
      try { opened.opener = null; } catch (_) { /* cross-origin */ }
    } else {
      setPopupBlocked(true);
    }

    const pollSecs = parseDurationSeconds(session.pollingConfig?.pollInterval) || 5;
    const timeoutSecs = parseDurationSeconds(session.pollingConfig?.timeoutIn) || 1800;
    const sourceId = editingSource.id;

    pickerActiveRef.current = true;

    pollIntervalRef.current = setInterval(async () => {
      if (!pickerActiveRef.current) return;
      try {
        const poll = await axios.get(`${API_BASE_URL}/api/photo-sources/${sourceId}/picker-session`);
        if (poll.data?.mediaItemsSet && pickerActiveRef.current) {
          stopPicker();
          await ingestPickedSession(sourceId);
        }
      } catch (error) {
        console.error('Error polling picker session:', error);
      }
    }, Math.max(1, pollSecs) * 1000);

    pollTimeoutRef.current = setTimeout(() => {
      if (pickerActiveRef.current) {
        stopPicker();
        setPickerError(t('photos:source.googlePicker.timedOut'));
      }
    }, Math.max(1, timeoutSecs) * 1000);
  };

  const handleCancelPicker = async () => {
    const sourceId = editingSource?.id;
    stopPicker();
    if (sourceId) {
      try {
        await axios.delete(`${API_BASE_URL}/api/photo-sources/${sourceId}/picker-session`);
      } catch (error) {
        console.error('Error cancelling picker session:', error);
      }
    }
  };

  // Load Google status + picked media when the dialog opens on a GooglePhotos source.
  useEffect(() => {
    if (showSourceDialog && sourceForm.type === 'GooglePhotos') {
      fetchGoogleStatus();
      if (editingSource) {
        fetchPickedMedia(editingSource.id);
      } else {
        setPickedItems([]);
      }
    }
  }, [showSourceDialog, sourceForm.type, editingSource?.id]);

  // Any time the dialog closes, tear down picker state so no timer survives.
  useEffect(() => {
    if (!showSourceDialog) {
      stopPicker();
      setPickerError(null);
      setPickerResult(null);
    }
  }, [showSourceDialog]);

  useEffect(() => {
    return () => stopPicker();
  }, []);

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
          <Typography sx={{ color: 'var(--text-color)', opacity: 0.6 }}>{t('photos:widget.noPhotos')}</Typography>
        </Box>
      )}

      {!loading && !error && photos.length > 0 && currentPhotos.length > 0 && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{
            position: 'relative',
            ...(photoHeight === 'auto' ? { flex: 1, minHeight: 0 } : { height: photoHeight }),
            overflow: 'hidden',
            borderRadius: 2,
            mb: 2
          }}>
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
                    alt={t('photos:widget.photoAlt')}
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
            <Typography variant="subtitle1" fontWeight="bold">{t('photos:settings.sources')}</Typography>
            <Button
              startIcon={<Add />}
              onClick={handleAddSource}
              size="small"
              variant="outlined"
            >
              {t('photos:settings.addSource')}
            </Button>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              {t('photos:settings.photosPerView')}
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
              {t('photos:settings.photoSize')}
            </Typography>
            <Select
              fullWidth
              size="small"
              value={photoHeight}
              onChange={(e) => {
                const value = e.target.value;
                setPhotoHeight(value);
                savePreference('PHOTO_WIDGET_PHOTO_SIZE', value);
              }}
            >
              <MenuItem value="auto">{t('photos:size.auto')}</MenuItem>
              <MenuItem value={880}>{t('photos:size.extraLarge')}</MenuItem>
              <MenuItem value={720}>{t('photos:size.large')}</MenuItem>
              <MenuItem value={580}>{t('photos:size.medium')}</MenuItem>
              <MenuItem value={450}>{t('photos:size.small')}</MenuItem>
              <MenuItem value={300}>{t('photos:size.extraSmall')}</MenuItem>
            </Select>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              {t('photos:settings.transitionEffect')}
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
              <MenuItem value="fade">{t('photos:transition.fade')}</MenuItem>
              <MenuItem value="slide">{t('photos:transition.slide')}</MenuItem>
            </Select>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              {t('photos:settings.slideshowSpeed')}
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
              <MenuItem value={3000}>{t('photos:speed.fast')}</MenuItem>
              <MenuItem value={5000}>{t('photos:speed.normal')}</MenuItem>
              <MenuItem value={10000}>{t('photos:speed.slow')}</MenuItem>
              <MenuItem value={30000}>{t('photos:speed.verySlow')}</MenuItem>
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
                {t('photos:settings.noSources')}
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
        slotProps={{
          paper: {
            component: 'form',
            onSubmit: (event) => {
              event.preventDefault();
              handleSaveSource();
            },
          }
        }}
      >
        <DialogTitle>
          {editingSource ? 'Edit Photo Source' : 'Add Photo Source'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('photos:source.name')}
            value={sourceForm.name}
            onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
            margin="normal"
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>{t('photos:source.type')}</InputLabel>
            <Select
              value={sourceForm.type}
              onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value })}
              label={t('photos:source.type')}
            >
              <MenuItem value="Immich">{t('photos:source.immich')}</MenuItem>
              <MenuItem value="HomeGlowPhotos">{t('photos:source.homeglow')}</MenuItem>
              <MenuItem value="GooglePhotos">{t('photos:source.google')}</MenuItem>
            </Select>
          </FormControl>

          {sourceForm.type === 'Immich' && (
            <>
              <TextField
                fullWidth
                label={t('photos:source.immichUrl')}
                value={sourceForm.url}
                onChange={(e) => setSourceForm({ ...sourceForm, url: e.target.value })}
                margin="normal"
                placeholder="https://immich.example.com"
                helperText={t('photos:source.immichUrlPlaceholder')}
              />
              <TextField
                fullWidth
                label={t('photos:source.apiKey')}
                type="password"
                value={sourceForm.api_key}
                onChange={(e) => setSourceForm({ ...sourceForm, api_key: e.target.value })}
                margin="normal"
                helperText={t('photos:source.apiKeyHelp')}
              />
              <TextField
                fullWidth
                label={t('photos:source.albumId')}
                value={sourceForm.album_id}
                onChange={(e) => setSourceForm({ ...sourceForm, album_id: e.target.value })}
                margin="normal"
                helperText={t('photos:source.albumIdHelp')}
              />
            </>
          )}

          {sourceForm.type === 'GooglePhotos' && (
            <Box sx={{ mt: 2 }}>
              {!editingSource ? (
                <Alert severity="info">
                  {t('photos:source.saveFirst')}
                </Alert>
              ) : googleStatusLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : !googleStatus?.account ? (
                <Alert severity="warning">
                  {t('photos:source.googlePicker.noAccount')}
                </Alert>
              ) : !(googleStatus.account.scopes || '').includes('photoslibrary.readonly.appcreateddata') ? (
                <Alert severity="warning">
                  {t('photos:source.googlePicker.missingScope')}
                </Alert>
              ) : (
                <>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {t('photos:source.googlePicker.explain')}
                  </Typography>
                  {!pickerWaiting ? (
                    <Button
                      type="button"
                      variant="contained"
                      startIcon={<CloudUpload />}
                      onClick={handleStartPicker}
                    >
                      {t('photos:source.googlePicker.pickPhotos')}
                    </Button>
                  ) : (
                    <Box>
                      <Alert severity="info" sx={{ mb: 1 }}>
                        {popupBlocked && pickerUri ? (
                          <>
                            {t('photos:source.googlePicker.popupBlocked')}{' '}
                            <a href={pickerUri} target="_blank" rel="noopener noreferrer">
                              {t('photos:source.googlePicker.openManually')}
                            </a>
                          </>
                        ) : (
                          t('photos:source.googlePicker.waiting')
                        )}
                      </Alert>
                      <Button type="button" onClick={handleCancelPicker}>
                        {t('photos:source.googlePicker.cancel')}
                      </Button>
                    </Box>
                  )}

                  {pickerError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {pickerError}
                    </Alert>
                  )}
                  {pickerResult && (
                    <Alert
                      severity={pickerResult.failed > 0 ? 'warning' : 'success'}
                      sx={{ mt: 2 }}
                    >
                      {t('photos:source.googlePicker.result', pickerResult)}
                    </Alert>
                  )}

                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('photos:source.googlePicker.pickedTitle', { count: pickedItems.length })}
                    </Typography>
                    {pickedLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={20} />
                      </Box>
                    ) : pickedItems.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        {t('photos:source.googlePicker.pickedEmpty')}
                      </Typography>
                    ) : (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                          gap: 1
                        }}
                      >
                        {pickedItems.map((item) => (
                          <Box key={item.id} sx={{ position: 'relative' }}>
                            <img
                              src={`${API_BASE_URL}/api/photo-sources/${editingSource.id}/picked/${item.id}`}
                              alt={item.filename || ''}
                              style={{
                                width: '100%',
                                height: 80,
                                objectFit: 'cover',
                                borderRadius: 4,
                                display: 'block'
                              }}
                            />
                            <IconButton
                              size="small"
                              onClick={() => handleDeletePicked(item.id)}
                              sx={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                color: 'white',
                                '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.8)' }
                              }}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                </>
              )}
            </Box>
          )}

          {sourceForm.type === 'HomeGlowPhotos' && (
            <Box sx={{ mt: 2 }}>
              {!editingSource ? (
                <Alert severity="info">
                  {t('photos:source.saveFirst')}
                </Alert>
              ) : (
                <>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {t('photos:source.uploadExplain')}
                  </Typography>
                  <Button
                    type="button"
                    variant="contained"
                    startIcon={<CloudUpload />}
                    onClick={() => {
                      window.location.href = `/photos?source=${editingSource.id}`;
                    }}
                  >
                    {t('photos:source.openUploadPage')}
                  </Button>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    {t('photos:source.mobileHint')}
                  </Alert>
                </>
              )}
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
              type="button"
              onClick={handleTestConnection}
              disabled={testingConnection}
              startIcon={testingConnection ? <CircularProgress size={16} /> : <Refresh />}
            >
              {t('photos:source.testConnection')}
            </Button>
          )}
          <Button type="button" onClick={() => setShowSourceDialog(false)}>{t('common:actions.cancel')}</Button>
          <Button
            type="submit"
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
