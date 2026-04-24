import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Paper,
} from '@mui/material';
import { CloudUpload, Delete, CheckCircle, ArrowBack, PhotoLibrary } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';

const PhotosUpload = () => {
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef(null);

  const initialSourceFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('source');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  const fetchSources = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/photo-sources`);
      const homeglowSources = Array.isArray(data)
        ? data.filter((s) => s.type === 'HomeGlowPhotos')
        : [];
      setSources(homeglowSources);

      if (homeglowSources.length === 0) {
        setSelectedSourceId(null);
        return;
      }

      const preferred = initialSourceFromUrl &&
        homeglowSources.find((s) => s.id === initialSourceFromUrl)
        ? initialSourceFromUrl
        : homeglowSources[0].id;
      setSelectedSourceId((current) => current ?? preferred);
    } catch (err) {
      console.error('Failed to load photo sources', err);
      setError('Could not load photo sources.');
    }
  };

  const fetchPhotos = async (sourceId) => {
    if (!sourceId) {
      setPhotos([]);
      return;
    }
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/photo-sources/${sourceId}/uploaded`);
      setPhotos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load photos', err);
      setPhotos([]);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSources();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (selectedSourceId) fetchPhotos(selectedSourceId);
  }, [selectedSourceId]);

  const handleFilesSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0 || !selectedSourceId) return;

    setError('');
    setNotice('');
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    files.forEach((f) => formData.append('photos', f, f.name));

    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/api/photo-sources/${selectedSourceId}/uploaded`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
            }
          },
        }
      );
      const added = data?.added ?? 0;
      const failed = data?.failed ?? 0;
      setNotice(
        `Uploaded ${added} photo${added === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.`
      );
      await fetchPhotos(selectedSourceId);
    } catch (err) {
      console.error('Upload failed', err);
      setError(err?.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (photoId) => {
    if (!selectedSourceId) return;
    try {
      await axios.delete(
        `${API_BASE_URL}/api/photo-sources/${selectedSourceId}/uploaded/${photoId}`
      );
      await fetchPhotos(selectedSourceId);
    } catch (err) {
      console.error('Failed to delete photo', err);
      setError('Could not delete that photo.');
    }
  };

  const handleDone = () => {
    window.location.href = '/';
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'var(--background, #f4f4f9)',
        color: 'var(--text-, #bfbfbf)',
        px: { xs: 2, sm: 3 },
        py: { xs: 2, sm: 3 },
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          maxWidth: 720,
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={handleDone} aria-label="Back" size="small">
              <ArrowBack />
            </IconButton>
            <Typography variant="h5" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PhotoLibrary fontSize="medium" /> HomeGlow Photos
            </Typography>
          </Box>
          <Button
            onClick={handleDone}
            variant="contained"
            startIcon={<CheckCircle />}
            sx={{ borderRadius: 2 }}
          >
            Done
          </Button>
        </Box>

        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          Upload photos from this device. They will be stored locally on your HomeGlow
          server and shown in the Photos widget.
        </Typography>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && sources.length === 0 && (
          <Alert severity="info">
            No HomeGlow Photos source is configured yet. Open the Photos widget
            settings, click "Add Source", and choose "HomeGlow Photos" to create one.
          </Alert>
        )}

        {!loading && sources.length > 0 && (
          <>
            <FormControl fullWidth size="small">
              <InputLabel id="photos-source-label">Photo Source</InputLabel>
              <Select
                labelId="photos-source-label"
                label="Photo Source"
                value={selectedSourceId ?? ''}
                onChange={(e) => setSelectedSourceId(e.target.value)}
              >
                {sources.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, sm: 3 },
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 3,
                textAlign: 'center',
                background: 'var(--card-bg, rgba(255,255,255,0.6))',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleFilesSelected}
                style={{ display: 'none' }}
              />
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<CloudUpload />}
                disabled={uploading || !selectedSourceId}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  borderRadius: 2,
                  py: 1.5,
                  fontSize: '1rem',
                  textTransform: 'none',
                }}
              >
                {uploading ? 'Uploading...' : 'Upload Photos'}
              </Button>
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, opacity: 0.7 }}>
                Tap to select photos from your device. You can pick multiple at once.
              </Typography>

              {uploading && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress variant="determinate" value={uploadProgress} />
                  <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                    {uploadProgress}%
                  </Typography>
                </Box>
              )}
            </Paper>

            {error && <Alert severity="error">{error}</Alert>}
            {notice && <Alert severity="success">{notice}</Alert>}

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Uploaded Photos ({photos.length})
              </Typography>
              {photos.length === 0 ? (
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  No photos uploaded yet.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: 'repeat(2, 1fr)',
                      sm: 'repeat(3, 1fr)',
                      md: 'repeat(4, 1fr)',
                    },
                    gap: 1.25,
                  }}
                >
                  {photos.map((photo) => (
                    <Box
                      key={photo.id}
                      sx={{
                        position: 'relative',
                        aspectRatio: '1 / 1',
                        borderRadius: 2,
                        overflow: 'hidden',
                        bgcolor: 'rgba(0,0,0,0.08)',
                      }}
                    >
                      <img
                        src={`${API_BASE_URL}${photo.url}`}
                        alt={photo.original_name || 'Uploaded photo'}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(photo.id)}
                        aria-label="Delete"
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          bgcolor: 'rgba(0,0,0,0.55)',
                          color: '#fff',
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
              <Button
                onClick={handleDone}
                variant="contained"
                size="large"
                startIcon={<CheckCircle />}
                sx={{ borderRadius: 2, px: 4 }}
              >
                Done
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default PhotosUpload;
