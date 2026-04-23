import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopy,
  Google as GoogleIcon,
  LinkOff,
  Login,
  Save,
  Security,
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';

const initialDraft = { client_id: '', client_secret: '', redirect_uri_override: '' };

const GoogleAccountConnection = ({ onMessage }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [localError, setLocalError] = useState('');
  const popupRef = useRef(null);

  const notify = useCallback((type, text) => {
    if (onMessage) onMessage({ type, text });
  }, [onMessage]);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/connections/google/status`);
      setStatus(data);
      setDraft((prev) => ({
        ...prev,
        redirect_uri_override: data?.oauth?.redirect_uri_override || '',
      }));
    } catch (err) {
      console.error('Failed to load Google connection status', err);
      setLocalError('Failed to load Google connection status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const handler = (event) => {
      if (!event?.data || event.data.type !== 'homeglow:google-oauth') return;
      if (event.data.ok) {
        notify('success', 'Google account connected.');
      } else {
        notify('error', 'Google authorization was not completed.');
      }
      loadStatus();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadStatus, notify]);

  const encryptionReady = !!status?.encryption?.configured;
  const oauth = status?.oauth || {};
  const account = status?.account || null;
  const credentialsReady = !!oauth.has_client_id && !!oauth.has_client_secret;

  const saveCredentials = async () => {
    if (!encryptionReady) {
      setLocalError('The server encryption key must be configured before saving credentials.');
      return;
    }
    setSaving(true);
    setLocalError('');
    try {
      await axios.post(`${API_BASE_URL}/api/connections/google/config`, {
        client_id: draft.client_id || undefined,
        client_secret: draft.client_secret || undefined,
        redirect_uri_override: draft.redirect_uri_override,
      });
      setDraft((prev) => ({ ...prev, client_secret: '' }));
      notify('success', 'Google OAuth credentials saved.');
      await loadStatus();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || 'Failed to save credentials.';
      setLocalError(msg);
      notify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const authorize = async () => {
    setAuthorizing(true);
    setLocalError('');
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/connections/google/authorize`);
      if (!data?.url) throw new Error('Authorize URL missing.');
      const width = 520;
      const height = 680;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      popupRef.current = window.open(
        data.url,
        'homeglow_google_oauth',
        `width=${width},height=${height},left=${left},top=${top}`,
      );
      if (!popupRef.current) {
        setLocalError('Popup was blocked. Allow popups for this site and try again.');
      }
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || 'Failed to start Google authorization.';
      setLocalError(msg);
      notify('error', msg);
    } finally {
      setAuthorizing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setLocalError('');
    try {
      await axios.delete(`${API_BASE_URL}/api/connections/google/account`);
      notify('success', 'Google account disconnected.');
      await loadStatus();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || 'Failed to disconnect.';
      setLocalError(msg);
      notify('error', msg);
    } finally {
      setDisconnecting(false);
    }
  };

  const copy = (text) => {
    if (!text) return;
    try { navigator.clipboard.writeText(text); } catch (_) {}
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
        <CircularProgress size={20} />
        <Typography variant="body2">Loading Google connection...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <GoogleIcon fontSize="small" />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Google Account
        </Typography>
      </Stack>

      {!encryptionReady && (
        <Alert severity="warning" icon={<Security />} sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            A server encryption key is required before Google credentials can be stored safely.
          </Typography>
          <Typography variant="body2" component="div">
            Add an <code>ENCRYPTION_KEY</code> value to the server <code>.env</code> file, then
            restart the server. Generate a key with:
            <Box component="pre" sx={{
              mt: 1, p: 1.5, bgcolor: 'rgba(0,0,0,0.35)', borderRadius: 1,
              fontFamily: 'monospace', fontSize: 13, overflow: 'auto',
            }}>
              openssl rand -base64 32
            </Box>
          </Typography>
        </Alert>
      )}

      {localError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError('')}>
          {localError}
        </Alert>
      )}

      <Stack spacing={2} sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Create OAuth 2.0 credentials in the{' '}
          <Link href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
            Google Cloud Console
          </Link>
          . Use the redirect URI shown below when configuring the OAuth client.
        </Typography>

        <TextField
          label="Client ID"
          value={draft.client_id}
          onChange={(e) => setDraft((p) => ({ ...p, client_id: e.target.value }))}
          placeholder={oauth.has_client_id ? `Saved: ${oauth.client_id_preview}` : 'Paste your OAuth Client ID'}
          fullWidth
          disabled={!encryptionReady}
        />

        <TextField
          label="Client Secret"
          type="password"
          value={draft.client_secret}
          onChange={(e) => setDraft((p) => ({ ...p, client_secret: e.target.value }))}
          placeholder={oauth.has_client_secret ? 'A secret is saved. Paste a new one to replace it.' : 'Paste your OAuth Client Secret'}
          fullWidth
          disabled={!encryptionReady}
          helperText={oauth.has_client_secret ? 'Leave blank to keep the saved secret.' : ' '}
        />

        <TextField
          label="Redirect URI"
          value={oauth.redirect_uri || ''}
          fullWidth
          InputProps={{
            readOnly: true,
            endAdornment: (
              <Tooltip title="Copy redirect URI">
                <IconButton size="small" onClick={() => copy(oauth.redirect_uri)}>
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Tooltip>
            ),
          }}
          helperText="Register this exact URL as an Authorized redirect URI in the Google Cloud Console."
        />

        <TextField
          label="Redirect URI Override (optional)"
          value={draft.redirect_uri_override}
          onChange={(e) => setDraft((p) => ({ ...p, redirect_uri_override: e.target.value }))}
          placeholder="Leave blank unless you use a custom domain behind a proxy"
          fullWidth
          disabled={!encryptionReady}
        />

        <Box>
          <Button
            variant="contained"
            onClick={saveCredentials}
            disabled={saving || !encryptionReady}
            startIcon={<Save />}
          >
            {saving ? 'Saving...' : 'Save Credentials'}
          </Button>
        </Box>
      </Stack>

      <Divider sx={{ my: 3 }} />

      {account ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 2,
            p: 2,
            border: '1px solid var(--card-border)',
            borderRadius: 2,
            bgcolor: 'rgba(74, 222, 128, 0.06)',
          }}
        >
          <Avatar src={account.picture} alt={account.name} sx={{ width: 56, height: 56 }}>
            {account.name ? account.name[0] : 'G'}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {account.name || 'Google user'}
              </Typography>
              <Chip label="Connected" size="small" color="success" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {account.email}
            </Typography>
            {account.connected_at && (
              <Typography variant="caption" color="text.secondary">
                Connected {new Date(account.connected_at).toLocaleString()}
              </Typography>
            )}
          </Box>
          <Button
            variant="outlined"
            color="error"
            startIcon={<LinkOff />}
            onClick={disconnect}
            disabled={disconnecting}
            sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            p: 2,
            border: '1px dashed var(--card-border)',
            borderRadius: 2,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'center' },
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              No Google account connected
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connecting your Google account enables Google Calendar (2-way sync) and Google Photos
              as sources for the Calendar and Photo widgets.
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={authorize}
            disabled={!credentialsReady || !encryptionReady || authorizing}
            startIcon={<Login />}
          >
            {authorizing ? 'Opening...' : 'Authorize with Google'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default GoogleAccountConnection;
