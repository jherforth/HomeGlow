import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, IconButton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { NotificationsActive, NotificationsOff } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  pushSupport, readDeviceNotifications, sendTestNotification,
  turnOffNotifications, turnOnNotifications, updateNotifications,
} from '../utils/pushNotifications.js';
import { listNotifyingDevices } from '../utils/notificationChannels.js';
import { compactStackedTableSx } from '../utils/responsiveTable.js';
import NotificationAudience, { AudienceSummary, LastSendChip } from './NotificationAudience.jsx';

// Browser notifications, in Admin → System → Notifications: this device's own
// card (turning them on must happen on the device itself, which asks its
// owner), and every device that has them on, with a test and a way to turn
// them off from here.

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

export function DeviceNotificationsCard({
  deviceName, people, reloadKey, onChanged,
}) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [support] = useState(() => pushSupport());
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setState(await readDeviceNotifications(deviceName));
    } catch {
      setState({ enabled: false });
    }
  }, [deviceName]);

  useEffect(() => { void load(); }, [load, reloadKey]);

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
      setMessage({ type: 'error', text: blocked ? t('admin:devices.notifications.blocked') : errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () => act(() => turnOnNotifications(deviceName, { language: i18n.language }), t('admin:devices.notifications.turnedOn'));
  const turnOff = () => act(() => turnOffNotifications(deviceName, { thisDevice: true }));
  const test = () => act(async () => { await sendTestNotification(deviceName); return null; }, t('admin:devices.notifications.testSent'));
  const change = (changes) => act(() => updateNotifications(deviceName, changes));

  // A device that has them on still gets its controls, to turn them off.
  const unavailable = support !== 'ready' && !state?.enabled;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {t('admin:devices.notifications.heading')}
        {' '}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--hg-font-mono)' }}>
          ({deviceName})
        </Typography>
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
          <NotificationAudience
            events={state.events}
            members={state.members}
            people={people}
            plugins={Array.isArray(state.plugins) ? state.plugins : []}
            onChange={change}
            disabled={busy}
          />

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
 * Every device with browser notifications on: what each hears, how its last
 * one went, and a test and a way to turn them off. `reloadKey` changes when
 * this device's card changed something.
 */
export function NotifyingDevicesTable({ currentDeviceName, people, plugins, reloadKey, onChanged }) {
  const { t } = useTranslation(['admin', 'common']);
  const [devices, setDevices] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setDevices((await listNotifyingDevices()).devices || []);
    } catch (error) {
      setDevices([]);
      setMessage({ type: 'error', text: errorText(error) });
    }
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const run = async (work, success) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      if (success) setMessage({ type: 'success', text: success });
      onChanged?.();
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
      await load();
    }
  };

  if (devices === null) return null;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('admin:notify.browserDevices')}</Typography>
      {message && <Alert severity={message.type} sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={compactStackedTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>{t('common:labels.name')}</TableCell>
              <TableCell>{t('admin:notify.hears')}</TableCell>
              <TableCell>{t('admin:notify.last')}</TableCell>
              <TableCell align="right">{t('common:labels.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary">{t('admin:notify.noDevices')}</Typography>
                </TableCell>
              </TableRow>
            ) : devices.map((device) => (
              <TableRow key={device.deviceName}>
                <TableCell data-label={t('common:labels.name')}>
                  <Typography variant="body2" sx={{ fontFamily: 'var(--hg-font-mono)', fontWeight: device.deviceName === currentDeviceName ? 700 : 400 }}>
                    {device.deviceName}
                  </Typography>
                </TableCell>
                <TableCell className="stack-full" data-label={t('admin:notify.hears')}>
                  <AudienceSummary events={device.events} members={device.members} people={people} plugins={plugins} />
                </TableCell>
                <TableCell data-label={t('admin:notify.last')}>
                  <LastSendChip recipient={device} />
                </TableCell>
                <TableCell align="right" data-label={t('common:labels.actions')}>
                  <IconButton
                    size="small"
                    title={t('admin:devices.notifications.sendTest')}
                    aria-label={t('admin:notify.testAria', { name: device.deviceName })}
                    onClick={() => run(() => sendTestNotification(device.deviceName), t('admin:notify.testSent', { name: device.deviceName }))}
                    disabled={busy}
                  >
                    <NotificationsActive fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    title={t('admin:devices.notifications.turnOff')}
                    aria-label={t('admin:notify.turnOffAria', { name: device.deviceName })}
                    onClick={() => run(() => turnOffNotifications(device.deviceName, { thisDevice: device.deviceName === currentDeviceName }), null)}
                    disabled={busy}
                  >
                    <NotificationsOff fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
