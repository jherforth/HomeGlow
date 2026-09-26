import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  RadioGroup,
  Radio,
  Grid
} from '@mui/material';
import { Schedule } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  CRONTAB_PRESETS,
  daysToCrontab,
  computeCrontab,
  getNextOccurrence,
  getAfterCompletionExplanation,
  getDayOptions
} from '../utils/choreScheduleUtils.js';

export default function ChoreScheduleFields({ form, onChange, crontabError }) {
  const { t } = useTranslation(['chores', 'common']);

  const currentCrontab = computeCrontab(form);
  const nextOccurrence = form.scheduleMode === 'calendar'
    ? (form.calendar_match
      ? t('chores:schedules.eventMatches', { title: form.calendar_match, defaultValue: `When event matches "${form.calendar_match}"` })
      : t('chores:schedules.matchingEventOccurs', { defaultValue: 'When matching event occurs' }))
    : form.scheduleMode === 'after-completion'
      ? t('chores:schedules.immediatelyUntilCompleted')
      : getNextOccurrence(currentCrontab);

  const isOnceCompletedMissingInterval = !form.isOneTime
    && (form.scheduleMode === 'after-completion' || form.duration === 'once-completed')
    && !(Number.isInteger(Number.parseInt(form.sleepCount, 10)) && Number.parseInt(form.sleepCount, 10) > 0);

  const dayOptions = getDayOptions();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={form.isOneTime}
            onChange={(e) => onChange({ isOneTime: e.target.checked })}
          />
        }
        label={t('chores:schedules.oneTimeTask')}
      />

      {!form.isOneTime && (
        <>
          <RadioGroup
            row
            value={form.scheduleMode}
            onChange={(e) => onChange({ scheduleMode: e.target.value })}
          >
            <FormControlLabel value="preset" control={<Radio size="small" />} label={t('chores:schedules.modePreset')} />
            <FormControlLabel value="days" control={<Radio size="small" />} label={t('chores:schedules.modeDaysOfWeek')} />
            <FormControlLabel value="after-completion" control={<Radio size="small" />} label={t('chores:schedules.modeAfterCompletion')} />
            <FormControlLabel value="custom" control={<Radio size="small" />} label={t('chores:schedules.modeCustomCrontab')} />
            <FormControlLabel value="calendar" control={<Radio size="small" />} label={t('chores:schedules.modeCalendar', { defaultValue: 'Calendar Event' })} />
          </RadioGroup>

          {form.scheduleMode !== 'after-completion' ? (
            <FormControl fullWidth size="small">
              <InputLabel>{t('chores:schedules.duration')}</InputLabel>
              <Select
                value={form.duration}
                label={t('chores:schedules.duration')}
                onChange={(e) => onChange({ duration: e.target.value })}
              >
                <MenuItem value="day-of">{t('chores:schedules.dayOf')}</MenuItem>
                <MenuItem value="until-completed">{t('chores:schedules.untilCompleted')}</MenuItem>
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                {form.duration === 'until-completed'
                  ? t('chores:schedules.durationHelpUntilCompleted', { defaultValue: 'This chore will appear daily until completed' })
                  : t('chores:schedules.durationHelpDayOf', { defaultValue: 'This chore will only appear on the day it is scheduled' })}
              </Typography>
            </FormControl>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Grid container spacing={2}>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('chores:schedules.repeatEvery', 'Repeat every')}
                    value={form.sleepCount}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '');
                      onChange({ sleepCount: digitsOnly });
                    }}
                    slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', min: 1 } }}
                    error={isOnceCompletedMissingInterval}
                    helperText={isOnceCompletedMissingInterval ? t('chores:schedules.intervalRequired', 'Required. Use digits only.') : ''}
                  />
                </Grid>
                <Grid size={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('chores:schedules.intervalUnit', 'Unit')}</InputLabel>
                    <Select
                      value={form.sleepUnit}
                      label={t('chores:schedules.intervalUnit', 'Unit')}
                      onChange={(e) => onChange({ sleepUnit: e.target.value })}
                    >
                      <MenuItem value="d">{t('chores:schedules.unitDays')}</MenuItem>
                      <MenuItem value="w">{t('chores:schedules.unitWeeks')}</MenuItem>
                      <MenuItem value="m">{t('chores:schedules.unitMonths')}</MenuItem>
                      <MenuItem value="y">{t('chores:schedules.unitYears')}</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {getAfterCompletionExplanation(form, t)}
              </Typography>
            </Box>
          )}

          {form.scheduleMode === 'preset' && (
            <FormControl fullWidth size="small">
              <InputLabel>{t('chores:schedules.schedulePreset')}</InputLabel>
              <Select
                value={form.selectedPreset}
                label={t('chores:schedules.schedulePreset')}
                onChange={(e) => onChange({ selectedPreset: e.target.value })}
              >
                {CRONTAB_PRESETS.map(p => (
                  <MenuItem key={p.key} value={p.value}>
                    <Box>
                      <Typography variant="body2">{t(`chores:presets.${p.key}`)}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {p.value}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {form.scheduleMode === 'days' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('chores:schedules.selectDays')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {dayOptions.map(day => (
                  <Chip
                    key={day.value}
                    label={day.label}
                    clickable
                    color={form.selectedDays.includes(day.value) ? 'primary' : 'default'}
                    variant={form.selectedDays.includes(day.value) ? 'filled' : 'outlined'}
                    onClick={() => {
                      const next = form.selectedDays.includes(day.value)
                        ? form.selectedDays.filter(d => d !== day.value)
                        : [...form.selectedDays, day.value];
                      onChange({ selectedDays: next });
                    }}
                    size="small"
                  />
                ))}
              </Box>
              {form.selectedDays.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontFamily: 'monospace' }}>
                  Generated: {daysToCrontab(form.selectedDays)}
                </Typography>
              )}
              {form.selectedDays.length === 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {t('chores:schedules.selectAtLeastOneDay')}
                </Alert>
              )}
            </Box>
          )}

          {form.scheduleMode === 'custom' && (
            <TextField
              fullWidth
              size="small"
              label={t('chores:schedules.crontabExpression')}
              value={form.customCrontab}
              onChange={(e) => onChange({ customCrontab: e.target.value })}
              placeholder="0 0 * * 1"
              error={!!crontabError}
              helperText={crontabError || 'Format: minute hour day-of-month month day-of-week'}
              InputProps={{ sx: { fontFamily: 'monospace' } }}
            />
          )}

          {form.scheduleMode === 'calendar' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                fullWidth
                size="small"
                label={t('chores:schedules.calendarMatch', { defaultValue: 'Event Title Contains...' })}
                value={form.calendar_match}
                onChange={(e) => onChange({ calendar_match: e.target.value })}
                placeholder="e.g. Practice, Gymnastics"
                helperText={t('chores:schedules.calendarMatchHelp', { defaultValue: 'Triggers on days matching this event. The chore is due at the event start time and remains visible for the entire day.' })}
                required
              />
            </Box>
          )}
        </>
      )}

      {!crontabError && (
        <Alert severity={form.isOneTime ? 'warning' : 'info'} icon={<Schedule />} sx={{ py: 0.5 }}>
          <Typography variant="body2">
            <strong>{form.isOneTime
              ? t('chores:schedules.oneTimeTaskShort')
              : form.scheduleMode === 'after-completion'
                ? t('chores:schedules.modeAfterCompletion')
                : t('chores:schedules.nextOccurrenceIs', { when: nextOccurrence })}</strong>
          </Typography>
          {!form.isOneTime && form.scheduleMode !== 'after-completion' && currentCrontab && (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {currentCrontab}
            </Typography>
          )}
          {form.scheduleMode === 'after-completion' && (
            <Typography variant="caption" color="text.secondary">
              {getAfterCompletionExplanation(form, t)}
            </Typography>
          )}
          {form.isOneTime && (
            <Typography variant="caption" color="text.secondary">
              {t('chores:schedules.appearsOnce')}
            </Typography>
          )}
        </Alert>
      )}
    </Box>
  );
}
