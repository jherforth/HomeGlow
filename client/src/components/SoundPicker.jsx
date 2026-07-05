import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { PlayArrow, Stop, Upload, Delete } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { playSound, soundUrl } from '../utils/choreSound.js';

// Reusable dropdown of available chore sounds with a preview button and
// optional upload/delete controls. `value` / `onChange` carry the sound filename.
const SoundPicker = ({
  value,
  onChange,
  label = 'Sound',
  volume = 1,
  allowUpload = true,
  allowDelete = false,
  includeNoneOption = false,
  noneLabel = 'Use default',
  hideEmptyDisplay = false,
  size = 'small',
  disabled = false,
}) => {
  const [sounds, setSounds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const previewRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchSounds = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/sounds`);
      setSounds(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading sounds:', error);
      setSounds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSounds();
    return () => {
      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current = null;
      }
    };
  }, []);

  const handlePreview = () => {
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current = null;
      return;
    }
    const filename = value || sounds[0]?.filename;
    if (!filename) return;
    const audio = playSound(soundUrl(filename), volume);
    if (audio) {
      previewRef.current = audio;
      audio.addEventListener('ended', () => {
        previewRef.current = null;
      });
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${API_BASE_URL}/api/sounds/upload`, formData);
      await fetchSounds();
      const uploaded = response.data?.sound?.filename;
      if (uploaded && onChange) onChange(uploaded);
    } catch (error) {
      console.error('Error uploading sound:', error);
      alert(error.response?.data?.error || 'Failed to upload sound.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    const selected = sounds.find((s) => s.filename === value);
    if (!selected || selected.isDefault) return;
    if (!window.confirm(`Delete sound "${selected.name}"?`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/sounds/${encodeURIComponent(selected.filename)}`);
      if (onChange) onChange('');
      await fetchSounds();
    } catch (error) {
      console.error('Error deleting sound:', error);
      alert(error.response?.data?.error || 'Failed to delete sound.');
    }
  };

  const selectedSound = sounds.find((s) => s.filename === value);
  const canDelete = allowDelete && selectedSound && !selectedSound.isDefault;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <FormControl size={size} sx={{ minWidth: { xs: 120, sm: 160 }, flex: 1 }} disabled={disabled}>
        <InputLabel>{label}</InputLabel>
        <Select
          label={label}
          value={sounds.some((s) => s.filename === value) ? value : ''}
          onChange={(e) => onChange && onChange(e.target.value)}
          displayEmpty={includeNoneOption || hideEmptyDisplay}
          renderValue={(selected) => {
            if (!selected) {
              return hideEmptyDisplay ? '' : <em>{noneLabel}</em>;
            }
            const selectedOption = sounds.find((s) => s.filename === selected);
            return selectedOption ? selectedOption.name : '';
          }}
        >
          {includeNoneOption && (
            <MenuItem value="">
              <em>{noneLabel}</em>
            </MenuItem>
          )}
          {sounds.map((sound) => (
            <MenuItem key={sound.filename} value={sound.filename}>
              {sound.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Tooltip title="Preview sound">
        <span>
          <IconButton size="small" onClick={handlePreview} disabled={disabled || loading || (sounds.length === 0)}>
            {previewRef.current ? <Stop fontSize="small" /> : <PlayArrow fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>

      {allowUpload && (
        <Tooltip title="Upload a sound">
          <span>
            <IconButton size="small" onClick={handleUploadClick} disabled={disabled || uploading}>
              {uploading ? <CircularProgress size={16} /> : <Upload fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      )}

      {canDelete && (
        <Tooltip title="Delete this sound">
          <span>
            <IconButton size="small" color="error" onClick={handleDelete} disabled={disabled}>
              <Delete fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.m4a,.aac,audio/*"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
    </Box>
  );
};

export default SoundPicker;
