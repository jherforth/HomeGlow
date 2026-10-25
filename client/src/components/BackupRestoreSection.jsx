import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, LinearProgress, Stack, Typography,
} from '@mui/material';
import { Download, Upload } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import PinModal from './PinModal';
import { useAdminPinPrompt } from '../hooks/useAdminPinPrompt.js';
import RestoreStatusAlerts from './RestoreStatusAlerts.jsx';
import GoogleDriveBackupSection from './GoogleDriveBackupSection.jsx';

// Backup & restore, in Admin → System → Connections at the foot of the Google
// account card: everything about backing HomeGlow up and restoring it. A
// backup file to download and upload (issue #305), and, once a Google account
// is connected (`googleConnected`, from that card), Google Drive backup as an
// alternative (#304).
// Both make the same archive and restore it the same way: verified first, the
// current data saved for rollback, applied on restart. Where a restore stands
// is shown once, at the top, whichever way it was staged.

const errorText = (error, fallback) => error?.response?.data?.error || error?.message || fallback;

// Turn a downloaded Blob into a file the browser saves.
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const filenameFrom = (disposition) => {
  const match = /filename="([^"]+)"/.exec(disposition || '');
  return match ? match[1] : 'homeglow-backup.tar.gz';
};

// An error answer to a blob request arrives as a Blob too.
async function readBlobError(error) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).error; } catch { return null; }
  }
  return null;
}

export default function BackupRestoreSection({ googleConnected = false }) {
  const { t } = useTranslation(['admin', 'common']);
  const fileInput = useRef(null);
  const [restore, setRestore] = useState({ staged: null, lastRestore: null, rollbackAvailable: false });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [chosenFile, setChosenFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [confirmRollback, setConfirmRollback] = useState(false);
  // Downloading a backup, restoring one and rolling back ask for the admin
  // PIN when one is set; the server checks it too.
  const { ask: askPin, pinModalProps } = useAdminPinPrompt({ wrongPin: t('admin:backup.wrongPin') });

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/backup/drive/status`);
      setRestore(data.restore || { staged: null, lastRestore: null, rollbackAvailable: false });
    } catch {
      // The panel still works; the status shows once it can be read.
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);


  // --- export -------------------------------------------------------------------

  const download = async (pin) => {
    const res = await axios.post(`${API_BASE_URL}/api/backup/local/export`, pin ? { pin } : {}, { responseType: 'blob' });
    saveBlob(res.data, filenameFrom(res.headers['content-disposition']));
  };

  const runExport = async (pin) => {
    setMessage(null);
    setBusy(true);
    try {
      await download(pin);
      setMessage({ type: 'success', text: t('admin:backup.exported') });
    } catch (error) {
      setMessage({ type: 'error', text: (await readBlobError(error)) || t('admin:backup.exportFailed') });
    } finally {
      setBusy(false);
    }
  };

  const startExport = () => askPin(t('admin:backup.pinTitle'), runExport);

  // --- import -------------------------------------------------------------------

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setChosenFile(file);
  };

  const confirmImport = () => {
    const file = chosenFile;
    setChosenFile(null);
    if (file) void askPin(t('admin:backup.pinTitleImport'), (pin) => importFile(file, pin));
  };

  const importFile = async (file, pin) => {
    setMessage(null);
    setBusy(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      // Before the file: the server checks the PIN before it reads the upload.
      if (pin) form.append('pin', pin);
      form.append('file', file, file.name);
      await axios.post(`${API_BASE_URL}/api/backup/local/import`, form, {
        onUploadProgress: (event) => {
          if (event.total) setUploadProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
      setMessage({ type: 'success', text: t('admin:backup.imported', { name: file.name }) });
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error, t('admin:backup.importFailed')) });
    } finally {
      setUploadProgress(null);
      setBusy(false);
      await loadStatus();
    }
  };

  // --- the staged restore -------------------------------------------------------

  const act = async (work, success) => {
    setMessage(null);
    setBusy(true);
    try {
      await work();
      if (success) setMessage({ type: 'success', text: success });
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error, t('admin:backup.actionFailed')) });
    } finally {
      setBusy(false);
      await loadStatus();
    }
  };

  const restart = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/backup/drive/restart`);
      setRestarting(true);
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error, t('admin:backup.actionFailed')) });
    }
  };

  const cancel = () => act(() => axios.post(`${API_BASE_URL}/api/backup/drive/restore/cancel`), t('admin:backup.cancelled'));
  const rollBack = () => {
    setConfirmRollback(false);
    void askPin(t('admin:backup.pinTitleRollback'), (pin) => act(
      () => axios.post(`${API_BASE_URL}/api/backup/drive/restore/rollback`, pin ? { pin } : {}),
      t('admin:backup.rollbackStaged'),
    ));
  };

  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 2 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
          💾 {t('admin:backup.heading')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('admin:backup.intro')}</Typography>

        {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}
        <RestoreStatusAlerts
          restore={restore}
          restarting={restarting}
          busy={busy}
          onRestart={restart}
          onCancel={cancel}
          onRollback={() => setConfirmRollback(true)}
        />

        <Stack spacing={3}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('admin:backup.exportHeading')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('admin:backup.exportHelp')}</Typography>
            <Button variant="contained" startIcon={<Download />} onClick={startExport} disabled={busy || restarting}>
              {t('admin:backup.exportButton')}
            </Button>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('admin:backup.importHeading')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('admin:backup.importHelp')}</Typography>
            <input
              ref={fileInput}
              type="file"
              accept=".gz,.tgz,application/gzip"
              hidden
              onChange={chooseFile}
            />
            <Button
              variant="outlined"
              startIcon={<Upload />}
              onClick={() => fileInput.current?.click()}
              disabled={busy || restarting || Boolean(restore.staged)}
            >
              {t('admin:backup.importButton')}
            </Button>
            {uploadProgress !== null && (
              <Box sx={{ mt: 1.5, maxWidth: 360 }}>
                <LinearProgress variant={uploadProgress < 100 ? 'determinate' : 'indeterminate'} value={uploadProgress} />
                <Typography variant="caption" color="text.secondary">
                  {uploadProgress < 100 ? t('admin:backup.uploading', { percent: uploadProgress }) : t('admin:backup.checking')}
                </Typography>
              </Box>
            )}
          </Box>

          {/* The alternative to a backup file, once Google is connected. */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>☁️ {t('admin:backup.driveHeading')}</Typography>
            {googleConnected ? (
              <GoogleDriveBackupSection restore={restore} onRestoreChanged={loadStatus} />
            ) : (
              <Typography variant="body2" color="text.secondary">{t('admin:backup.driveNotConnected')}</Typography>
            )}
          </Box>
        </Stack>

      <Dialog open={Boolean(chosenFile)} onClose={() => setChosenFile(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin:backup.importConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('admin:backup.importConfirmBody', { name: chosenFile?.name || '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChosenFile(null)}>{t('common:actions.cancel')}</Button>
          <Button color="warning" variant="contained" onClick={confirmImport}>{t('admin:backup.importConfirm')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmRollback} onClose={() => setConfirmRollback(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin:backup.rollbackTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('admin:backup.rollbackBody', { name: restore.lastRestore?.name || '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRollback(false)}>{t('common:actions.cancel')}</Button>
          <Button color="warning" variant="contained" onClick={rollBack}>{t('admin:backup.rollbackConfirm')}</Button>
        </DialogActions>
      </Dialog>

      <PinModal {...pinModalProps} />
    </Box>
  );
}
