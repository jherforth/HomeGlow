import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, LinearProgress, Stack, Typography,
} from '@mui/material';
import { Download, Upload } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import PinModal from './PinModal';
import RestoreStatusAlerts from './RestoreStatusAlerts.jsx';

// Admin → System → Backup (issue #305): back HomeGlow up to a file and
// restore it from one, without Google. The file is the same archive a Google
// Drive backup holds, and an import goes through the same staged restore:
// verified first, the current data saved for rollback, applied on restart.

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

export default function LocalBackupSection() {
  const { t } = useTranslation(['admin', 'common']);
  const fileInput = useRef(null);
  const [restore, setRestore] = useState({ staged: null, lastRestore: null, rollbackAvailable: false });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [exportPinOpen, setExportPinOpen] = useState(false);
  const [chosenFile, setChosenFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [confirmRollback, setConfirmRollback] = useState(false);

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

  const startExport = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
      if (data?.exists === true) {
        setExportPinOpen(true);
        return;
      }
      await download();
      setMessage({ type: 'success', text: t('admin:backup.exported') });
    } catch (error) {
      setMessage({ type: 'error', text: (await readBlobError(error)) || t('admin:backup.exportFailed') });
    } finally {
      setBusy(false);
    }
  };

  // The PIN dialog: a wrong PIN stays in the dialog; anything else closes it.
  const exportWithPin = async (pin) => {
    try {
      setBusy(true);
      await download(pin);
      setExportPinOpen(false);
      setMessage({ type: 'success', text: t('admin:backup.exported') });
    } catch (error) {
      if (error?.response?.status === 403) throw new Error(t('admin:backup.wrongPin'));
      setExportPinOpen(false);
      setMessage({ type: 'error', text: (await readBlobError(error)) || t('admin:backup.exportFailed') });
    } finally {
      setBusy(false);
    }
  };

  // --- import -------------------------------------------------------------------

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setChosenFile(file);
  };

  const importFile = async () => {
    const file = chosenFile;
    setChosenFile(null);
    setMessage(null);
    setBusy(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
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
    void act(() => axios.post(`${API_BASE_URL}/api/backup/drive/restore/rollback`), t('admin:backup.rollbackStaged'));
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>{t('admin:backup.heading')}</Typography>
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
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('admin:backup.exportHeading')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('admin:backup.exportHelp')}</Typography>
            <Button variant="contained" startIcon={<Download />} onClick={startExport} disabled={busy || restarting}>
              {t('admin:backup.exportButton')}
            </Button>
          </Box>

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('admin:backup.importHeading')}</Typography>
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
        </Stack>
      </CardContent>

      <Dialog open={Boolean(chosenFile)} onClose={() => setChosenFile(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin:backup.importConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('admin:backup.importConfirmBody', { name: chosenFile?.name || '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChosenFile(null)}>{t('common:actions.cancel')}</Button>
          <Button color="warning" variant="contained" onClick={importFile}>{t('admin:backup.importConfirm')}</Button>
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

      <PinModal
        open={exportPinOpen}
        onClose={() => setExportPinOpen(false)}
        onVerify={exportWithPin}
        title={t('admin:backup.pinTitle')}
      />
    </Card>
  );
}
