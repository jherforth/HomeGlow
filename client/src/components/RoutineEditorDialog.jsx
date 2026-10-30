import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, Cancel, Close, Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getWeekdayLabels } from '../utils/dateUtils.js';
import useIsMobile from '../hooks/useIsMobile.js';
import ChoreIconPicker from './ChoreIconPicker.jsx';
import ExpiresSelect from './ExpiresSelect.jsx';
import RoutineStepDialog from './RoutineStepDialog.jsx';
import { routineStepOptions } from '../utils/routineStepOptions.js';

const blank = (users) => ({
  name: '',
  icon: '',
  user_id: users[0]?.id ?? '',
  // Made for each person picked, one routine each.
  user_ids: users[0] ? [users[0].id] : [],
  trigger: 'days',
  days: [],
  match_text: '',
  whole_word: true,
  lead_minutes: 0,
  calendar_source_ids: [],
  steps: [],
  start_time: '',
  end_time: '',
  // Minutes after the end time it expires (issue #279); '' = never.
  expire_minutes: '',
  milestone_every: 0,
  milestone_clams: 0,
});

const fromRoutine = (routine) => ({
  name: routine.name || '',
  icon: routine.icon || '',
  user_id: routine.user_id,
  user_ids: [routine.user_id],
  trigger: routine.trigger === 'calendar' ? 'calendar' : 'days',
  days: routine.days || [],
  match_text: routine.match_text || '',
  whole_word: routine.whole_word !== 0,
  lead_minutes: routine.lead_minutes || 0,
  calendar_source_ids: routine.calendar_source_ids || [],
  steps: routine.steps || [],
  start_time: routine.start_time || '',
  end_time: routine.end_time || '',
  expire_minutes: routine.expire_minutes ?? '',
  milestone_every: routine.milestone_every || 0,
  milestone_clams: routine.milestone_clams || 0,
});

// Family → Routines: making or changing one routine. A routine is a set of
// steps from the library, for one person, on chosen weekdays or on days with
// a matching calendar event (routes/routines.js keeps its chore in step).
// A step made here (typed, or from a chore) joins the library through
// onStepAdded as well as this routine.
export default function RoutineEditorDialog({ open, routine, steps, users, sources, onClose, onSaved, onStepAdded }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const [form, setForm] = useState(() => blank(users));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [chores, setChores] = useState([]);
  const [stepInput, setStepInput] = useState('');
  const [newStep, setNewStep] = useState({ open: false, step: null });

  useEffect(() => {
    if (!open) return;
    setForm(routine ? fromRoutine(routine) : blank(users));
    setError(null);
    setStepInput('');
  }, [open, routine, users]);

  // Chores, to offer as steps. Without them the picker still has the library.
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    axios.get(`${API_BASE_URL}/api/chores`)
      .then((res) => { if (live) setChores(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (live) setChores([]); });
    return () => { live = false; };
  }, [open]);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const library = new Map(steps.map((step) => [step.id, step]));
  const stepOptions = routineStepOptions({ steps, used: form.steps, chores, input: stepInput });
  const weekdays = getWeekdayLabels(0);

  const move = (index, delta) => {
    const next = [...form.steps];
    const [taken] = next.splice(index, 1);
    next.splice(index + delta, 0, taken);
    set({ steps: next });
  };

  const addStep = (step) => setForm((current) => ({ ...current, steps: [...current.steps, step.id] }));

  const added = (step) => {
    onStepAdded?.(step);
    addStep(step);
  };

  const pickStep = async (option) => {
    setStepInput('');
    if (option.kind === 'step') return addStep(option);
    if (option.kind === 'create') return setNewStep({ open: true, step: { label: option.label, icon: '' } });
    // A chore becomes a step with its title and icon; nothing else carries over.
    try {
      const res = await axios.post(`${API_BASE_URL}/api/routine-steps`, { label: option.label, icon: option.icon || null });
      added(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || t('chores:routines.saveFailed'));
    }
    return undefined;
  };

  const stepGroup = (option) => (option.kind === 'step' ? t('chores:routines.yourSteps') : option.kind === 'chore' ? t('chores:routines.fromChores') : '');

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { user_ids: userIds, ...rest } = form;
      const body = {
        ...rest,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        expire_minutes: canExpire && form.expire_minutes !== '' ? form.expire_minutes : null,
        // Editing changes one routine, for its one person; making one makes
        // it for each person picked.
        ...(routine ? { user_id: Number(form.user_id) } : { user_ids: userIds.map(Number) }),
      };
      const response = routine
        ? await axios.patch(`${API_BASE_URL}/api/routines/${routine.id}`, body)
        : await axios.post(`${API_BASE_URL}/api/routines`, body);
      onSaved(response.data);
    } catch (err) {
      setError(err?.response?.data?.error || t('chores:routines.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const calendar = form.trigger === 'calendar';

  // It expires after its end time; a weekday routine's chore is due at its

  // start time, so it needs that too.

  const canExpire = Boolean(form.end_time) && (calendar || Boolean(form.start_time));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      slotProps={{ paper: { component: 'form', onSubmit: (event) => { event.preventDefault(); save(); } } }}
    >
      <DialogTitle>{routine ? t('chores:routines.editTitle') : t('chores:routines.newTitle')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {routine && <Alert severity="info">{t('chores:routines.editHelp')}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            fullWidth
            size="small"
            required
            label={t('chores:routines.name')}
            placeholder={t('chores:routines.namePlaceholder')}
            value={form.name}
            onChange={(event) => set({ name: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <ChoreIconPicker value={form.icon} onChange={(icon) => set({ icon })} />

          {routine ? (
            <FormControl fullWidth size="small">
              <InputLabel id="routine-person">{t('chores:routines.person')}</InputLabel>
              <Select
                labelId="routine-person"
                label={t('chores:routines.person')}
                value={form.user_id}
                onChange={(event) => set({ user_id: event.target.value })}
              >
                {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.username}</MenuItem>)}
              </Select>
            </FormControl>
          ) : (
            <FormControl fullWidth size="small">
              <InputLabel id="routine-people">{t('chores:routines.person')}</InputLabel>
              <Select
                labelId="routine-people"
                label={t('chores:routines.person')}
                multiple
                value={form.user_ids}
                onChange={(event) => set({ user_ids: typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value })}
                renderValue={(ids) => users.filter((user) => ids.includes(user.id)).map((user) => user.username).join(', ')}
              >
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    <Checkbox size="small" checked={form.user_ids.includes(user.id)} />
                    <ListItemText primary={user.username} />
                  </MenuItem>
                ))}
              </Select>
              {form.user_ids.length > 1 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t('chores:routines.forEach', { count: form.user_ids.length })}
                </Typography>
              )}
            </FormControl>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('chores:routines.when')}</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={form.trigger}
              onChange={(_, value) => value && set({ trigger: value })}
              aria-label={t('chores:routines.when')}
            >
              <ToggleButton value="days">{t('chores:routines.onDays')}</ToggleButton>
              <ToggleButton value="calendar">📅 {t('chores:routines.onEvents')}</ToggleButton>
            </ToggleButtonGroup>

            {!calendar && (
              <Box sx={{ mt: 1.5 }}>
                <ToggleButtonGroup
                  size="small"
                  value={form.days}
                  onChange={(_, value) => set({ days: value })}
                  aria-label={t('chores:routines.onDays')}
                  sx={{ flexWrap: 'wrap' }}
                >
                  {weekdays.map((label, day) => <ToggleButton key={label} value={day} sx={{ minWidth: 48 }}>{label}</ToggleButton>)}
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('chores:routines.daysHelp')}
                </Typography>
              </Box>
            )}

            {calendar && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    required
                    label={t('chores:routines.eventWords')}
                    placeholder={t('chores:routines.eventPlaceholder')}
                    value={form.match_text}
                    onChange={(event) => set({ match_text: event.target.value })}
                    slotProps={{ htmlInput: { maxLength: 80 } }}
                    sx={{ flex: 1, minWidth: 200 }}
                  />
                  <FormControlLabel
                    control={<Checkbox size="small" checked={form.whole_word} onChange={(event) => set({ whole_word: event.target.checked })} />}
                    label={t('chores:routines.wholeWords')}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>{t('chores:routines.wholeWordsHelp')}</Typography>
                <TextField
                  size="small"
                  type="number"
                  label={t('chores:routines.lead')}
                  helperText={t('chores:routines.leadHelp')}
                  value={form.lead_minutes}
                  onChange={(event) => set({ lead_minutes: Number(event.target.value) || 0 })}
                  slotProps={{ htmlInput: { min: 0, max: 720 } }}
                  sx={{ maxWidth: 320 }}
                />
                {sources.length > 1 && (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>{t('chores:routines.calendars')}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {sources.map((source) => {
                        const on = form.calendar_source_ids.includes(source.id);
                        return (
                          <Chip
                            key={source.id}
                            label={source.name}
                            color={on ? 'primary' : 'default'}
                            variant={on ? 'filled' : 'outlined'}
                            onClick={() => set({
                              calendar_source_ids: on
                                ? form.calendar_source_ids.filter((id) => id !== source.id)
                                : [...form.calendar_source_ids, source.id],
                            })}
                            aria-pressed={on}
                          />
                        );
                      })}
                    </Box>
                    <Typography variant="caption" color="text.secondary">{t('chores:routines.calendarsHelp')}</Typography>
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary">{t('chores:routines.lookahead')}</Typography>
              </Box>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('chores:routines.steps')}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{t('chores:routines.stepsHelp')}</Typography>
            {form.steps.map((stepId, index) => {
              const step = library.get(stepId);
              if (!step) return null;
              return (
                <Box key={stepId} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                  <Typography variant="body2" sx={{ width: 24, color: 'text.secondary' }}>{index + 1}.</Typography>
                  <Typography variant="body2" sx={{ flex: 1 }}>{step.icon ? `${step.icon} ` : ''}{step.label}</Typography>
                  <Tooltip title={t('common:actions.moveUp')}>
                    <span><IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('common:actions.moveUp')}><ArrowUpward fontSize="small" /></IconButton></span>
                  </Tooltip>
                  <Tooltip title={t('common:actions.moveDown')}>
                    <span><IconButton size="small" disabled={index === form.steps.length - 1} onClick={() => move(index, 1)} aria-label={t('common:actions.moveDown')}><ArrowDownward fontSize="small" /></IconButton></span>
                  </Tooltip>
                  <Tooltip title={t('chores:routines.removeStep')}>
                    <IconButton size="small" onClick={() => set({ steps: form.steps.filter((id) => id !== stepId) })} aria-label={t('chores:routines.removeStep')}><Close fontSize="small" /></IconButton>
                  </Tooltip>
                </Box>
              );
            })}
            <Autocomplete
              size="small"
              sx={{ mt: 1, maxWidth: 360 }}
              options={stepOptions}
              value={null}
              inputValue={stepInput}
              onInputChange={(_, value, reason) => { if (reason !== 'reset') setStepInput(value); }}
              onChange={(_, option) => { if (option) pickStep(option); }}
              filterOptions={(options) => options}
              autoHighlight
              groupBy={stepGroup}
              getOptionLabel={(option) => option.label}
              getOptionKey={(option) => `${option.kind}:${option.id ?? option.label}`}
              renderGroup={(params) => (
                <li key={params.key}>
                  {params.group && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5, fontWeight: 600 }}>
                      {params.group}
                    </Typography>
                  )}
                  <Box component="ul" sx={{ p: 0 }}>{params.children}</Box>
                </li>
              )}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                if (option.kind === 'create') {
                  return (
                    <Box component="li" key={key} {...rest} sx={{ gap: 1, color: 'primary.main', fontWeight: 500 }}>
                      <Add fontSize="small" />
                      {option.label ? t('chores:routines.createStep', { name: option.label }) : t('chores:routines.newStep')}
                    </Box>
                  );
                }
                return <li key={key} {...rest}>{`${option.icon ? `${option.icon} ` : ''}${option.label}`}</li>;
              }}
              noOptionsText={t('chores:routines.typeNewStep')}
              renderInput={(params) => (
                <TextField {...params} label={t('chores:routines.addStep')} placeholder={t('chores:routines.addStepPlaceholder')} />
              )}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('chores:routines.time')}</Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                type="time"
                label={t('chores:routines.start')}
                value={form.start_time}
                onChange={(event) => set({ start_time: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                size="small"
                type="time"
                label={t('chores:routines.end')}
                value={form.end_time}
                onChange={(event) => set({ end_time: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{t('chores:routines.timeHelp')}</Typography>
            <ExpiresSelect
              id="routine-expires"
              value={form.expire_minutes}
              onChange={(expire_minutes) => set({ expire_minutes })}
              disabled={!canExpire}
              helperText={canExpire
                ? t('chores:expiry.routineHelp')
                : t(calendar ? 'chores:expiry.needsEndTime' : 'chores:expiry.needsStartAndEnd')}
              sx={{ mt: 2 }}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('chores:routines.reward')}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2">{t('chores:routines.every')}</Typography>
              <TextField
                size="small"
                type="number"
                value={form.milestone_every}
                onChange={(event) => set({ milestone_every: Number(event.target.value) || 0 })}
                slotProps={{ htmlInput: { min: 0, max: 365, 'aria-label': t('chores:routines.everyAria') } }}
                sx={{ width: 90 }}
              />
              <Typography variant="body2">{t('chores:routines.daysInARow')}</Typography>
              <TextField
                size="small"
                type="number"
                value={form.milestone_clams}
                onChange={(event) => set({ milestone_clams: Number(event.target.value) || 0 })}
                slotProps={{ htmlInput: { min: 0, max: 999, 'aria-label': t('chores:routines.clamsAria') } }}
                sx={{ width: 90 }}
              />
              <Typography variant="body2">🥟</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{t('chores:routines.rewardHelp')}</Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose} startIcon={<Cancel />}>{t('common:actions.cancel')}</Button>
        <Button
          type="submit"
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          disabled={saving || !form.name.trim() || (routine ? form.user_id === '' : form.user_ids.length === 0) || (calendar && !form.match_text.trim())}
        >
          {routine ? t('common:actions.save') : t('chores:routines.create')}
        </Button>
      </DialogActions>
      <RoutineStepDialog
        open={newStep.open}
        step={newStep.step}
        onClose={() => setNewStep({ open: false, step: null })}
        onSaved={(step) => { setNewStep({ open: false, step: null }); added(step); }}
      />
    </Dialog>
  );
}
