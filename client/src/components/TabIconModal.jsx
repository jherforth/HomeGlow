import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Grid,
  Typography,
  Paper,
} from '@mui/material';
import {
  Notifications,
  Bookmark,
  Business,
  CalendarToday,
  CameraAlt,
  BarChart,
  Schedule,
  ChatBubble,
  Assignment,
  Explore,
  Email,
  InsertDriveFile,
  Folder,
  Flag,
  Diamond,
  PanTool,
  Favorite,
  AttachMoney,
  Map,
  Lightbulb,
  Image,
  Star,
  Construction,
  Delete,
  LocalDrink,
  Cloud,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import useIsMobile from '../hooks/useIsMobile.js';

// `name` is the stored icon identifier; the visible label is looked up from
// the admin namespace at render time so it translates without changing what
// gets persisted on the tab.
const availableIcons = [
  { name: 'bell', icon: Notifications },
  { name: 'bookmark', icon: Bookmark },
  { name: 'building', icon: Business },
  { name: 'bucket', icon: LocalDrink },
  { name: 'calendar', icon: CalendarToday },
  { name: 'camera', icon: CameraAlt },
  { name: 'chart', icon: BarChart },
  { name: 'chat', icon: ChatBubble },
  { name: 'clipboard', icon: Assignment },
  { name: 'clock', icon: Schedule },
  { name: 'clouds', icon: Cloud },
  { name: 'compass', icon: Explore },
  { name: 'envelope', icon: Email },
  { name: 'file', icon: InsertDriveFile },
  { name: 'flag', icon: Flag },
  { name: 'folder', icon: Folder },
  { name: 'gem', icon: Diamond },
  { name: 'hand', icon: PanTool },
  { name: 'heart', icon: Favorite },
  { name: 'image', icon: Image },
  { name: 'lightbulb', icon: Lightbulb },
  { name: 'map', icon: Map },
  { name: 'money', icon: AttachMoney },
  { name: 'shovel', icon: Construction },
  { name: 'star', icon: Star },
  { name: 'trashcan', icon: Delete },
];

const TabIconModal = ({
  open,
  onClose,
  onSave,
  // Defaults are resolved from translations below rather than inline, so a
  // caller that passes nothing still gets localized copy.
  title = null,
  saveButtonText = null,
  initialData = null,
}) => {
  const { t } = useTranslation(['admin', 'common']);
  const isMobile = useIsMobile();
  const resolvedTitle = title ?? t('admin:tabs.createTitle');
  const resolvedSaveText = saveButtonText ?? t('admin:tabs.createButton');
  const [label, setLabel] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('star');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel(initialData?.label || '');
    setSelectedIcon(initialData?.icon || 'star');
    setError('');
  }, [open, initialData]);

  const handleSave = () => {
    if (!label.trim()) {
      setError('Tab label is required');
      return;
    }

    if (label.length > 20) {
      setError('Tab label must be 20 characters or less');
      return;
    }

    onSave({
      label: label.trim(),
      icon: selectedIcon,
      show_label: false,
    });

    setLabel('');
    setSelectedIcon('star');
    setError('');
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: (event) => {
            event.preventDefault();
            handleSave();
          },
        }
      }}
    >
      <DialogTitle>
        <Typography variant="h6" component="div">
          {resolvedTitle}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <TextField
            fullWidth
            label={t('admin:tabs.tabLabel')}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError('');
            }}
            error={!!error}
            helperText={error || `${label.length}/20 characters`}
            sx={{ mb: 3 }}
            autoFocus
          />

          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
            {t('admin:tabs.selectIcon')}
          </Typography>

          <Grid container spacing={1}>
            {availableIcons.map((iconItem) => {
              const IconComponent = iconItem.icon;
              const isSelected = selectedIcon === iconItem.name;

              return (
                <Grid size={{ xs: 3, sm: 2 }} key={iconItem.name}>
                  <Paper
                    elevation={isSelected ? 8 : 1}
                    sx={{
                      p: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      minHeight: 80,
                      backgroundColor: isSelected ? 'var(--accent)' : 'var(--card-bg)',
                      color: isSelected ? 'white' : 'inherit',
                      border: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        backgroundColor: isSelected ? 'var(--accent)' : 'rgba(158, 127, 255, 0.1)',
                        transform: 'scale(1.05)',
                      },
                    }}
                    onClick={() => setSelectedIcon(iconItem.name)}
                  >
                    <IconComponent sx={{ fontSize: 32, mb: 0.5 }} />
                    <Typography variant="caption" sx={{ textAlign: 'center', fontSize: '0.7rem' }}>
                      {t(`admin:icons.${iconItem.name}`)}
                    </Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button type="button" onClick={handleClose} variant="outlined">
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" variant="contained" disabled={!label.trim()}>
          {resolvedSaveText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TabIconModal;
