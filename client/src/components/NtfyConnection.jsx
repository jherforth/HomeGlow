import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, FormControlLabel, Switch, TextField, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  NTFY_DEFAULT_SERVER, readNtfyConnection, saveNtfyConnection, testNtfyConnection,
} from '../utils/ntfy.js';

// System → Connections → ntfy (issue #288): turns ntfy on for the household
// and says where to publish. Topics are added in Family → Notifications, which
// shows once this is on. `onChanged(status)` hears every saved status.

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

export default function NtfyConnection({ onChanged, onMessage }) {
  const { t } = useTranslation(['admin', 'common']);
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState({ enabled: false, server: NTFY_DEFAULT_SERVER, token: '', openUrl: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const take = (next) => {
    setStatus(next);
    // The address a tap opens defaults to the one Admin is open on.
    setDraft({ enabled: next.enabled, server: next.server, token: '', openUrl: next.openUrl || window.location.origin });
    onChanged?.(next);
  };

  // Once, when Connections opens.
  useEffect(() => {
    readNtfyConnection().then(take).catch(() => setStatus({ enabled: false, server: NTFY_DEFAULT_SERVER, hasToken: false, openUrl: null }));
  }, []);

  const save = async (changes = {}) => {
    setBusy(true);
    setResult(null);
    try {
      const body = { enabled: draft.enabled, server: draft.server, open_url: draft.openUrl, ...changes };
      if (draft.token.trim()) body.token = draft.token.trim();
      take(await saveNtfyConnection(body));
      onMessage?.({ type: 'success', text: t('admin:connections.ntfySaved') });
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
    <Box>
      <Typography variant="subtitle1" sx={{ mt: 2, mb: 1.5, fontWeight: 600 }}>
        {t('admin:connections.ntfyHeading')}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>{t('admin:connections.ntfyHelp')}</Alert>

      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
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
        <TextField
          fullWidth
          label={t('admin:connections.ntfyOpenUrl')}
          value={draft.openUrl}
          onChange={(e) => setDraft((prev) => ({ ...prev, openUrl: e.target.value }))}
          helperText={t('admin:connections.ntfyOpenUrlHelp')}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? t('common:state.saving') : t('admin:connections.ntfySave')}
          </Button>
          <Button variant="outlined" onClick={test} disabled={busy || !status.enabled}>
            {t('admin:connections.testConnection')}
          </Button>
          {status.hasToken && (
            <Button color="error" onClick={() => save({ token: '' })} disabled={busy}>
              {t('admin:connections.ntfyClearToken')}
            </Button>
          )}
        </Box>
        {status.enabled && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {t('admin:connections.ntfyTopicsWhere')}
          </Typography>
        )}
        {result && <Alert severity={result.type} sx={{ mt: 1.5 }}>{result.text}</Alert>}
      </Box>
    </Box>
  );
}
