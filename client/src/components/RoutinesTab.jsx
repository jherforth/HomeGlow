import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Delete, Edit, Refresh, Save, Warning } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminNote, AdminRow } from './AdminRows.jsx';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getWeekdayLabels } from '../utils/dateUtils.js';
import useIsMobile from '../hooks/useIsMobile.js';
import ChoreIconPicker from './ChoreIconPicker.jsx';
import RoutineEditorDialog from './RoutineEditorDialog.jsx';

// The import note is shown until dismissed, once per import.
const IMPORT_SEEN_KEY = 'homeglow.routinesImportSeen';
const readSeen = () => { try { return localStorage.getItem(IMPORT_SEEN_KEY); } catch { return null; } };
const writeSeen = (value) => { try { localStorage.setItem(IMPORT_SEEN_KEY, value); } catch { /* private window */ } };

// Admin → Family → Routines: routines (a list and an editor, laid out like
// Chores) and the steps they are built from. A routine's steps are ticked in
// its card on the Chores widget.
export default function RoutinesTab({ subsection, setSaveMessage }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [routines, setRoutines] = useState([]);
  const [steps, setSteps] = useState([]);
  const [users, setUsers] = useState([]);
  const [sources, setSources] = useState([]);
  const [imported, setImported] = useState(null);
  const [editor, setEditor] = useState({ open: false, routine: null });
  const [deleting, setDeleting] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [stepForm, setStepForm] = useState({ id: null, label: '', icon: '' });
  const [stepDialog, setStepDialog] = useState(false);
  const [stepError, setStepError] = useState(null);

  // The Admin Panel's one message area, as Chores uses it.
  const flash = useCallback((type, text) => {
    if (!setSaveMessage) return;
    setSaveMessage({ show: true, type, text });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3500);
  }, [setSaveMessage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [routinesRes, usersRes, sourcesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/routines`),
        axios.get(`${API_BASE_URL}/api/users`),
        axios.get(`${API_BASE_URL}/api/calendar-sources`).catch(() => ({ data: [] })),
      ]);
      setRoutines(routinesRes.data.routines || []);
      setSteps(routinesRes.data.steps || []);
      setImported(routinesRes.data.imported && routinesRes.data.imported.at !== readSeen() ? routinesRes.data.imported : null);
      setUsers((usersRes.data || []).filter((user) => user.id !== 0));
      setSources((Array.isArray(sourcesRes.data) ? sourcesRes.data : []).filter((source) => source.enabled));
    } catch (error) {
      console.error('Error loading routines:', error);
      flash('error', t('chores:routines.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [flash, t]);

  useEffect(() => { load(); }, [load]);

  // A routine gone since it was ticked (here or elsewhere) leaves the
  // selection, so the count and "select all" stay true.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(routines.map((routine) => routine.id));
      const kept = [...prev].filter((id) => present.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [routines]);

  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(selected.size === routines.length ? new Set() : new Set(routines.map((routine) => routine.id)));

  const removeSelected = async () => {
    // One request at a time: a second tap would only delete nothing.
    if (bulkDeleting) return;
    const ids = [...selected];
    setBulkDeleting(true);
    try {
      const res = await axios.delete(`${API_BASE_URL}/api/routines/bulk`, { data: { ids } });
      const count = res.data?.deleted ?? ids.length;
      setSelected(new Set());
      setBulkDialog(false);
      await load();
      flash('success', t('chores:routines.bulkDeleteSuccess', { count }));
    } catch {
      flash('error', t('chores:routines.bulkDeleteError'));
    } finally {
      setBulkDeleting(false);
    }
  };

  const userName = (id) => users.find((user) => user.id === id)?.username || '?';
  const weekdays = getWeekdayLabels(0);
  const usedBy = (stepId) => routines.filter((routine) => routine.steps.includes(stepId)).map((routine) => routine.name);

  const when = (routine) => {
    if (routine.trigger === 'calendar') {
      return routine.match_text
        ? <Chip size="small" variant="outlined" label={`📅 ${routine.match_text}`} />
        : <Chip size="small" color="warning" label={t('chores:routines.needsEvents')} />;
    }
    if (!routine.days.length || routine.days.length === 7) return <Typography variant="body2">{t('chores:routines.everyDay')}</Typography>;
    return (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {routine.days.map((day) => <Chip key={day} size="small" variant="outlined" label={weekdays[day]} />)}
      </Box>
    );
  };

  const removeRoutine = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/api/routines/${deleting.id}`);
      flash('success', t('chores:routines.deleted', { name: deleting.name }));
      setDeleting(null);
      load();
    } catch (error) {
      flash('error', error?.response?.data?.error || t('chores:routines.deleteFailed'));
    }
  };

  const saveStep = async () => {
    setStepError(null);
    try {
      const body = { label: stepForm.label, icon: stepForm.icon || null };
      if (stepForm.id) await axios.patch(`${API_BASE_URL}/api/routine-steps/${stepForm.id}`, body);
      else await axios.post(`${API_BASE_URL}/api/routine-steps`, body);
      setStepForm({ id: null, label: '', icon: '' });
      setStepDialog(false);
      load();
    } catch (error) {
      setStepError(error?.response?.data?.error || t('chores:routines.saveFailed'));
    }
  };

  const removeStep = async (step) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/routine-steps/${step.id}`);
      load();
    } catch (error) {
      const names = error?.response?.data?.usedBy;
      flash('warning', names ? t('chores:routines.stepInUse', { name: step.label, routines: names.join(', ') }) : t('chores:routines.deleteFailed'));
    }
  };

  const openStep = (step = null) => {
    setStepError(null);
    setStepForm(step ? { id: step.id, label: step.label, icon: step.icon || '' } : { id: null, label: '', icon: '' });
    setStepDialog(true);
  };

  const iconBox = (icon) => (
    <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: icon ? 'action.hover' : 'transparent', display: 'grid', placeItems: 'center', fontSize: 18 }}>
      {icon || ''}
    </Box>
  );

  return (
    <Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : subsection === 'steps' ? (
          <AdminGroup
            title={t('chores:routines.stepsHeading')}
            action={(
              <Button startIcon={<Add />} onClick={() => openStep()} variant="contained" size="small">
                {t('chores:routines.newStep')}
              </Button>
            )}
          >
            <AdminNote>{t('chores:routines.stepsIntro')}</AdminNote>
            {steps.length === 0 ? (
              <AdminNote>{t('chores:routines.noSteps')}</AdminNote>
            ) : steps.map((step) => {
              const names = usedBy(step.id);
              return (
                <AdminRow
                  key={step.id}
                  leading={iconBox(step.icon)}
                  label={step.label}
                  hint={names.length ? `${t('chores:routines.usedBy')}: ${names.join(', ')}` : null}
                  control={(
                    <>
                      <Tooltip title={t('common:actions.edit')}>
                        <IconButton size="small" onClick={() => openStep(step)} aria-label={`${t('common:actions.edit')} ${step.label}`}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={names.length ? t('chores:routines.stepInUseShort') : t('common:actions.delete')}>
                        <span>
                          <IconButton size="small" color="error" disabled={names.length > 0} onClick={() => removeStep(step)} aria-label={`${t('common:actions.delete')} ${step.label}`}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </>
                  )}
                />
              );
            })}
          </AdminGroup>
        ) : (
          <>
            {imported && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => { writeSeen(imported.at); setImported(null); }}>
                {t('chores:routines.imported', { count: imported.routines })}
                {imported.restored > 0 && ` ${t('chores:routines.importedRestored', { count: imported.restored })}`}
              </Alert>
            )}
            <AdminGroup
              title={t('chores:routines.heading')}
              action={(
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title={t('common:actions.refresh')}>
                    <IconButton size="small" onClick={load} aria-label={t('common:actions.refresh')}>
                      <Refresh fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Button startIcon={<Add />} onClick={() => setEditor({ open: true, routine: null })} variant="contained" size="small" disabled={users.length === 0}>
                    {t('chores:routines.newRoutine')}
                  </Button>
                </Box>
              )}
            >
              <AdminNote>{t('chores:routines.intro')}</AdminNote>
              {routines.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1, py: 1, bgcolor: selected.size > 0 ? 'action.hover' : undefined }}>
                  <Checkbox
                    size="small"
                    checked={routines.length > 0 && selected.size === routines.length}
                    indeterminate={selected.size > 0 && selected.size < routines.length}
                    onChange={toggleAll}
                    slotProps={{ input: { 'aria-label': t('chores:routines.selectAll') } }}
                  />
                  {selected.size > 0 && (
                    <>
                      <Typography variant="body2">
                        {t('chores:schedules.selectedCount', { count: selected.size })}
                      </Typography>
                      <Button size="small" variant="contained" color="error" startIcon={<Delete />} onClick={() => setBulkDialog(true)}>
                        {t('chores:schedules.deleteSelected')}
                      </Button>
                      <Button size="small" onClick={() => setSelected(new Set())}>{t('common:actions.clear')}</Button>
                    </>
                  )}
                </Box>
              )}
              {routines.length === 0 ? (
                <AdminNote>{t('chores:routines.noRoutines')}</AdminNote>
              ) : routines.map((routine) => (
                <AdminRow
                  key={routine.id}
                  leading={(
                    <>
                      <Checkbox
                        size="small"
                        checked={selected.has(routine.id)}
                        onChange={() => toggleSelected(routine.id)}
                        slotProps={{ input: { 'aria-label': t('chores:routines.selectRoutine', { name: routine.name, person: userName(routine.user_id) }) } }}
                        sx={{ ml: -1 }}
                      />
                      {iconBox(routine.icon)}
                    </>
                  )}
                  label={routine.name}
                  hint={[
                    userName(routine.user_id),
                    (routine.start_time || routine.end_time) && `🕑 ${routine.start_time || ''}${routine.end_time ? `–${routine.end_time}` : ''}`,
                  ].filter(Boolean).join(' · ')}
                  // when() draws chips (weekdays, or the calendar match), so it
                  // gets its own line rather than joining the text above.
                  extra={<Box sx={{ pl: { xs: 0, sm: 9 } }}>{when(routine)}</Box>}
                  control={(
                    <>
                      {routine.steps.length
                        ? <Chip size="small" variant="outlined" label={t('chores:routines.stepCount', { count: routine.steps.length })} />
                        : <Chip size="small" color="warning" label={t('chores:routines.needsSteps')} />}
                      {routine.milestone_every && routine.milestone_clams
                        ? <Chip size="small" color="primary" label={t('chores:routines.rewardChip', { every: routine.milestone_every, clams: routine.milestone_clams })} />
                        : null}
                      <Tooltip title={t('common:actions.edit')}>
                        <IconButton size="small" onClick={() => setEditor({ open: true, routine })} aria-label={`${t('common:actions.edit')} ${routine.name}`}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common:actions.delete')}>
                        <IconButton size="small" color="error" onClick={() => setDeleting(routine)} aria-label={`${t('common:actions.delete')} ${routine.name}`}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                />
              ))}
            </AdminGroup>
          </>
        )}

        <RoutineEditorDialog
          open={editor.open}
          routine={editor.routine}
          steps={steps}
          users={users}
          sources={sources}
          onClose={() => setEditor({ open: false, routine: null })}
          onSaved={(saved) => {
            setEditor({ open: false, routine: null });
            flash('success', Array.isArray(saved.routines)
              ? t('chores:routines.savedMany', { name: saved.routines[0]?.name || '', count: saved.routines.length })
              : t('chores:routines.saved', { name: saved.name }));
            load();
          }}
        />

        <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth fullScreen={isMobile}>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Warning color="error" />
              {t('chores:routines.deleteTitle')}
            </Box>
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>{t('chores:routines.deleteWarning')}</Alert>
            <Typography variant="body2">
              {t('chores:routines.deletePrompt')} <strong>{deleting?.name}</strong>?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>{t('common:actions.cancel')}</Button>
            <Button onClick={removeRoutine} variant="contained" color="error" startIcon={<Delete />}>{t('common:actions.delete')}</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={bulkDialog} onClose={() => setBulkDialog(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Warning color="error" />
              {t('chores:routines.bulkDeleteTitle', { count: selected.size })}
            </Box>
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>{t('chores:routines.bulkDeleteWarning')}</Alert>
            <Typography variant="body2">{t('chores:routines.bulkDeletePrompt', { count: selected.size })}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBulkDialog(false)}>{t('common:actions.cancel')}</Button>
            <Button onClick={removeSelected} variant="contained" color="error" startIcon={<Delete />} disabled={bulkDeleting}>
              {t('common:actions.delete')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={stepDialog}
          onClose={() => setStepDialog(false)}
          maxWidth="xs"
          fullWidth
          fullScreen={isMobile}
          slotProps={{ paper: { component: 'form', onSubmit: (event) => { event.preventDefault(); saveStep(); } } }}
        >
          <DialogTitle>{stepForm.id ? t('chores:routines.editStep') : t('chores:routines.newStep')}</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {stepError && <Alert severity="error">{stepError}</Alert>}
              <TextField
                fullWidth
                size="small"
                required
                autoFocus
                label={t('chores:routines.stepName')}
                placeholder={t('chores:routines.stepPlaceholder')}
                value={stepForm.label}
                onChange={(event) => setStepForm((form) => ({ ...form, label: event.target.value }))}
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
              <ChoreIconPicker value={stepForm.icon} onChange={(icon) => setStepForm((form) => ({ ...form, icon }))} />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={() => setStepDialog(false)}>{t('common:actions.cancel')}</Button>
            <Button type="submit" variant="contained" startIcon={<Save />} disabled={!stepForm.label.trim()}>{t('common:actions.save')}</Button>
          </DialogActions>
        </Dialog>
    </Box>
  );
}
