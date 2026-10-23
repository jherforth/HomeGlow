import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Alert, CircularProgress, List, ListItem, ListItemText, Paper, Switch, TextField, Stack,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import { CloudUpload, Refresh, Schedule, SettingsBackupRestore, Key } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import PinModal from './PinModal';

// Google Drive backup, as part of Backup & restore (BackupRestoreSection, in
// System → Connections; shown once a Google account is connected). Nightly or
// on-demand backups to Drive, and a restore from any of them. Where a restore
// stands (staged, restart, roll back) is shown once for the whole box, by
// BackupRestoreSection; this part reads it as `restore` and says when it
// staged one (`onRestoreChanged`).
export default function GoogleDriveBackupSection({ restore = {}, onRestoreChanged }) {
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState(null);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [backupTime, setBackupTime] = useState('02:00');
  const [timezone, setTimezone] = useState('');

  const [confirmFile, setConfirmFile] = useState(null);

  const fetchConfigAndBackups = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/backup/drive/status`),
        axios.get(`${API_BASE_URL}/api/backup/drive/list`).catch(() => ({ data: { files: [] } }))
      ]);
      setAutoEnabled(statusRes.data.autoEnabled ?? false);
      setBackupTime(statusRes.data.backupTime || '02:00');
      setTimezone(statusRes.data.serverTimezone || '');
      setBackups(listRes.data.files || []);
    } catch (err) {
      console.error('Failed to load backup data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigAndBackups();
  }, [fetchConfigAndBackups]);

  const handleSaveConfig = async (newEnabled, newTime) => {
    try {
      await axios.post(`${API_BASE_URL}/api/backup/drive/config`, {
        autoEnabled: typeof newEnabled === 'boolean' ? newEnabled : autoEnabled,
        backupTime: newTime || backupTime
      });
      setMessage({ type: 'success', text: 'Automated backup settings saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save automated schedule settings.' });
    }
  };

  const handleBackupNow = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await axios.post(`${API_BASE_URL}/api/backup/drive/upload`);
      setMessage({ type: 'success', text: 'Backup successfully saved to Google Drive!' });
      fetchConfigAndBackups();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Backup failed.' });
      setLoading(false);
    }
  };

  const handleConfirmRestore = async () => {
    const file = confirmFile;
    setConfirmFile(null);
    if (!file) return;
    setLoading(true);
    setMessage(null);
    try {
      await axios.post(`${API_BASE_URL}/api/backup/drive/restore/stage`, { fileId: file.id });
      setMessage({
        type: 'success',
        text: `Restore of "${file.name}" is staged and verified. Restart HomeGlow to apply it.`
      });
      onRestoreChanged?.();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Could not stage the restore.' });
    } finally {
      setLoading(false);
    }
  };

  // The key unlocks every stored credential, so the server asks for the
  // admin PIN (when one is set) before handing it over, even on a device
  // that remembers the PIN for the rest of the panel.
  const [keyPinOpen, setKeyPinOpen] = useState(false);

  const saveBackupKey = async (fileId, pin) => {
    const res = await axios.post(
      `${API_BASE_URL}/api/backup/drive/backup-key`,
      { fileId, ...(pin ? { pin } : {}) },
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'homeglow-encryption-key.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBackupKey = async () => {
    const file = confirmFile;
    if (!file) return;
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
      if (data?.exists === true) {
        setKeyPinOpen(true);
        return;
      }
      await saveBackupKey(file.id);
    } catch (err) {
      setMessage({ type: 'error', text: 'That backup does not contain an encryption key, or it could not be downloaded.' });
    }
  };

  const handleKeyPin = async (pin) => {
    const file = confirmFile;
    if (!file) return;
    try {
      await saveBackupKey(file.id, pin);
      setKeyPinOpen(false);
    } catch (err) {
      if (err.response?.status === 403) throw new Error('Incorrect PIN. Please try again.');
      setKeyPinOpen(false);
      setMessage({ type: 'error', text: 'That backup does not contain an encryption key, or it could not be downloaded.' });
    }
  };

  const formatFileDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return isNaN(date.getTime()) ? isoString : date.toLocaleString();
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Nightly snapshots of the database, encryption key, and uploads, saved to your connected
        Google Drive (newest 14 kept), and restorable from here. The same backups move HomeGlow
        to a new device: install it there, connect this Google account, and restore.
      </Typography>

      {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}

      <Stack spacing={2} sx={{ mb: 3, p: 2, bgcolor: 'var(--hg-white-10)', borderRadius: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Automated Nightly Backups</Typography>
            <Typography variant="caption" color="text.secondary">Automatically creates a backup snapshot every day</Typography>
          </Box>
          <Switch
            checked={autoEnabled}
            onChange={(e) => {
              const val = e.target.checked;
              setAutoEnabled(val);
              handleSaveConfig(val, backupTime);
            }}
          />
        </Box>

        {autoEnabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Schedule sx={{ opacity: 0.7 }} fontSize="small" />
            <TextField
              label="Scheduled Backup Time"
              type="time"
              size="small"
              value={backupTime}
              onChange={(e) => {
                const val = e.target.value;
                setBackupTime(val);
                handleSaveConfig(autoEnabled, val);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={`Local time (default 02:00 AM ${timezone ? `in ${timezone}` : ''})`}
            />
          </Box>
        )}
      </Stack>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<CloudUpload />} onClick={handleBackupNow} disabled={loading}>
          Backup Now
        </Button>
        <Button variant="outlined" startIcon={<Refresh />} onClick={fetchConfigAndBackups} disabled={loading}>
          Refresh List
        </Button>
      </Box>

      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>Available Cloud Backups</Typography>
      {loading && backups.length === 0 ? (
        <CircularProgress size={20} />
      ) : backups.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No backups found in Google Drive.</Typography>
      ) : (
        <List dense component={Paper} variant="outlined">
          {backups.map((file) => (
            <ListItem
              key={file.id}
              divider
              secondaryAction={
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SettingsBackupRestore />}
                  disabled={loading || Boolean(restore.staged)}
                  onClick={() => setConfirmFile(file)}
                >
                  Restore
                </Button>
              }
            >
              <ListItemText
                primary={file.name}
                secondary={`Created: ${formatFileDate(file.createdTime)}`}
                sx={{ pr: 12 }}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Manual recovery (fallback): download a backup from Google Drive, stop HomeGlow, extract
        it into the new install's data folder, and start HomeGlow again.
      </Typography>

      <Dialog open={Boolean(confirmFile)} onClose={() => setConfirmFile(null)}>
        <DialogTitle>Restore this backup?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            HomeGlow will be restored to <strong>{confirmFile?.name}</strong>{' '}
            (created {confirmFile ? formatFileDate(confirmFile.createdTime) : ''}).
            Everything in the current install — including anything created after that
            backup — will be replaced.
            <br /><br />
            The restore is verified and staged first, your current data is saved so you can
            roll back, and nothing changes until HomeGlow restarts.
            <br /><br />
            Moving to a new device? If this install sets ENCRYPTION_KEY in its environment
            (Proxmox installs do, in /opt/homeglow/.env) and it differs from the backup's
            key, staging will refuse until that variable is set to the backup's key.{' '}
            <Button size="small" startIcon={<Key />} onClick={handleDownloadBackupKey} sx={{ verticalAlign: 'baseline', textTransform: 'none', p: 0, minWidth: 0 }}>
              Download this backup's encryption key
            </Button>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmFile(null)}>Keep Current Data</Button>
          <Button color="warning" variant="contained" onClick={handleConfirmRestore} autoFocus>
            Stage Restore
          </Button>
        </DialogActions>
      </Dialog>
      <PinModal
        open={keyPinOpen}
        onClose={() => setKeyPinOpen(false)}
        onVerify={handleKeyPin}
        title="Enter the admin PIN to download the encryption key"
      />
    </Box>
  );
}
