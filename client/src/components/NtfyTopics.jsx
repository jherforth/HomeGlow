import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Delete, Edit, NotificationsActive, Refresh } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import useIsMobile from '../hooks/useIsMobile.js';
import { compactStackedTableSx } from '../utils/responsiveTable.js';
import { NOTIFICATION_EVENTS } from '../utils/pushNotifications.js';
import NotificationAudience, { AudienceSummary, LastSendChip } from './NotificationAudience.jsx';
import {
  NTFY_TOPIC, createNtfyTopic, deleteNtfyTopic, isPublicNtfy, listNtfyTopics, randomNtfyTopic,
  testNtfyTopic, updateNtfyTopic,
} from '../utils/ntfy.js';

// The household's ntfy topics, in Admin → System → Notifications, shown once
// ntfy is on (`connection` is its status). Each one is a phone's ntfy app (or
// several), hearing about the events, plugins and family members it chose,
// like a device's browser push.

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

const blankForm = () => ({ label: '', topic: randomNtfyTopic(), events: [...NOTIFICATION_EVENTS], members: 'all' });

export default function NtfyTopics({ connection, people, plugins }) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const isMobile = useIsMobile();
  const [topics, setTopics] = useState([]);
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | topic
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTopics((await listNtfyTopics()).topics || []);
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const server = connection?.server;
  const publicServer = isPublicNtfy(server);

  const openNew = () => {
    setForm(blankForm());
    setFormError(null);
    setEditing('new');
  };
  const openEdit = (topic) => {
    setForm({ label: topic.label, topic: topic.topic, events: topic.events, members: topic.members });
    setFormError(null);
    setEditing(topic);
  };

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const body = { ...form, language: i18n.language };
      if (editing === 'new') await createNtfyTopic(body);
      else await updateNtfyTopic(editing.id, body);
      setEditing(null);
      setMessage({ type: 'success', text: t('admin:ntfy.saved', { name: form.label }) });
      await load();
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const test = async (topic) => {
    setMessage(null);
    try {
      await testNtfyTopic(topic.id);
      setMessage({ type: 'success', text: t('admin:notify.testSent', { name: topic.label }) });
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error) });
    }
    await load();
  };

  const remove = async () => {
    try {
      await deleteNtfyTopic(deleting.id);
      setDeleting(null);
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error) });
    }
  };

  const formValid = form.label.trim() && NTFY_TOPIC.test(form.topic.trim()) && form.events.length > 0;

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('admin:ntfy.heading')}</Typography>
        <Button variant="outlined" size="small" startIcon={<Add />} onClick={openNew}>{t('admin:ntfy.add')}</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('admin:ntfy.intro', { server })}</Typography>
      {message && <Alert severity={message.type} sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={compactStackedTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>{t('admin:ntfy.name')}</TableCell>
              <TableCell>{t('admin:ntfy.topic')}</TableCell>
              <TableCell>{t('admin:notify.hears')}</TableCell>
              <TableCell>{t('admin:notify.last')}</TableCell>
              <TableCell align="right">{t('common:labels.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {topics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary">{t('admin:ntfy.none')}</Typography>
                </TableCell>
              </TableRow>
            ) : topics.map((topic) => (
              <TableRow key={topic.id}>
                <TableCell data-label={t('admin:ntfy.name')}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{topic.label}</Typography>
                </TableCell>
                <TableCell data-label={t('admin:ntfy.topic')}>
                  <Typography variant="body2" sx={{ fontFamily: 'var(--hg-font-mono)', wordBreak: 'break-all' }}>{topic.topic}</Typography>
                </TableCell>
                <TableCell className="stack-full" data-label={t('admin:notify.hears')}>
                  <AudienceSummary events={topic.events} members={topic.members} people={people} plugins={plugins} />
                </TableCell>
                <TableCell data-label={t('admin:notify.last')}>
                  <LastSendChip recipient={topic} />
                </TableCell>
                <TableCell align="right" data-label={t('common:labels.actions')}>
                  <IconButton size="small" title={t('admin:devices.notifications.sendTest')} aria-label={t('admin:notify.testAria', { name: topic.label })} onClick={() => test(topic)}>
                    <NotificationsActive fontSize="small" />
                  </IconButton>
                  <IconButton size="small" aria-label={t('admin:ntfy.editAria', { name: topic.label })} onClick={() => openEdit(topic)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" aria-label={t('admin:ntfy.deleteAria', { name: topic.label })} onClick={() => setDeleting(topic)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editing === 'new' ? t('admin:ntfy.addTitle') : t('admin:ntfy.editTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            autoFocus
            label={t('admin:ntfy.name')}
            placeholder={t('admin:ntfy.namePlaceholder')}
            value={form.label}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            sx={{ mt: 1, mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
            <TextField
              fullWidth
              label={t('admin:ntfy.topic')}
              value={form.topic}
              onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
              error={Boolean(form.topic) && !NTFY_TOPIC.test(form.topic.trim())}
              helperText={t('admin:ntfy.topicHelp')}
              slotProps={{ htmlInput: { style: { fontFamily: 'var(--hg-font-mono)' } } }}
            />
            <Tooltip title={t('admin:ntfy.newTopic')}>
              <IconButton aria-label={t('admin:ntfy.newTopic')} onClick={() => setForm((prev) => ({ ...prev, topic: randomNtfyTopic() }))} sx={{ mt: 1 }}>
                <Refresh />
              </IconButton>
            </Tooltip>
          </Box>
          {publicServer && <Alert severity="warning" sx={{ mb: 2 }}>{t('admin:ntfy.publicWarning')}</Alert>}

          <NotificationAudience
            events={form.events}
            members={form.members}
            people={people}
            plugins={plugins}
            onChange={(changes) => setForm((prev) => ({ ...prev, ...changes }))}
          />

          <Alert severity="info" icon={false} sx={{ mt: 1 }}>
            {publicServer
              ? t('admin:ntfy.howTo', { topic: form.topic.trim() || '…' })
              : t('admin:ntfy.howToServer', { topic: form.topic.trim() || '…', server })}
          </Alert>
          {formError && <Alert severity="error" sx={{ mt: 2 }}>{formError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{t('common:actions.cancel')}</Button>
          <Button variant="contained" onClick={save} disabled={busy || !formValid}>{t('common:actions.save')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin:ntfy.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('admin:ntfy.deletePrompt', { name: deleting?.label || '' })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>{t('common:actions.cancel')}</Button>
          <Button color="error" variant="contained" onClick={remove}>{t('common:actions.delete')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
