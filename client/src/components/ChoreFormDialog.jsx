import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Cancel, Delete, Save, Schedule } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { editWholeNumber, savedWholeNumber } from '../utils/wholeNumberField.js';
import useIsMobile from '../hooks/useIsMobile.js';
import ChoreIconPicker from './ChoreIconPicker.jsx';
import {
  MAX_FOLLOWUPS,
  defaultChoreForm,
  followupFormError,
  followupRowFromRule,
  followupRuleFromRow,
  newFollowupRow,
} from '../utils/choreFollowups.js';

// The admin console's New Chore dialog — and the widget's Add Chore dialog
// too: this is the one implementation both entries render, not two copies.
// Identity first (title, description, clam value, icon — the icon belongs
// to the chore, not the schedule, so every schedule of it inherits it,
// issue #141), then follow-ups (issue #241), then either Create on its own
// or Schedule, which hands the saved chore to ScheduleChoreDialog.
//
// Hosts differ only in plumbing, passed in as props: `onSaved` refreshes
// the host's lists (and, in Admin, resets the person filter for a new
// chore), `onSchedule` opens the host's ScheduleChoreDialog for the saved
// chore, and `showMessage` is the host's toast (Admin) or error-only alert
// (the widget has no toast system). `chores` is the list a follow-up may
// give — Admin passes its non-routine chores, the widget its non-routine
// ones — and `users` the people a follow-up may go to.
//
// `scheduleOnly` (the widget): Schedule is the only way to save, and Enter
// does the same. The dashboard shows only scheduled chores and has no toast,
// so a chore saved with Create alone would seem to vanish.
export default function ChoreFormDialog({ open, chore, chores, users, offerSchedule, scheduleOnly = false, onClose, onSaved, onSchedule, showMessage }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const [choreForm, setChoreForm] = useState(defaultChoreForm);
  // The chore dialog's follow-ups, as form rows (issue #241).
  const [followupRows, setFollowupRows] = useState([]);
  const [followupError, setFollowupError] = useState('');
  const [savingChore, setSavingChore] = useState(false);
  // The chore being edited — null while creating — or the id a new chore was
  // saved under, so a follow-up problem below can be fixed and saved again
  // without a duplicate.
  const [savedChore, setSavedChore] = useState(null);

  // (Re)opening starts over: a fresh form for a new chore, the chore's own
  // values plus its saved follow-ups for an edit.
  useEffect(() => {
    if (!open) return;
    setSavedChore(chore || null);
    setChoreForm(chore
      ? { title: chore.title, description: chore.description || '', clam_value: chore.clam_value || 0, icon: chore.icon || '' }
      : defaultChoreForm);
    setFollowupRows([]);
    setFollowupError('');
    if (chore?.id) {
      axios.get(`${API_BASE_URL}/api/chores/${chore.id}/followups`)
        .then((res) => setFollowupRows((res.data || []).map(followupRowFromRule)))
        .catch(() => setFollowupRows([]));
    }
  }, [open, chore]);

  const getUserName = (userId) => {
    if (userId === null || userId === undefined || userId === 0) return 'Unassigned';
    const user = users.find(u => u.id === userId);
    return user ? user.username : t('chores:schedules.unknownUser', { id: userId });
  };

  const updateFollowupRow = (index, changes) => {
    setFollowupError('');
    setFollowupRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  };

  // With thenSchedule, a saved chore goes straight on to the Schedule flow.
  const handleSaveChore = async (thenSchedule = false) => {
    if (!choreForm.title.trim()) return;
    const formError = followupFormError(followupRows);
    if (formError) { setFollowupError(t(formError.key, { n: formError.n })); return; }
    setSavingChore(true);
    // A cleared clam field edits as ''; the server gets 0 for it, as before.
    const chorePayload = { ...choreForm, clam_value: savedWholeNumber(choreForm.clam_value) };
    const editing = savedChore;
    let choreId = editing?.id;
    try {
      if (editing) {
        await axios.patch(`${API_BASE_URL}/api/chores/${editing.id}`, chorePayload);
      } else {
        const res = await axios.post(`${API_BASE_URL}/api/chores`, chorePayload);
        choreId = res.data?.id;
        // Saved: from here on this dialog is editing it, so a follow-up
        // problem below can be fixed and saved again without a duplicate.
        if (choreId) setSavedChore({ id: choreId, ...chorePayload });
      }
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to save chore.');
      setSavingChore(false);
      return;
    }
    const saved = { id: choreId, ...chorePayload };
    try {
      if (choreId && (editing || followupRows.length)) {
        await axios.put(`${API_BASE_URL}/api/chores/${choreId}/followups`, {
          followups: followupRows.map(followupRuleFromRow),
        });
      }
      showMessage('success', editing ? 'Chore updated.' : 'Chore created.');
      onClose();
      onSaved(saved, { isNew: !editing });
      if (thenSchedule && choreId) onSchedule(saved);
    } catch (err) {
      // The chore itself is saved; the dialog stays open on the follow-ups,
      // and the host's list refreshes so the saved chore shows.
      setFollowupError(err.response?.data?.error || t('chores:followups.errorSave'));
      onSaved(saved, { isNew: !editing });
    } finally {
      setSavingChore(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: (event) => {
            event.preventDefault();
            handleSaveChore(scheduleOnly);
          },
        }
      }}
    >
      <DialogTitle>{savedChore ? t('chores:schedules.editChore') : t('chores:schedules.newChore')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            size="small"
            label={t('common:labels.title')}
            value={choreForm.title}
            onChange={(e) => setChoreForm(f => ({ ...f, title: e.target.value }))}
            required
          />
          <TextField
            fullWidth
            size="small"
            label={t('common:labels.description')}
            value={choreForm.description}
            onChange={(e) => setChoreForm(f => ({ ...f, description: e.target.value }))}
            multiline
            rows={2}
          />
          <TextField
            size="small"
            label={t('chores:schedules.clamValue')}
            type="number"
            value={choreForm.clam_value}
            onChange={(e) => setChoreForm(f => ({ ...f, clam_value: editWholeNumber(e.target.value) }))}
            slotProps={{ htmlInput: { min: 0 } }}
            sx={{ width: { xs: '100%', sm: 140 } }}
          />
          {/* The icon belongs to the chore, not the schedule, so it is picked
              here and every schedule of this chore inherits it (issue #141). */}
          <ChoreIconPicker
            value={choreForm.icon}
            onChange={(icon) => setChoreForm(f => ({ ...f, icon }))}
          />

          {/* Follow-ups (issue #241). Nothing but one button until used. */}
          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('chores:followups.heading')}{' '}
              <Typography component="span" variant="caption" color="text.secondary">{t('chores:followups.optional')}</Typography>
            </Typography>
            {followupRows.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {t('chores:followups.help')}
              </Typography>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
              {followupRows.map((row, index) => (
                <Box
                  key={index}
                  sx={{ border: '1px solid var(--card-border)', borderRadius: 'var(--hg-radius-sm)', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}
                >
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <FormControl fullWidth size="small">
                      <InputLabel id={`followup-${index}-give-label`}>{t('chores:followups.give')}</InputLabel>
                      <Select
                        labelId={`followup-${index}-give-label`}
                        value={row.followup_chore_id}
                        label={t('chores:followups.give')}
                        onChange={(e) => updateFollowupRow(index, { followup_chore_id: e.target.value })}
                      >
                        {chores.filter((c) => c.id !== savedChore?.id).map((c) => (
                          <MenuItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.title}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Tooltip title={t('chores:followups.remove')}>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={t('chores:followups.remove')}
                        onClick={() => { setFollowupError(''); setFollowupRows((rows) => rows.filter((_, i) => i !== index)); }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <FormControl fullWidth size="small">
                    <InputLabel id={`followup-${index}-to-label`}>{t('chores:followups.to')}</InputLabel>
                    <Select
                      labelId={`followup-${index}-to-label`}
                      multiple
                      value={row.user_ids}
                      label={t('chores:followups.to')}
                      onChange={(e) => updateFollowupRow(index, { user_ids: e.target.value })}
                      renderValue={(ids) => ids.map(getUserName).join(', ')}
                    >
                      {users.filter((u) => u.id > 0).map((u) => (
                        <MenuItem key={u.id} value={u.id}>
                          <Checkbox size="small" checked={row.user_ids.includes(u.id)} sx={{ p: 0.5, mr: 1 }} />
                          <ListItemText primary={u.username} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <InputLabel id={`followup-${index}-when-label`}>{t('chores:followups.when')}</InputLabel>
                      <Select
                        labelId={`followup-${index}-when-label`}
                        value={row.timing}
                        label={t('chores:followups.when')}
                        onChange={(e) => updateFollowupRow(index, { timing: e.target.value })}
                      >
                        <MenuItem value="now">{t('chores:followups.rightAway')}</MenuItem>
                        <MenuItem value="after">{t('chores:followups.after')}</MenuItem>
                      </Select>
                    </FormControl>
                    {row.timing === 'after' && (
                      <>
                        <TextField
                          size="small"
                          type="number"
                          value={row.amount}
                          onChange={(e) => updateFollowupRow(index, { amount: e.target.value })}
                          slotProps={{ htmlInput: { min: 1, 'aria-label': t('chores:followups.amount') } }}
                          sx={{ width: 90 }}
                        />
                        <FormControl size="small" sx={{ minWidth: 110 }}>
                          <Select
                            value={row.unit}
                            onChange={(e) => updateFollowupRow(index, { unit: e.target.value })}
                            inputProps={{ 'aria-label': t('chores:followups.unit') }}
                          >
                            <MenuItem value="minutes">{t('chores:followups.minutes')}</MenuItem>
                            <MenuItem value="hours">{t('chores:followups.hours')}</MenuItem>
                          </Select>
                        </FormControl>
                      </>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
            {followupError && <Alert severity="error" sx={{ mt: 1.5 }}>{followupError}</Alert>}
            {followupRows.length < MAX_FOLLOWUPS && (
              <Button
                type="button"
                size="small"
                startIcon={<Add />}
                sx={{ mt: 1 }}
                onClick={() => { setFollowupError(''); setFollowupRows((rows) => [...rows, newFollowupRow()]); }}
              >
                {t('chores:followups.add')}
              </Button>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose} startIcon={<Cancel />}>{t('common:actions.cancel')}</Button>
        {!scheduleOnly && (
          <Button
            type="submit"
            variant={offerSchedule ? 'outlined' : 'contained'}
            startIcon={savingChore ? <CircularProgress size={16} /> : <Save />}
            disabled={savingChore || !choreForm.title.trim()}
          >
            {savingChore ? 'Saving...' : savedChore ? 'Update' : 'Create'}
          </Button>
        )}
        {(offerSchedule || scheduleOnly) && (
          <Button
            type={scheduleOnly ? 'submit' : 'button'}
            variant="contained"
            startIcon={savingChore && scheduleOnly ? <CircularProgress size={16} /> : <Schedule />}
            disabled={savingChore || !choreForm.title.trim()}
            onClick={scheduleOnly ? undefined : () => handleSaveChore(true)}
          >
            {t('chores:scheduleFlow.scheduleButton')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
