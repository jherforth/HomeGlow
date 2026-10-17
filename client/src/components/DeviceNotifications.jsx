import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, FormGroup, IconButton,
  Radio, RadioGroup, Typography,
} from '@mui/material';
import { NotificationsActive, NotificationsOff } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import {
  NOTIFICATION_EVENTS, pushSupport, readDeviceNotifications, sendTestNotification,
  turnOffNotifications, turnOnNotifications, updateNotifications,
} from '../utils/pushNotifications.js';

// Push notifications in Admin → Displays → Devices: this device's own card
// (turning them on must happen on the device itself, which asks its owner),
// and a status cell for each device in the table.

const EVENT_LABELS = {
  'chore.completed': 'admin:devices.notifications.eventCompleted',
  'chore.allCompleted': 'admin:devices.notifications.eventAllDone',
};

export function DeviceNotificationsCard({ deviceName, onChanged }) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [support] = useState(() => pushSupport());
  const [state, setState] = useState(null);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setState(await readDeviceNotifications(deviceName));
    } catch {
      setState({ enabled: false });
    }
  }, [deviceName]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/users`)
      .then(({ data }) => setMembers((Array.isArray(data) ? data : []).filter((u) => u.id !== 0)))
      .catch(() => setMembers([]));
  }, []);

  const act = async (work, success) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await work();
      if (next) setState(next);
      if (success) setMessage({ type: 'success', text: success });
      onChanged?.();
    } catch (error) {
      const blocked = error?.reason === 'blocked';
      setMessage({
        type: 'error',
        text: blocked ? t('admin:devices.notifications.blocked') : (error?.response?.data?.error || error?.message || String(error)),
      });
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () => act(() => turnOnNotifications(deviceName, { language: i18n.language }), t('admin:devices.notifications.turnedOn'));
  const turnOff = () => act(() => turnOffNotifications(deviceName, { thisDevice: true }));
  const test = () => act(async () => { await sendTestNotification(deviceName); return null; }, t('admin:devices.notifications.testSent'));
  const change = (changes) => act(() => updateNotifications(deviceName, changes));

  const toggleEvent = (event, on) => {
    const events = new Set(state.events);
    if (on) events.add(event); else events.delete(event);
    void change({ events: NOTIFICATION_EVENTS.filter((e) => events.has(e)) });
  };
  const chosen = Array.isArray(state?.members) ? state.members : null;
  const toggleMember = (id) => {
    const next = new Set(chosen || []);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (next.size) void change({ members: [...next] });
  };

  // Over plain http no browser allows push, so there is nothing to offer.
  // A device that has them on still gets its card, to turn them off.
  if (support === 'insecure' && !state?.enabled) return null;

  const unavailable = support !== 'ready' && !state?.enabled;

  return (
    <Box sx={{ mb: 2, p: 2, border: '1px solid var(--card-border)', borderRadius: 'var(--hg-radius-sm)' }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {t('admin:devices.notifications.heading')}
      </Typography>

      {state === null && <CircularProgress size={20} />}

      {state && unavailable && (
        <Alert severity="info">
          {t(`admin:devices.notifications.support.${support}`)}
        </Alert>
      )}

      {state && !unavailable && !state.enabled && (
        <>
          <Typography variant="body2" sx={{ mb: 1.5 }}>{t('admin:devices.notifications.offHelp')}</Typography>
          <Button variant="contained" startIcon={<NotificationsActive />} onClick={turnOn} disabled={busy}>
            {t('admin:devices.notifications.turnOn')}
          </Button>
        </>
      )}

      {state?.enabled && (
        <>
          <Typography variant="body2" sx={{ mb: 1 }}>{t('admin:devices.notifications.tellMeWhen')}</Typography>
          <FormGroup sx={{ mb: 1.5 }}>
            {NOTIFICATION_EVENTS.map((event) => (
              <FormControlLabel
                key={event}
                control={<Checkbox checked={state.events.includes(event)} onChange={(e) => toggleEvent(event, e.target.checked)} disabled={busy} />}
                label={t(EVENT_LABELS[event])}
              />
            ))}
          </FormGroup>

          <Typography variant="body2" sx={{ mb: 0.5 }}>{t('admin:devices.notifications.whose')}</Typography>
          <RadioGroup
            row
            value={chosen ? 'some' : 'all'}
            onChange={(e) => change({ members: e.target.value === 'all' ? 'all' : members.map((m) => m.id) })}
          >
            <FormControlLabel value="all" control={<Radio disabled={busy} />} label={t('admin:devices.notifications.everyone')} />
            <FormControlLabel value="some" control={<Radio disabled={busy || !members.length} />} label={t('admin:devices.notifications.only')} />
          </RadioGroup>
          {chosen && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              {members.map((m) => (
                <Chip
                  key={m.id}
                  label={m.username}
                  color={chosen.includes(m.id) ? 'primary' : 'default'}
                  variant={chosen.includes(m.id) ? 'filled' : 'outlined'}
                  onClick={() => toggleMember(m.id)}
                  disabled={busy}
                />
              ))}
            </Box>
          )}

          {state.lastFailure && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              {t('admin:devices.notifications.lastFailure', { reason: state.lastFailure })}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<NotificationsActive />} onClick={test} disabled={busy}>
              {t('admin:devices.notifications.sendTest')}
            </Button>
            <Button variant="outlined" color="error" startIcon={<NotificationsOff />} onClick={turnOff} disabled={busy}>
              {t('admin:devices.notifications.turnOff')}
            </Button>
          </Box>
        </>
      )}

      {message && <Alert severity={message.type} sx={{ mt: 1.5 }}>{message.text}</Alert>}
    </Box>
  );
}

/**
 * A device's row in the table: whether it gets notifications, and for one
 * that does, a test and a way to turn them off from here.
 */
export function DeviceNotificationStatus({ device, onChanged }) {
  const { t } = useTranslation(['admin', 'common']);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  if (!device.notifications) return <Typography variant="body2" color="text.secondary">—</Typography>;

  const run = async (work, success) => {
    setBusy(true);
    setNote(null);
    try {
      await work();
      setNote(success);
      onChanged?.();
    } catch (error) {
      setNote(error?.response?.data?.error || error?.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
      <Chip label={t('admin:devices.notifications.on')} color="success" size="small" />
      <IconButton
        size="small"
        title={t('admin:devices.notifications.sendTest')}
        onClick={() => run(() => sendTestNotification(device.name), t('admin:devices.notifications.testSent'))}
        disabled={busy}
      >
        <NotificationsActive fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        color="error"
        title={t('admin:devices.notifications.turnOff')}
        onClick={() => run(() => turnOffNotifications(device.name), null)}
        disabled={busy}
      >
        <NotificationsOff fontSize="small" />
      </IconButton>
      {note && <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>{note}</Typography>}
    </Box>
  );
}
