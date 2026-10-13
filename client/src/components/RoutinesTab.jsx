import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Delete, Edit, Refresh, Save, Warning } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getWeekdayLabels } from '../utils/dateUtils.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { compactStackedTableSx } from '../utils/responsiveTable.js';
import ChoreIconPicker from './ChoreIconPicker.jsx';
import RoutineEditorDialog from './RoutineEditorDialog.jsx';

// The import note is shown until dismissed, once per import.
const IMPORT_SEEN_KEY = 'homeglow.routinesImportSeen';
const readSeen = () => { try { return localStorage.getItem(IMPORT_SEEN_KEY); } catch { return null; } };
const writeSeen = (value) => { try { localStorage.setItem(IMPORT_SEEN_KEY, value); } catch { /* private window */ } };

// Admin → Family → Routines: routines (a list and an editor, laid out like
// Chores) and the steps they are built from. A routine's steps are ticked in
// its card on the Chores widget.
export default function RoutinesTab({ subsection, subsections, onSubsection, setSaveMessage }) {
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

  return (
    <Card>
      <CardContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs
            value={Math.max(0, subsections.indexOf(subsection))}
            onChange={(_, index) => onSubsection(subsections[index])}
            size="small"
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab label={t('chores:routines.heading')} />
            <Tab label={t('chores:routines.stepsHeading')} />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : subsection === 'steps' ? (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6">{t('chores:routines.stepsHeading')}</Typography>
              <Button startIcon={<Add />} onClick={() => openStep()} variant="contained" size="small">
                {t('chores:routines.newStep')}
              </Button>
            </Box>
            <Alert severity="info" sx={{ mb: 2 }}>{t('chores:routines.stepsIntro')}</Alert>
            <TableContainer component={Paper}>
              <Table size="small" sx={compactStackedTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('chores:routines.stepName')}</TableCell>
                    <TableCell>{t('chores:routines.usedBy')}</TableCell>
                    <TableCell>{t('common:labels.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {steps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">{t('chores:routines.noSteps')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : steps.map((step) => {
                    const names = usedBy(step.id);
                    return (
                      <TableRow key={step.id}>
                        <TableCell data-label={t('chores:routines.stepName')}>
                          <Typography variant="body2" fontWeight="bold">
                            {step.icon && <Box component="span" sx={{ mr: 0.75 }}>{step.icon}</Box>}
                            {step.label}
                          </Typography>
                        </TableCell>
                        <TableCell data-label={t('chores:routines.usedBy')} className={names.length ? undefined : 'stack-empty'}>
                          {names.length
                            ? <Typography variant="body2" color="text.secondary">{names.join(', ')}</Typography>
                            : <Typography variant="caption" color="text.secondary">—</Typography>}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title={t('common:actions.edit')}>
                              <IconButton size="small" color="primary" onClick={() => openStep(step)} aria-label={`${t('common:actions.edit')} ${step.label}`}>
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
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6">{t('chores:routines.heading')}</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button startIcon={<Refresh />} onClick={load} variant="outlined" size="small">{t('common:actions.refresh')}</Button>
                <Button startIcon={<Add />} onClick={() => setEditor({ open: true, routine: null })} variant="contained" size="small" disabled={users.length === 0}>
                  {t('chores:routines.newRoutine')}
                </Button>
              </Box>
            </Box>
            {imported && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => { writeSeen(imported.at); setImported(null); }}>
                {t('chores:routines.imported', { count: imported.routines })}
                {imported.restored > 0 && ` ${t('chores:routines.importedRestored', { count: imported.restored })}`}
              </Alert>
            )}
            <Alert severity="info" sx={{ mb: 2 }}>{t('chores:routines.intro')}</Alert>
            <TableContainer component={Paper}>
              {selected.size > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover' }}>
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    {t('chores:schedules.selectedCount', { count: selected.size })}
                  </Typography>
                  <Button size="small" variant="contained" color="error" startIcon={<Delete />} onClick={() => setBulkDialog(true)}>
                    {t('chores:schedules.deleteSelected')}
                  </Button>
                  <Button size="small" onClick={() => setSelected(new Set())}>{t('common:actions.clear')}</Button>
                </Box>
              )}
              <Table size="small" sx={compactStackedTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={routines.length > 0 && selected.size === routines.length}
                        indeterminate={selected.size > 0 && selected.size < routines.length}
                        disabled={routines.length === 0}
                        onChange={toggleAll}
                        slotProps={{ input: { 'aria-label': t('chores:routines.selectAll') } }}
                      />
                    </TableCell>
                    <TableCell>{t('chores:routines.name')}</TableCell>
                    <TableCell>{t('chores:routines.person')}</TableCell>
                    <TableCell>{t('chores:routines.when')}</TableCell>
                    <TableCell>{t('chores:routines.steps')}</TableCell>
                    <TableCell>{t('chores:routines.reward')}</TableCell>
                    <TableCell>{t('common:labels.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {routines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">{t('chores:routines.noRoutines')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : routines.map((routine) => (
                    <TableRow key={routine.id} selected={selected.has(routine.id)}>
                      {/* `stack-select`: on a phone it sits before the name, as in Chores. */}
                      <TableCell padding="checkbox" className="stack-select">
                        <Checkbox
                          size="small"
                          checked={selected.has(routine.id)}
                          onChange={() => toggleSelected(routine.id)}
                          slotProps={{ input: { 'aria-label': t('chores:routines.selectRoutine', { name: routine.name, person: userName(routine.user_id) }) } }}
                        />
                      </TableCell>
                      <TableCell data-label={t('chores:routines.name')}>
                        <Typography variant="body2" fontWeight="bold">
                          {routine.icon && <Box component="span" sx={{ mr: 0.75 }}>{routine.icon}</Box>}
                          {routine.name}
                        </Typography>
                        {(routine.start_time || routine.end_time) && (
                          <Typography variant="caption" color="text.secondary">
                            🕑 {routine.start_time || ''}{routine.end_time ? `–${routine.end_time}` : ''}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell data-label={t('chores:routines.person')}>{userName(routine.user_id)}</TableCell>
                      <TableCell data-label={t('chores:routines.when')}>{when(routine)}</TableCell>
                      <TableCell data-label={t('chores:routines.steps')}>
                        {routine.steps.length
                          ? <Chip size="small" variant="outlined" label={t('chores:routines.stepCount', { count: routine.steps.length })} />
                          : <Chip size="small" color="warning" label={t('chores:routines.needsSteps')} />}
                      </TableCell>
                      <TableCell data-label={t('chores:routines.reward')} className={routine.milestone_every && routine.milestone_clams ? undefined : 'stack-empty'}>
                        {routine.milestone_every && routine.milestone_clams
                          ? <Chip size="small" color="primary" label={t('chores:routines.rewardChip', { every: routine.milestone_every, clams: routine.milestone_clams })} />
                          : <Typography variant="caption" color="text.secondary">—</Typography>}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title={t('common:actions.edit')}>
                            <IconButton size="small" color="primary" onClick={() => setEditor({ open: true, routine })} aria-label={`${t('common:actions.edit')} ${routine.name}`}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('common:actions.delete')}>
                            <IconButton size="small" color="error" onClick={() => setDeleting(routine)} aria-label={`${t('common:actions.delete')} ${routine.name}`}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
      </CardContent>
    </Card>
  );
}
