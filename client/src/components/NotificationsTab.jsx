import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert, Box, Button, Divider, TextField, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { readNotificationSettings, saveNotificationSettings } from '../utils/notificationChannels.js';
import { DeviceNotificationsCard, NotifyingDevicesTable } from './DeviceNotifications.jsx';
import NtfyConnection from './NtfyConnection.jsx';
import NtfyTopics from './NtfyTopics.jsx';
import HaNotifyPhones from './HaNotifyPhones.jsx';
import { AdminGroup, AdminRow } from './AdminRows.jsx';

// Admin → System → Notifications: every way HomeGlow tells a phone that a
// chore or a day is done, or what a plugin has to say. One page, three boxes:
// browser notifications (the default), ntfy (more, hosted or self-hosted), and
// the Home Assistant Companion app. Every recipient in each chooses its
// events, plugins and family members the same way (NotificationAudience).
// Above them, the address a tap opens, which ntfy and the Home Assistant app
// need (browser push knows its own).

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

// One group per way of being notified. `icon` was drawn before the title;
// the Admin Panel's group headings carry no icons, so it is no longer used.
function Section({ title, children }) {
  return (
    <AdminGroup title={title}>
      <Box sx={{ px: 2, py: 1.5 }}>{children}</Box>
    </AdminGroup>
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
    <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>{t('admin:notify.intro')}</Typography>

        <Box>
          <AdminGroup>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveOpenUrl();
              }}
            >
              <AdminRow
                label={t('admin:notify.openUrl')}
                hint={settings && !settings.openUrl ? t('admin:notify.openUrlUnsaved') : t('admin:notify.openUrlHelp')}
                wide
                extra={openUrlResult && <Alert severity={openUrlResult.type} onClose={() => setOpenUrlResult(null)}>{openUrlResult.text}</Alert>}
                control={(
                  <>
                    <TextField
                      sx={{ flex: 1 }}
                      size="small"
                      value={openUrl}
                      onChange={(e) => setOpenUrl(e.target.value)}
                      disabled={!settings}
                      slotProps={{ htmlInput: { 'aria-label': t('admin:notify.openUrl') } }}
                    />
                    <Button type="submit" variant="outlined" disabled={!settings}>{t('common:actions.save')}</Button>
                  </>
                )}
              />
            </Box>
          </AdminGroup>

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
    </Box>
  );
}
