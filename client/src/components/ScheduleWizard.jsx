import React from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ArrowBack, ArrowForward } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  ANY_DAY_PERIODS,
  afterTiming,
  anyDayTiming,
  everyNTiming,
  monthlyTiming,
  onceTiming,
  weekTiming,
} from '../utils/choreScheduleGroups.js';

// The Add dialog's wizard (Family → Chores, By person): how often, then its
// details, then, for timings that fall on days, what happens if it isn't done
// that day. It ends with onDone(timing, keep), where keep is true for "stays
// until it's done", false for "goes at the end of the day", and null where
// the question doesn't apply. The dialog then asks for the chores and shows a
// summary before adding. The state lives with the dialog (`value`), so Back
// from the chores returns to the step it left.

export const WIZARD_START = {
  step: 'how', how: null, days: [], n: 2, period: '1w', dom: [1], count: 2, unit: 'w', date: '', keep: false,
};

const HOWS = ['days', 'anyDay', 'everyN', 'monthly', 'after', 'once'];
// Timings that fall on days, so "what if it isn't done that day" applies.
const ON_DAYS = ['days', 'everyN', 'monthly'];
const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
const QUICK_DAYS = [
  { key: 'everyDay', days: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'weekdays', days: [1, 2, 3, 4, 5] },
  { key: 'weekends', days: [0, 6] },
];

// The timing the answers so far make, or null while incomplete.
export function wizardTiming(w) {
  switch (w.how) {
    case 'days': return w.days.length ? weekTiming(w.days) : null;
    case 'everyN': return Number(w.n) >= 2 && Number(w.n) <= 60 ? everyNTiming(Number(w.n)) : null;
    case 'anyDay': return anyDayTiming(w.period);
    case 'monthly': return w.dom.length ? monthlyTiming([...w.dom].sort((a, b) => a - b).join(',')) : null;
    case 'after': return Number(w.count) >= 1 && Number(w.count) <= 99 ? afterTiming(`${Number(w.count)}${w.unit}`) : null;
    case 'once': return onceTiming(w.date || null);
    default: return null;
  }
}

export default function ScheduleWizard({ value: w, onChange, onDone, timingLabel, shortDays }) {
  const { t } = useTranslation(['chores', 'common']);
  const set = (patch) => onChange({ ...w, ...patch });
  const timing = wizardTiming(w);
  const asksMissed = ON_DAYS.includes(w.how);

  const option = (key, selected, onClick, title, hint) => (
    <Paper
      key={key}
      variant="outlined"
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        textAlign: 'left',
        p: 1.5,
        cursor: 'pointer',
        width: '100%',
        font: 'inherit',
        color: 'text.primary',
        bgcolor: selected ? 'rgba(var(--accent-rgb), 0.10)' : 'background.paper',
        borderColor: selected ? 'var(--accent)' : 'divider',
        borderWidth: selected ? 2 : 1,
        '&:hover': { bgcolor: selected ? 'rgba(var(--accent-rgb), 0.14)' : 'action.hover' },
      }}
    >
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
    </Paper>
  );

  const heading = (text) => (
    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>{text}</Typography>
  );

  // Step dots: where in the wizard this is, out of the steps this choice has.
  const steps = ['how', 'details', ...(asksMissed || !w.how ? ['missed'] : [])];
  const progress = (
    <Typography variant="caption" color="text.secondary" aria-live="polite">
      {t('chores:wizard.stepOf', { step: steps.indexOf(w.step) + 1, count: steps.length + 2 })}
    </Typography>
  );

  const nav = (onBack, onNext, nextDisabled = false, nextLabel = t('chores:board.next')) => (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pt: 1 }}>
      {onBack && <Button startIcon={<ArrowBack />} onClick={onBack}>{t('chores:board.back')}</Button>}
      <Box sx={{ flex: 1 }} />
      <Button variant="contained" endIcon={<ArrowForward />} onClick={onNext} disabled={nextDisabled}>{nextLabel}</Button>
    </Box>
  );

  if (w.step === 'how') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {progress}
        {heading(t('chores:wizard.howTitle'))}
        {HOWS.map((how) => option(
          how,
          w.how === how,
          () => set({ how, step: 'details' }),
          t(`chores:wizard.how.${how}.title`),
          t(`chores:wizard.how.${how}.hint`),
        ))}
      </Box>
    );
  }

  if (w.step === 'details') {
    const next = () => (asksMissed ? set({ step: 'missed' }) : onDone(timing, null));
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {progress}
        {heading(t(`chores:wizard.details.${w.how}`))}

        {w.how === 'days' && (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {QUICK_DAYS.map(({ key, days }) => (
                <Button key={key} size="small" variant="outlined" onClick={() => set({ days })} sx={{ textTransform: 'none' }}>
                  {t(`chores:board.timing.${key}`)}
                </Button>
              ))}
            </Box>
            <ToggleButtonGroup
              value={w.days}
              onChange={(_, days) => set({ days })}
              aria-label={t('chores:board.pickDays')}
              sx={{ flexWrap: 'wrap' }}
            >
              {DAY_ORDER.map((d) => <ToggleButton key={d} value={d} sx={{ minWidth: 48 }}>{shortDays[d]}</ToggleButton>)}
            </ToggleButtonGroup>
          </>
        )}

        {w.how === 'everyN' && (
          <TextField
            type="number"
            size="small"
            label={t('chores:wizard.everyNLabel')}
            value={w.n}
            onChange={(e) => set({ n: e.target.value })}
            slotProps={{ htmlInput: { min: 2, max: 60 } }}
            sx={{ maxWidth: 180 }}
          />
        )}

        {w.how === 'anyDay' && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}>
              {ANY_DAY_PERIODS.map((period) => option(period, w.period === period, () => set({ period }), t(`chores:wizard.period.${period}`)))}
            </Box>
            <Alert severity="info">{t('chores:wizard.anyDayNote')}</Alert>
          </>
        )}

        {w.how === 'monthly' && (
          <>
            <Box role="group" aria-label={t('chores:wizard.details.monthly')} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5, maxWidth: 360 }}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const on = w.dom.includes(day);
                return (
                  <ToggleButton
                    key={day}
                    value={day}
                    selected={on}
                    size="small"
                    onChange={() => set({ dom: on ? w.dom.filter((d) => d !== day) : [...w.dom, day] })}
                    sx={{ px: 0, minWidth: 0 }}
                  >
                    {day}
                  </ToggleButton>
                );
              })}
            </Box>
            {w.dom.some((d) => d > 28) && (
              <Typography variant="body2" color="text.secondary">{t('chores:board.shortMonths', { day: Math.max(...w.dom) })}</Typography>
            )}
          </>
        )}

        {w.how === 'after' && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              type="number"
              size="small"
              label={t('chores:wizard.afterCount')}
              value={w.count}
              onChange={(e) => set({ count: e.target.value })}
              slotProps={{ htmlInput: { min: 1, max: 99 } }}
              sx={{ width: 120 }}
            />
            <TextField select size="small" label={t('chores:schedules.sleepUnit')} value={w.unit} onChange={(e) => set({ unit: e.target.value })} sx={{ minWidth: 140 }}>
              <MenuItem value="d">{t('chores:schedules.unitDays')}</MenuItem>
              <MenuItem value="w">{t('chores:schedules.unitWeeks')}</MenuItem>
              <MenuItem value="m">{t('chores:schedules.unitMonths')}</MenuItem>
              <MenuItem value="y">{t('chores:schedules.unitYears')}</MenuItem>
            </TextField>
          </Box>
        )}

        {w.how === 'once' && (
          <TextField
            size="small"
            type="date"
            label={t('chores:schedules.dueDateOptional')}
            value={w.date}
            onChange={(e) => set({ date: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ maxWidth: 220 }}
          />
        )}

        {timing && (
          <Typography variant="body2" color="text.secondary">
            {t('chores:wizard.soFar')} <strong>{timingLabel(timing)}</strong>
          </Typography>
        )}
        {nav(() => set({ step: 'how' }), next, !timing)}
      </Box>
    );
  }

  // 'missed'
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {progress}
      {heading(t('chores:wizard.missedTitle'))}
      {option('drop', !w.keep, () => set({ keep: false }), t('chores:wizard.missedDrop'), t('chores:wizard.missedDropHint'))}
      {option('keep', w.keep, () => set({ keep: true }), t('chores:wizard.missedKeep'), t('chores:wizard.missedKeepHint'))}
      {nav(() => set({ step: 'details' }), () => onDone(timing, w.keep), !timing)}
    </Box>
  );
}
