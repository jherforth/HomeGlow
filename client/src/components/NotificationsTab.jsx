import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert, Box, Button, Card, CardContent, Divider, TextField, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { readNotificationSettings, saveNotificationSettings } from '../utils/notificationChannels.js';
import { DeviceNotificationsCard, NotifyingDevicesTable } from './DeviceNotifications.jsx';
import NtfyConnection from './NtfyConnection.jsx';
import NtfyTopics from './NtfyTopics.jsx';
import HaNotifyPhones from './HaNotifyPhones.jsx';

// Admin → System → Notifications: every way HomeGlow tells a phone that a
// chore or a day is done, or what a plugin has to say. One page, three boxes:
// browser notifications (the default), ntfy (more, hosted or self-hosted), and
// the Home Assistant Companion app. Every recipient in each chooses its
// events, plugins and family members the same way (NotificationAudience).
// Above them, the address a tap opens, which ntfy and the Home Assistant app
// need (browser push knows its own).

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

function Section({ icon, title, children }) {
  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 2 }}>
      <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
        {icon} {title}
      </Typography>
      {children}
    </Box>
  );
}

export default function NotificationsTab({ deviceName, onOpenConnections }) {
  const { t } = useTranslation(['admin', 'common']);
  const [settings, setSettings] = useState(null);
  const [openUrl, setOpenUrl] = useState('');
  const [openUrlResult, setOpenUrlResult] = useState(null);
  const [people, setPeople] = useState([]);
  const [ntfy, setNtfy] = useState(null);
  // Changes when this device's card or the devices table changed something.
  const [devicesVersion, setDevicesVersion] = useState(0);
  const bumpDevices = useCallback(() => setDevicesVersion((v) => v + 1), []);

  useEffect(() => {
    readNotificationSettings()
      .then((next) => {
        setSettings(next);
        // Until one is saved, the address Admin is open on.
        setOpenUrl(next.openUrl || window.location.origin);
      })
      .catch((error) => {
        setSettings({ openUrl: null, plugins: [] });
        setOpenUrlResult({ type: 'error', text: errorText(error) });
      });
    axios.get(`${API_BASE_URL}/api/users`)
      .then(({ data }) => setPeople((Array.isArray(data) ? data : []).filter((u) => u.id !== 0)))
      .catch(() => setPeople([]));
  }, []);

  const saveOpenUrl = async () => {
    setOpenUrlResult(null);
    try {
      const next = await saveNotificationSettings({ openUrl });
      setSettings(next);
      setOpenUrl(next.openUrl || '');
      setOpenUrlResult({ type: 'success', text: t('admin:notify.openUrlSaved') });
    } catch (error) {
      setOpenUrlResult({ type: 'error', text: errorText(error) });
    }
  };

  const plugins = settings?.plugins || [];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>{t('admin:notify.heading')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('admin:notify.intro')}</Typography>

        <Box sx={{ maxWidth: 900 }}>
          <Box
            component="form"
            sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveOpenUrl();
            }}
          >
            <TextField
              sx={{ flex: '1 1 320px' }}
              size="small"
              label={t('admin:notify.openUrl')}
              value={openUrl}
              onChange={(e) => setOpenUrl(e.target.value)}
              helperText={settings && !settings.openUrl ? t('admin:notify.openUrlUnsaved') : t('admin:notify.openUrlHelp')}
              disabled={!settings}
            />
            <Button type="submit" variant="outlined" disabled={!settings}>{t('common:actions.save')}</Button>
          </Box>
          {openUrlResult && <Alert severity={openUrlResult.type} sx={{ mt: 1 }} onClose={() => setOpenUrlResult(null)}>{openUrlResult.text}</Alert>}

          <Section icon="🔔" title={t('admin:notify.browserHeading')}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('admin:notify.browserIntro')}</Typography>
            <DeviceNotificationsCard deviceName={deviceName} people={people} reloadKey={devicesVersion} onChanged={bumpDevices} />
            <Divider sx={{ my: 2 }} />
            <NotifyingDevicesTable
              currentDeviceName={deviceName}
              people={people}
              plugins={plugins}
              reloadKey={devicesVersion}
              onChanged={bumpDevices}
            />
          </Section>

          <Section icon="📨" title={t('admin:connections.ntfyHeading')}>
            <NtfyConnection onChanged={setNtfy} />
            {ntfy?.enabled && <NtfyTopics connection={ntfy} people={people} plugins={plugins} />}
          </Section>

          <Section icon="🏠" title={t('admin:haNotify.heading')}>
            <HaNotifyPhones people={people} plugins={plugins} onOpenConnections={onOpenConnections} />
          </Section>
        </Box>
      </CardContent>
    </Card>
  );
}
