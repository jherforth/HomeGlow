import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { groupSchedulesForUser, onceTiming, scheduleFieldsForTiming } from '../utils/choreScheduleGroups.js';
import ScheduleWizard, { WIZARD_START } from './ScheduleWizard.jsx';
import SchedulePicker, { AddModeToggle, TheirSchedules, readAddMode, storeAddMode, useTimingLabel } from './SchedulePicker.jsx';

// The chore dialog's Schedule button: a chore just made, given a schedule
// for one person at a time. Who → when (the same Picker | Wizard as the
// board's Add) → a summary, then Complete, or Next schedule to give someone
// else their own. Each schedule is saved as it's confirmed, so Cancel only
// drops the one in progress; the chore and the ones already saved stay.

export const BONUS = 'bonus';

/** The POST body for one schedule: who (`'bonus'` is no one), when, and the wizard's "if missed" answer. Pure. */
export function schedulePayload(choreId, who, timing, keep) {
  return {
    chore_id: choreId,
    user_id: who === BONUS ? null : who,
    visible: 1,
    ...scheduleFieldsForTiming(timing),
    ...(keep === null || keep === undefined ? {} : { duration: keep ? 'until-completed' : 'day-of' }),
  };
}

const freshStep = () => ({ step: 'who', who: null, timing: null, keep: null, fromWizard: false, wizard: WIZARD_START, date: '' });

export default function ScheduleChoreDialog({ chore, users, schedules, onClose, onChanged, showMessage }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const { timingLabel, shortDays } = useTimingLabel();
  const [flow, setFlow] = useState(freshStep);
  const [saved, setSaved] = useState([]); // [{ who, timing }], this chore's schedules made here
  const [mode, setModeState] = useState(readAddMode);
  const [busy, setBusy] = useState(false);
  const setMode = (next) => { setModeState(next); storeAddMode(next); };

  // Each chore starts over.
  useEffect(() => {
    setFlow(freshStep());
    setSaved([]);
    setModeState(readAddMode());
  }, [chore?.id]);

  const people = users.filter((u) => u.id > 0);
  const nameOf = (who) => (who === BONUS ? t('chores:board.bonusTab') : (users.find((u) => u.id === who)?.username || ''));
  const choreName = chore ? `${chore.icon ? `${chore.icon} ` : ''}${chore.title}` : '';
  const userId = flow.who === BONUS ? null : flow.who;
  const groups = useMemo(() => (flow.who === null ? [] : groupSchedulesForUser(schedules, userId)), [schedules, flow.who, userId]);
  const timing = flow.timing?.kind === 'once' ? onceTiming(flow.date || null) : flow.timing;
  const wizardMode = mode === 'wizard';
  // Who, the wizard's steps for the answers given, and the summary.
  const wizardSteps = ['days', 'everyN', 'monthly'].includes(flow.wizard.how) || !flow.wizard.how ? 5 : 4;

  const pick = (tm) => setFlow((f) => ({ ...f, step: 'review', timing: tm, keep: null, fromWizard: false, date: tm.kind === 'once' ? (tm.dueDate || '') : '' }));
  const finishWizard = (tm, keep) => setFlow((f) => ({ ...f, step: 'review', timing: tm, keep, fromWizard: true, date: tm.kind === 'once' ? (tm.dueDate || '') : '' }));

  // Saves the schedule on the summary; then either closes or starts the next.
  const save = async (then) => {
    setBusy(true);
    try {
      await axios.post(`${API_BASE_URL}/api/chore-schedules`, schedulePayload(chore.id, flow.who, timing, flow.keep));
    } catch (err) {
      showMessage('error', err.response?.data?.error || t('common:errors.saveFailed'));
      setBusy(false);
      return;
    }
    const all = [...saved, { who: flow.who, timing }];
    setSaved(all);
    await onChanged();
    setBusy(false);
    if (then === 'next') {
      showMessage('success', t('chores:scheduleFlow.savedOne', { name: nameOf(flow.who), timing: timingLabel(timing) }));
      setFlow(freshStep());
    } else {
      showMessage('success', t('chores:scheduleFlow.done', { count: all.length, chore: chore.title }));
      onClose();
    }
  };

  const savedList = saved.length > 0 && (
    <Typography variant="body2" color="text.secondary">
      {t('chores:scheduleFlow.savedSoFar')} {saved.map((s) => `${nameOf(s.who)} · ${timingLabel(s.timing)}`).join('; ')}
    </Typography>
  );

  const renderWho = () => {
    const options = [...people.map((u) => ({ who: u.id, name: u.username, hint: null })), { who: BONUS, name: t('chores:board.bonusTab'), hint: t('chores:scheduleFlow.bonusHint') }];
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {wizardMode && <Typography variant="caption" color="text.secondary">{t('chores:wizard.stepOf', { step: 1, count: wizardSteps })}</Typography>}
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('chores:scheduleFlow.whoTitle')}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {options.map((o) => {
            const done = saved.find((s) => s.who === o.who);
            return (
              <Paper
                key={o.who}
                variant="outlined"
                component="button"
                type="button"
                disabled={!!done}
                onClick={() => setFlow((f) => ({ ...f, step: 'timing', who: o.who }))}
                sx={{
                  textAlign: 'left', p: 1.5, bgcolor: 'background.paper', color: 'text.primary', font: 'inherit',
                  cursor: done ? 'default' : 'pointer', opacity: done ? 0.6 : 1,
                  '&:hover': done ? {} : { bgcolor: 'action.hover' },
                }}
              >
                <Typography sx={{ fontWeight: 700 }}>{o.name}</Typography>
                {(done || o.hint) && (
                  <Typography variant="body2" color="text.secondary">
                    {done ? t('chores:scheduleFlow.scheduled', { timing: timingLabel(done.timing) }) : o.hint}
                  </Typography>
                )}
              </Paper>
            );
          })}
        </Box>
        {savedList}
      </Box>
    );
  };

  const renderTiming = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {wizardMode ? (
        <ScheduleWizard
          value={flow.wizard}
          onChange={(wizard) => setFlow((f) => ({ ...f, wizard }))}
          onDone={finishWizard}
          timingLabel={timingLabel}
          shortDays={shortDays}
          stepsBefore={1}
          stepsAfter={1}
        />
      ) : (
        <SchedulePicker onPick={pick} timingLabel={timingLabel} shortDays={shortDays} />
      )}
      {(!wizardMode || flow.wizard.step === 'how') && (
        <TheirSchedules groups={groups} personName={nameOf(flow.who)} timingLabel={timingLabel} onPick={pick} />
      )}
    </Box>
  );

  const renderReview = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {flow.fromWizard && <Typography variant="caption" color="text.secondary">{t('chores:wizard.stepOf', { step: wizardSteps, count: wizardSteps })}</Typography>}
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(var(--accent-rgb), 0.06)', borderColor: 'var(--accent)' }}>
        <Typography sx={{ fontWeight: 600 }}>
          {t('chores:wizard.reviewSentence', { name: nameOf(flow.who), chores: choreName, timing: timingLabel(timing) })}
        </Typography>
        {flow.keep === true && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('chores:scheduleFlow.reviewKeep')}</Typography>}
        {flow.keep === false && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('chores:scheduleFlow.reviewDrop')}</Typography>}
        {timing?.kind === 'anyDay' && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('chores:wizard.anyDayNote')}</Typography>}
      </Paper>
      {/* The picker's One-time has no date yet; the wizard asked for it. */}
      {timing?.kind === 'once' && !flow.fromWizard && (
        <TextField
          size="small"
          type="date"
          label={t('chores:schedules.dueDateOptional')}
          value={flow.date}
          onChange={(e) => setFlow((f) => ({ ...f, date: e.target.value }))}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ maxWidth: 220 }}
        />
      )}
      {savedList}
      <Alert severity="info" icon={false}>
        <Typography variant="body2">{t('chores:scheduleFlow.nextInfo')}</Typography>
        <Button variant="outlined" size="small" onClick={() => save('next')} disabled={busy} sx={{ mt: 1, textTransform: 'none' }}>
          {t('chores:scheduleFlow.next')}
        </Button>
      </Alert>
    </Box>
  );

  const title = flow.step === 'review'
    ? t('chores:scheduleFlow.reviewTitle')
    : flow.step === 'timing'
      ? t('chores:scheduleFlow.titleFor', { chore: chore?.title || '', name: nameOf(flow.who) })
      : t('chores:scheduleFlow.title', { chore: chore?.title || '' });

  return (
    <Dialog open={!!chore} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
      {/* Picker | Wizard sits beside the title, not in it, so it stays out of
          the dialog's name. On a phone it takes its own row. */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, pr: 3 }}>
        <DialogTitle sx={{ flex: { xs: '1 1 100%', sm: 1 } }}>{title}</DialogTitle>
        {flow.step === 'timing' && <AddModeToggle value={mode} onChange={setMode} sx={{ ml: { xs: 3, sm: 0 }, mb: { xs: 1.5, sm: 0 } }} />}
      </Box>
      <DialogContent dividers>
        {chore && (flow.step === 'who' ? renderWho() : flow.step === 'timing' ? renderTiming() : renderReview())}
      </DialogContent>
      <DialogActions>
        {flow.step === 'timing' && (
          <Button onClick={() => setFlow((f) => ({ ...f, step: 'who' }))} sx={{ mr: 'auto' }}>{t('chores:board.back')}</Button>
        )}
        {flow.step === 'review' && (
          // Back to the wizard keeps its answers; the picker starts over.
          <Button onClick={() => setFlow((f) => ({ ...f, step: 'timing' }))} sx={{ mr: 'auto' }} disabled={busy}>{t('chores:board.back')}</Button>
        )}
        <Button onClick={onClose} disabled={busy}>{t('common:actions.cancel')}</Button>
        {flow.step === 'review' && (
          <Button variant="contained" onClick={() => save('finish')} disabled={busy} startIcon={busy ? <CircularProgress size={16} /> : null}>
            {t('chores:scheduleFlow.complete')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
