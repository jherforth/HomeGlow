import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Delete, Edit, NotificationsActive, Refresh } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { compactStackedTableSx } from '../utils/responsiveTable.js';
import { NOTIFICATION_EVENTS } from '../utils/pushNotifications.js';
import NotificationAudience, { EVENT_LABELS } from './NotificationAudience.jsx';
import {
  NTFY_TOPIC, createNtfyTopic, deleteNtfyTopic, isPublicNtfy, listNtfyTopics, randomNtfyTopic,
  testNtfyTopic, updateNtfyTopic,
} from '../utils/ntfy.js';

// Family → Notifications (issue #288): the household's ntfy topics. Each one
// is a phone's ntfy app (or several), hearing about the events and family
// members it chose, like a device's browser push. Shown once ntfy is on in
// System → Connections; `connection` is that status.

const errorText = (error) => error?.response?.data?.error || error?.message || String(error);

const blankForm = () => ({ label: '', topic: randomNtfyTopic(), events: [...NOTIFICATION_EVENTS], members: 'all' });

export default function NtfyTopicsTab({ connection }) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const isMobile = useIsMobile();
  const [topics, setTopics] = useState([]);
  const [people, setPeople] = useState([]);
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
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/users`)
      .then(({ data }) => setPeople((Array.isArray(data) ? data : []).filter((u) => u.id !== 0)))
      .catch(() => setPeople([]));
  }, []);

  const server = connection?.server;
  const publicServer = isPublicNtfy(server);
  const nameOf = (id) => people.find((p) => p.id === id)?.username || `#${id}`;

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
      setMessage({ type: 'success', text: t('admin:ntfy.testSent', { name: topic.label }) });
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
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="h6">{t('admin:ntfy.heading')}</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openNew}>{t('admin:ntfy.add')}</Button>
      </Box>
      <Alert severity="info" sx={{ mb: 2 }}>{t('admin:ntfy.intro', { server })}</Alert>
      {message && <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small" sx={compactStackedTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>{t('admin:ntfy.name')}</TableCell>
              <TableCell>{t('admin:ntfy.topic')}</TableCell>
              <TableCell>{t('admin:ntfy.hears')}</TableCell>
              <TableCell>{t('admin:ntfy.about')}</TableCell>
              <TableCell>{t('admin:ntfy.last')}</TableCell>
              <TableCell align="right">{t('common:labels.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {topics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">{t('admin:ntfy.none')}</Typography>
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
                <TableCell data-label={t('admin:ntfy.hears')}>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {topic.events.map((event) => <Chip key={event} size="small" label={t(EVENT_LABELS[event])} />)}
                  </Box>
                </TableCell>
                <TableCell data-label={t('admin:ntfy.about')}>
                  {topic.members === 'all'
                    ? t('admin:devices.notifications.everyone')
                    : topic.members.map(nameOf).join(', ')}
                </TableCell>
                <TableCell data-label={t('admin:ntfy.last')}>
                  {topic.lastFailure && (!topic.lastSuccessAt || topic.lastFailureAt > topic.lastSuccessAt) ? (
                    <Tooltip title={topic.lastFailure}>
                      <Chip size="small" color="warning" label={t('admin:ntfy.failed')} />
                    </Tooltip>
                  ) : topic.lastSuccessAt ? (
                    <Chip size="small" color="success" variant="outlined" label={t('admin:ntfy.delivered')} />
                  ) : '—'}
                </TableCell>
                <TableCell align="right" data-label={t('common:labels.actions')}>
                  <IconButton size="small" title={t('admin:devices.notifications.sendTest')} aria-label={t('admin:ntfy.testAria', { name: topic.label })} onClick={() => test(topic)}>
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
