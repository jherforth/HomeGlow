import React, { useState } from 'react';
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
  FormControlLabel,
  Switch,
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
} from '@mui/icons-material';

const availableIcons = [
  { name: 'bell', icon: Notifications, label: 'Bell' },
  { name: 'bookmark', icon: Bookmark, label: 'Bookmark' },
  { name: 'building', icon: Business, label: 'Building' },
  { name: 'calendar', icon: CalendarToday, label: 'Calendar' },
  { name: 'camera', icon: CameraAlt, label: 'Camera' },
  { name: 'chart', icon: BarChart, label: 'Chart' },
  { name: 'clock', icon: Schedule, label: 'Clock' },
  { name: 'chat', icon: ChatBubble, label: 'Chat' },
  { name: 'clipboard', icon: Assignment, label: 'Clipboard' },
  { name: 'compass', icon: Explore, label: 'Compass' },
  { name: 'envelope', icon: Email, label: 'Envelope' },
  { name: 'file', icon: InsertDriveFile, label: 'File' },
  { name: 'folder', icon: Folder, label: 'Folder' },
  { name: 'flag', icon: Flag, label: 'Flag' },
  { name: 'gem', icon: Diamond, label: 'Gem' },
  { name: 'hand', icon: PanTool, label: 'Hand' },
  { name: 'heart', icon: Favorite, label: 'Heart' },
  { name: 'money', icon: AttachMoney, label: 'Money' },
  { name: 'map', icon: Map, label: 'Map' },
  { name: 'lightbulb', icon: Lightbulb, label: 'Lightbulb' },
  { name: 'image', icon: Image, label: 'Image' },
  { name: 'star', icon: Star, label: 'Star' },
];

const TabIconModal = ({ open, onClose, onSave }) => {
  const [label, setLabel] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('star');
  const [showLabel, setShowLabel] = useState(true);
  const [error, setError] = useState('');

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
      show_label: showLabel,
    });

    setLabel('');
    setSelectedIcon('star');
    setShowLabel(true);
    setError('');
  };

  const handleClose = () => {
    setLabel('');
    setSelectedIcon('star');
    setShowLabel(true);
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="div">
          Create New Tab
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <TextField
            fullWidth
            label="Tab Label"
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

          <FormControlLabel
            control={
              <Switch
                checked={showLabel}
                onChange={(e) => setShowLabel(e.target.checked)}
              />
            }
            label="Show label on tab"
            sx={{ mb: 3 }}
          />

          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
            Select an Icon
          </Typography>

          <Grid container spacing={1}>
            {availableIcons.map((iconItem) => {
              const IconComponent = iconItem.icon;
              const isSelected = selectedIcon === iconItem.name;

              return (
                <Grid item xs={3} sm={2} key={iconItem.name}>
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
                      {iconItem.label}
                    </Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} variant="outlined">
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={!label.trim()}>
          Create Tab
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TabIconModal;
