import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, FormControlLabel, Switch, TextField, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  NTFY_DEFAULT_SERVER, readNtfyConnection, saveNtfyConnection, testNtfyConnection,
} from '../utils/ntfy.js';

// The ntfy connection, in Admin → System → Notifications: turns ntfy on for the
// household and says where to publish. The topics (NtfyTopics) show below
// once it is on. `onChanged(status)` hears every saved status.

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

export default function NtfyConnection({ onChanged }) {
  const { t } = useTranslation(['admin', 'common']);
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState({ enabled: false, server: NTFY_DEFAULT_SERVER, token: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const take = (next) => {
    setStatus(next);
    setDraft({ enabled: next.enabled, server: next.server, token: '' });
    onChanged?.(next);
  };

  // Once, when the tab opens.
  useEffect(() => {
    readNtfyConnection().then(take).catch(() => take({ enabled: false, server: NTFY_DEFAULT_SERVER, hasToken: false }));
  }, []);

  const save = async (changes = {}) => {
    setBusy(true);
    setResult(null);
    try {
      const body = { enabled: draft.enabled, server: draft.server, ...changes };
      if (draft.token.trim()) body.token = draft.token.trim();
      take(await saveNtfyConnection(body));
      setResult({ type: 'success', text: t('admin:connections.ntfySaved') });
    } catch (error) {
      setResult({ type: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      const answer = await testNtfyConnection();
      setResult({ type: 'success', text: answer.message });
    } catch (error) {
      setResult({ type: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('admin:connections.ntfyHelp')}</Typography>
      <FormControlLabel
        sx={{ mb: 1.5 }}
        control={(
          <Switch
            checked={draft.enabled}
            onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
        )}
        label={t('admin:connections.ntfyEnabled')}
      />
      {draft.enabled && (
        <>
          <TextField
            fullWidth
            label={t('admin:connections.ntfyServer')}
            value={draft.server}
            onChange={(e) => setDraft((prev) => ({ ...prev, server: e.target.value }))}
            placeholder={NTFY_DEFAULT_SERVER}
            helperText={t('admin:connections.ntfyServerHelp')}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            type="password"
            autoComplete="off"
            label={t('admin:connections.ntfyToken')}
            value={draft.token}
            onChange={(e) => setDraft((prev) => ({ ...prev, token: e.target.value }))}
            placeholder={status.hasToken ? t('admin:connections.tokenStored') : ''}
            helperText={status.hasToken ? t('admin:connections.ntfyTokenStoredHelp') : t('admin:connections.ntfyTokenHelp')}
            sx={{ mb: 2 }}
          />
        </>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? t('common:state.saving') : t('admin:connections.ntfySave')}
        </Button>
        {status.enabled && (
          <Button variant="outlined" onClick={test} disabled={busy}>
            {t('admin:connections.testConnection')}
          </Button>
        )}
        {status.hasToken && (
          <Button color="error" onClick={() => save({ token: '' })} disabled={busy}>
            {t('admin:connections.ntfyClearToken')}
          </Button>
        )}
      </Box>
      {result && <Alert severity={result.type} sx={{ mt: 1.5 }}>{result.text}</Alert>}
    </Box>
  );
}
