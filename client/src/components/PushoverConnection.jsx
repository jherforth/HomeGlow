import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { Delete, Save, Send } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';

// Admin → System → Connections → Pushover: the keys plugins' phone
// notifications go out with when there's no Home Assistant (server:
// services/pushover.js). Written blind: the status says only whether each
// key is stored, never the key.

const emptyDraft = { token: '', user: '' };

const PushoverConnection = ({ onMessage }) => {
  const { t } = useTranslation(['admin', 'common']);
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);

  const tell = useCallback((type, text) => { if (onMessage) onMessage({ type, text }); }, [onMessage]);
  const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/connections/pushover/status`);
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy('save');
    setResult(null);
    try {
      const { data } = await axios.put(`${API_BASE_URL}/api/connections/pushover`, draft);
      setStatus(data.status);
      setDraft(emptyDraft);
      tell('success', t('admin:connections.pushover.saved'));
    } catch (error) {
      setResult({ ok: false, text: t('admin:connections.pushover.failed', { error: errorText(error) }) });
    } finally {
      setBusy('');
    }
  };

  const sendTest = async () => {
    setBusy('test');
    setResult(null);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/connections/pushover/test`, {});
      let text = t('admin:connections.pushover.testSent');
      if (data.group) text = t('admin:connections.pushover.testSentGroup');
      else if (Array.isArray(data.devices) && data.devices.length) text = t('admin:connections.pushover.testSentDevices', { devices: data.devices.join(', ') });
      setResult({ ok: true, text });
    } catch (error) {
      setResult({ ok: false, text: t('admin:connections.pushover.failed', { error: errorText(error) }) });
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('remove');
    setResult(null);
    try {
      await axios.delete(`${API_BASE_URL}/api/connections/pushover`);
      await load();
      tell('success', t('admin:connections.pushover.removed'));
    } catch (error) {
      setResult({ ok: false, text: t('admin:connections.pushover.failed', { error: errorText(error) }) });
    } finally {
      setBusy('');
    }
  };

  const encryptionReady = status ? status.encryption_configured !== false : true;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mt: 2, mb: 1.5, fontWeight: 600 }}>
        {t('admin:connections.pushover.heading')}
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        {t('admin:connections.pushover.help')}
      </Alert>

      {!encryptionReady && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('admin:connections.pushover.encryptionRequired')}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <TextField
          fullWidth
          label={t('admin:connections.pushover.token')}
          type="password"
          autoComplete="off"
          value={draft.token}
          onChange={(e) => setDraft((prev) => ({ ...prev, token: e.target.value }))}
          sx={{ mb: 2 }}
          placeholder={status?.has_token ? t('admin:connections.pushover.keyStored') : ''}
          helperText={status?.has_token ? t('admin:connections.pushover.keyStoredHelp') : t('admin:connections.pushover.tokenHelp')}
        />
        <TextField
          fullWidth
          label={t('admin:connections.pushover.user')}
          type="password"
          autoComplete="off"
          value={draft.user}
          onChange={(e) => setDraft((prev) => ({ ...prev, user: e.target.value }))}
          sx={{ mb: 2 }}
          placeholder={status?.has_user ? t('admin:connections.pushover.keyStored') : ''}
          helperText={status?.has_user ? t('admin:connections.pushover.keyStoredHelp') : t('admin:connections.pushover.userHelp')}
        />

        {result && (
          <Alert severity={result.ok ? 'success' : 'error'} sx={{ mb: 2 }}>
            {result.text}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, mb: 2 }}>
          <Button
            type="submit"
            variant="contained"
            disabled={!!busy || !encryptionReady || (!draft.token.trim() && !draft.user.trim())}
            startIcon={<Save />}
          >
            {busy === 'save' ? t('common:state.saving') : t('admin:connections.pushover.save')}
          </Button>
          <Button
            type="button"
            variant="outlined"
            disabled={!!busy || !status?.configured}
            onClick={sendTest}
            startIcon={<Send />}
          >
            {busy === 'test' ? t('admin:connections.pushover.sending') : t('admin:connections.pushover.sendTest')}
          </Button>
          {(status?.has_token || status?.has_user) && (
            <Button
              type="button"
              color="error"
              variant="text"
              disabled={!!busy}
              onClick={remove}
              startIcon={<Delete />}
            >
              {t('admin:connections.pushover.remove')}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default PushoverConnection;
