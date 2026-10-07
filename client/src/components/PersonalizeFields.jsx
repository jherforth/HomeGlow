import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { Delete, Upload } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import ColorPickerPopover from './ColorPickerPopover';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { GRADIENT_PRESETS, OPACITY_MIN, backgroundImageUrl } from '../utils/personalize.js';
import { resizeForBackground } from '../utils/resizeImage.js';

const swatch = (selected) => ({
  width: 56,
  height: 40,
  borderRadius: 'var(--hg-radius-sm)',
  cursor: 'pointer',
  border: selected ? '3px solid var(--accent)' : '1px solid var(--card-border)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
});

// Accent, background and card opacity: over the theme, for whichever scope
// the Appearance editor is showing. `locked` and `inheritSwitch` come from the
// editor, so these fields inherit exactly like its others.
const PersonalizeFields = ({ draft, updateDraft, locked, inheritSwitch, onError }) => {
  const { t } = useTranslation(['admin']);
  const [anchor, setAnchor] = useState({ field: null, el: null });
  const [gallery, setGallery] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const loadGallery = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/appearance/backgrounds`);
      setGallery(Array.isArray(data) ? data : []);
    } catch {
      setGallery([]);
    }
  }, []);

  useEffect(() => { void loadGallery(); }, [loadGallery]);

  const background = draft.background || { kind: 'none' };
  const backgroundLocked = locked('background');

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const resized = await resizeForBackground(file);
      const form = new FormData();
      form.append('file', resized, file.name);
      const { data } = await axios.post(`${API_BASE_URL}/api/appearance/backgrounds`, form);
      await loadGallery();
      updateDraft('background', { kind: 'image', file: data.file });
    } catch (error) {
      onError(error?.response?.data?.error || t('admin:personalize.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (file) => {
    if (!window.confirm(t('admin:personalize.confirmDeleteImage'))) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/appearance/backgrounds/${file}`);
      await loadGallery();
      if (background.kind === 'image' && background.file === file) updateDraft('background', { kind: 'none' });
    } catch (error) {
      onError(error?.response?.data?.error || t('admin:personalize.deleteFailed'));
    }
  };

  const colorBox = (field, value, onChange, disabled) => (
    <>
      <Box
        role="button"
        aria-label={t(`admin:personalize.${field}`)}
        onClick={(e) => !disabled && setAnchor(anchor.field === field ? { field: null, el: null } : { field, el: e.currentTarget })}
        sx={{ ...swatch(false), width: 48, backgroundColor: value, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}
      />
      <ColorPickerPopover
        anchorEl={anchor.field === field ? anchor.el : null}
        color={value}
        onChange={(color) => onChange(color.hex)}
        onClose={() => setAnchor({ field: null, el: null })}
      />
    </>
  );

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>{t('admin:personalize.heading')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('admin:personalize.help')}</Typography>

      <Typography variant="subtitle2">{t('admin:personalize.background')}</Typography>
      {inheritSwitch('background')}
      <ToggleButtonGroup
        exclusive
        size="small"
        value={background.kind}
        disabled={backgroundLocked}
        onChange={(_, kind) => {
          if (!kind) return;
          if (kind === 'none') updateDraft('background', { kind: 'none' });
          if (kind === 'color') updateDraft('background', { kind: 'color', color: '#1f2a44' });
          if (kind === 'gradient') updateDraft('background', { kind: 'gradient', preset: 'ocean' });
          if (kind === 'image') updateDraft('background', gallery[0] ? { kind: 'image', file: gallery[0].file } : { kind: 'image', file: null });
        }}
        sx={{ mb: 2 }}
      >
        {['none', 'color', 'gradient', 'image'].map((kind) => (
          <ToggleButton key={kind} value={kind}>{t(`admin:personalize.kinds.${kind}`)}</ToggleButton>
        ))}
      </ToggleButtonGroup>

      {background.kind === 'color' && (
        <Box sx={{ mb: 3 }}>
          {colorBox('backgroundColor', background.color, (hex) => updateDraft('background', { kind: 'color', color: hex }), backgroundLocked)}
        </Box>
      )}

      {background.kind === 'gradient' && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
          {Object.entries(GRADIENT_PRESETS).map(([id, css]) => (
            <Tooltip key={id} title={t(`admin:personalize.gradients.${id}`)}>
              <Box
                role="button"
                aria-label={t(`admin:personalize.gradients.${id}`)}
                onClick={() => !backgroundLocked && updateDraft('background', { kind: 'gradient', preset: id })}
                sx={{ ...swatch(background.preset === id), backgroundImage: css }}
              />
            </Tooltip>
          ))}
        </Box>
      )}

      {background.kind === 'image' && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
            {gallery.map((entry) => (
              <Box key={entry.file} sx={{ position: 'relative' }}>
                <Box
                  role="button"
                  aria-label={t('admin:personalize.useImage')}
                  onClick={() => !backgroundLocked && updateDraft('background', { kind: 'image', file: entry.file })}
                  sx={{ ...swatch(background.file === entry.file), width: 96, height: 60, backgroundImage: `url("${backgroundImageUrl(entry.file)}")` }}
                />
                {!backgroundLocked && (
                  <IconButton
                    size="small"
                    aria-label={t('admin:personalize.deleteImage')}
                    onClick={() => remove(entry.file)}
                    sx={{ position: 'absolute', top: -10, right: -10, bgcolor: 'var(--card-bg)', '&:hover': { bgcolor: 'var(--card-bg)' } }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
          {!gallery.length && <Alert severity="info" sx={{ mb: 1.5 }}>{t('admin:personalize.noImages')}</Alert>}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <Button variant="outlined" startIcon={<Upload />} disabled={backgroundLocked || uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? t('admin:personalize.uploading') : t('admin:personalize.uploadImage')}
          </Button>
        </Box>
      )}

      <Typography variant="subtitle2">{t('admin:personalize.cardOpacity')}</Typography>
      {inheritSwitch('cardOpacity')}
      <Box sx={{ px: 3, maxWidth: 460 }}>
        <Slider
          value={Math.round((draft.cardOpacity ?? 1) * 100)}
          min={Math.round(OPACITY_MIN * 100)}
          max={100}
          step={5}
          disabled={locked('cardOpacity')}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          // Say which end is which: the number alone doesn't.
          marks={[
            { value: Math.round(OPACITY_MIN * 100), label: t('admin:personalize.seeThrough') },
            { value: 100, label: t('admin:personalize.solid') },
          ]}
          onChange={(_, v) => updateDraft('cardOpacity', v / 100)}
          aria-label={t('admin:personalize.cardOpacity')}
        />
      </Box>
    </Box>
  );
};

export default PersonalizeFields;
