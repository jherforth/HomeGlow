import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import { Edit, NotificationsActive, Refresh } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import useIsMobile from '../hooks/useIsMobile.js';
import { compactStackedTableSx } from '../utils/responsiveTable.js';
import {
  listHaPhones, saveHaPhone, testHaPhone, turnOffHaPhone,
} from '../utils/notificationChannels.js';
import NotificationAudience, { AudienceSummary, LastSendChip } from './NotificationAudience.jsx';

// The Home Assistant Companion app's phones, in Admin → System → Notifications:
// every phone Home Assistant lists, each turned on here with a switch, then
// choosing its events, plugins and family members like any recipient. Needs
// Home Assistant connected (System → Connections).

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

export default function HaNotifyPhones({ people, plugins, onOpenConnections }) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const isMobile = useIsMobile();
  const [state, setState] = useState(null); // { connected, phones, error? }
  const [busy, setBusy] = useState(null); // the phone being changed
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async (fresh = false) => {
    try {
      setState(await listHaPhones({ fresh }));
    } catch (error) {
      setState({ connected: false, phones: [] });
      setMessage({ type: 'error', text: errorText(error) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (phone, work, success) => {
    setBusy(phone.phoneId);
    setMessage(null);
    try {
      await work();
      if (success) setMessage({ type: 'success', text: success });
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error) });
    } finally {
      setBusy(null);
      await load();
    }
  };

  const toggle = (phone, on) => (on
    ? run(phone, () => saveHaPhone(phone.phoneId, { language: i18n.language }), t('admin:haNotify.turnedOn', { name: phone.name }))
    : run(phone, () => turnOffHaPhone(phone.phoneId)));
  const test = (phone) => run(phone, () => testHaPhone(phone.phoneId), t('admin:notify.testSent', { name: phone.label || phone.name }));

  const openEdit = (phone) => {
    setForm({ label: phone.label || phone.name, events: phone.events, members: phone.members });
    setFormError(null);
    setEditing(phone);
  };
  const saveEdit = async () => {
    setFormError(null);
    try {
      await saveHaPhone(editing.phoneId, { ...form, language: i18n.language });
      setEditing(null);
      await load();
    } catch (error) {
      setFormError(errorText(error));
    }
  };

  if (state === null) return <CircularProgress size={20} />;

  if (!state.connected && state.phones.length === 0) {
    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('admin:haNotify.notConnected')}</Typography>
        {onOpenConnections && (
          <Button variant="outlined" size="small" onClick={onOpenConnections}>{t('admin:haNotify.openConnections')}</Button>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('admin:haNotify.intro')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('admin:haNotify.urgentHelp')}</Typography>
      {!state.connected && <Alert severity="warning" sx={{ mb: 1.5 }}>{t('admin:haNotify.disconnected')}</Alert>}
      {state.error && <Alert severity="warning" sx={{ mb: 1.5 }}>{state.error}</Alert>}
      {message && <Alert severity={message.type} sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button size="small" startIcon={<Refresh />} onClick={() => load(true)} disabled={!state.connected}>
          {t('admin:haNotify.refresh')}
        </Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={compactStackedTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>{t('admin:haNotify.phone')}</TableCell>
              <TableCell>{t('admin:notify.hears')}</TableCell>
              <TableCell>{t('admin:notify.last')}</TableCell>
              <TableCell align="right">{t('common:labels.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.phones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary">{t('admin:haNotify.none')}</Typography>
                </TableCell>
              </TableRow>
            ) : state.phones.map((phone) => (
              <TableRow key={phone.phoneId}>
                <TableCell data-label={t('admin:haNotify.phone')}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Switch
                      size="small"
                      checked={phone.enabled}
                      onChange={(e) => toggle(phone, e.target.checked)}
                      disabled={busy === phone.phoneId || (!phone.enabled && !state.connected)}
                      slotProps={{ input: { 'aria-label': t('admin:haNotify.switchAria', { name: phone.name }) } }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: phone.enabled ? 600 : 400 }}>{phone.label || phone.name}</Typography>
                    {phone.platform && <Chip size="small" variant="outlined" label={phone.platform === 'ios' ? 'iPhone' : 'Android'} />}
                    {phone.missing && <Chip size="small" color="warning" label={t('admin:haNotify.missing')} />}
                  </Box>
                </TableCell>
                <TableCell className="stack-full" data-label={t('admin:notify.hears')}>
                  {phone.enabled
                    ? <AudienceSummary events={phone.events} members={phone.members} people={people} plugins={plugins} />
                    : <Typography variant="body2" color="text.secondary">{t('admin:haNotify.off')}</Typography>}
                </TableCell>
                <TableCell data-label={t('admin:notify.last')}>
                  {phone.enabled ? <LastSendChip recipient={phone} /> : '—'}
                </TableCell>
                <TableCell align="right" data-label={t('common:labels.actions')}>
                  {phone.enabled && (
                    <>
                      <IconButton
                        size="small"
                        title={t('admin:devices.notifications.sendTest')}
                        aria-label={t('admin:notify.testAria', { name: phone.label || phone.name })}
                        onClick={() => test(phone)}
                        disabled={busy === phone.phoneId || !state.connected}
                      >
                        <NotificationsActive fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t('admin:haNotify.editAria', { name: phone.label || phone.name })}
                        onClick={() => openEdit(phone)}
                        disabled={busy === phone.phoneId}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{t('admin:haNotify.editTitle')}</DialogTitle>
        {form && (
          <DialogContent>
            <TextField
              fullWidth
              label={t('admin:ntfy.name')}
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              sx={{ mt: 1, mb: 2 }}
            />
            <NotificationAudience
              events={form.events}
              members={form.members}
              people={people}
              plugins={plugins}
              onChange={(changes) => setForm((prev) => ({ ...prev, ...changes }))}
            />
            {formError && <Alert severity="error" sx={{ mt: 2 }}>{formError}</Alert>}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{t('common:actions.cancel')}</Button>
          <Button variant="contained" onClick={saveEdit} disabled={!form?.label.trim() || !form?.events.length}>{t('common:actions.save')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
