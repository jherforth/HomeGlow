import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, ContentCopy, Delete, Edit, Warning } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminNote, AdminRow } from './AdminRows.jsx';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getWeekdayLabels } from '../utils/dateUtils.js';
import useIsMobile from '../hooks/useIsMobile.js';

export const routineIconBox = (icon) => (
  <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: icon ? 'action.hover' : 'transparent', display: 'grid', placeItems: 'center', fontSize: 18 }}>
    {icon || ''}
  </Box>
);

// Admin → Family → Chores: the routines, between the chore definitions and
// the schedules. A routine is a checklist of steps for one person, ticked in
// its card on the Chores widget. The editor is the page's own (onNew,
// onEdit, and onCopy for someone else), as the schedule views open it too.
export default function RoutinesGroup({ routines, users, imported, onDismissImported, onNew, onEdit, onCopy, onChanged, flash }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const [deleting, setDeleting] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
      await onChanged();
      flash('success', t('chores:routines.bulkDeleteSuccess', { count }));
    } catch {
      flash('error', t('chores:routines.bulkDeleteError'));
    } finally {
      setBulkDeleting(false);
    }
  };

  const userName = (id) => users.find((user) => user.id === id)?.username || '?';
  const weekdays = getWeekdayLabels(0);

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
      onChanged();
    } catch (error) {
      flash('error', error?.response?.data?.error || t('chores:routines.deleteFailed'));
    }
  };

  return (
    <>
      {imported && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={onDismissImported}>
          {t('chores:routines.imported', { count: imported.routines })}
          {imported.restored > 0 && ` ${t('chores:routines.importedRestored', { count: imported.restored })}`}
        </Alert>
      )}
      <AdminGroup
        id="admin-routines"
        title={t('chores:routines.heading')}
        action={(
          <Button startIcon={<Add />} onClick={onNew} variant="contained" size="small" disabled={users.length === 0}>
            {t('chores:routines.newRoutine')}
          </Button>
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
                {routineIconBox(routine.icon)}
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
                  <IconButton size="small" onClick={() => onEdit(routine)} aria-label={`${t('common:actions.edit')} ${routine.name}`}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('chores:routines.copy')}>
                  <IconButton size="small" onClick={() => onCopy(routine)} aria-label={`${t('chores:routines.copy')}: ${routine.name}`}>
                    <ContentCopy fontSize="small" />
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
    </>
  );
}
