import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getWeekdayLabels, getWeekdayOptions } from '../utils/dateUtils.js';
import {
  COMMON_TIMINGS,
  afterTiming,
  monthlyTiming,
  monthsFromStart,
  weekTiming,
} from '../utils/choreScheduleGroups.js';

// The pieces a schedule is picked with, shared by the board's Add dialog and
// the chore dialog's Schedule flow: the picker of chips, the Picker | Wizard
// switch, the names of timings, and a person's own schedules to join.

// How a timing is picked: the picker of chips, or the wizard. Remembered per
// display; storage may be unavailable.
const ADD_MODE_KEY = 'homeglow_choreAddMode';
export const readAddMode = () => {
  try { return localStorage.getItem(ADD_MODE_KEY) === 'wizard' ? 'wizard' : 'picker'; } catch { return 'picker'; }
};
export const storeAddMode = (mode) => {
  try { localStorage.setItem(ADD_MODE_KEY, mode); } catch { /* per-display convenience only */ }
};

// Sunday first, like the week calendar.
export const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];

export const dateLabel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// "Mar 15" for month 3, day 15 (no year).
const monthDayLabel = (month, day) => new Date(2001, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Quick fills for the day toggles.
const QUICK_DAYS = [
  { key: 'everyDay', days: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'weekdays', days: [1, 2, 3, 4, 5] },
  { key: 'weekends', days: [0, 6] },
];

// The lengths Custom offers, in months.
const CUSTOM_EVERY = [1, 3, 6, 9, 12];
export const todayKeyString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const customStart = () => ({ every: 3, from: 'dates', start: todayKeyString() });

// Custom's choices → a timing, or null while incomplete. Set dates work for
// every 1, 3, 6 and 12 months; 9 doesn't divide the year, so it only counts
// from when the chore is done.
export function customTiming({ every, from, start }) {
  if (from === 'done') return afterTiming(every === 12 ? '1y' : `${every}m`);
  if (every === 9 || !/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return null;
  if (every === 1) return monthlyTiming(String(Number(start.slice(8, 10))));
  return monthsFromStart(start, every);
}

/** The weekday names, and a function naming any timing ("Weekdays", "Mon · Thu"…). */
export function useTimingLabel() {
  const { t } = useTranslation(['chores']);
  const shortDays = useMemo(() => getWeekdayLabels(0), []);
  const longDays = useMemo(() => getWeekdayOptions().map((o) => o.label), []);
  const intervalText = (interval) => {
    const m = String(interval || '').match(/^(\d+)([dwmy])$/i);
    if (!m) return interval || '';
    return t(`chores:board.unit_${m[2].toLowerCase()}`, { count: Number(m[1]) });
  };
  const timingLabel = (timing) => {
    switch (timing.kind) {
      case 'week': {
        const d = timing.days;
        if (d.length === 7) return t('chores:board.timing.everyDay');
        if (d.join() === '1,2,3,4,5') return t('chores:board.timing.weekdays');
        if (d.join() === '0,6') return t('chores:board.timing.weekends');
        if (d.length === 1) return t('chores:board.timing.everyDayName', { day: longDays[d[0]] });
        return DAY_ORDER.filter((x) => d.includes(x)).map((x) => shortDays[x]).join(' · ');
      }
      case 'everyN':
        return timing.n === 2 ? t('chores:board.timing.everyOtherDay') : t('chores:board.timing.everyNDays', { count: timing.n });
      case 'monthly':
        return t('chores:board.timing.monthly', { days: timing.dom.split(',').join(', ') });
      case 'months': {
        const dates = timing.months.map((m) => monthDayLabel(m, timing.dom)).join(', ');
        if (timing.every === 12) return t('chores:board.timing.yearly', { date: dates });
        if (timing.every) return t('chores:board.timing.everyNMonths', { count: timing.every, dates });
        return dates;
      }
      case 'once':
        return timing.dueDate ? t('chores:board.timing.oneTimeOn', { date: dateLabel(timing.dueDate) }) : t('chores:board.timing.oneTime');
      case 'after':
        return t('chores:board.timing.againAfter', { interval: intervalText(timing.interval) });
      case 'anyDay':
        return t(`chores:board.timing.anyDay.${timing.period}`);
      default:
        return t('chores:board.timing.custom', { expr: timing.rest });
    }
  };
  return { timingLabel, shortDays, longDays };
}

/** Picker | Wizard. */
export function AddModeToggle({ value, onChange, sx }) {
  const { t } = useTranslation(['chores']);
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_, mode) => mode && onChange(mode)}
      aria-label={t('chores:wizard.modeLabel')}
      sx={sx}
    >
      <ToggleButton value="picker" sx={{ textTransform: 'none', px: 2 }}>{t('chores:wizard.picker')}</ToggleButton>
      <ToggleButton value="wizard" sx={{ textTransform: 'none', px: 2 }}>{t('chores:wizard.wizard')}</ToggleButton>
    </ToggleButtonGroup>
  );
}

/** Every day / Weekdays / Weekends buttons that fill the day toggles. */
export function QuickDays({ onPick }) {
  const { t } = useTranslation(['chores']);
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: '100%' }}>
      {QUICK_DAYS.map(({ key, days }) => (
        <Button key={key} size="small" variant="outlined" onClick={() => onPick(days)} sx={{ textTransform: 'none' }}>
          {t(`chores:board.timing.${key}`)}
        </Button>
      ))}
    </Box>
  );
}

const panelSx = { mt: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', gap: 1.5 };

/**
 * Custom: every 1, 3, 6, 9 months or a year, on set dates or counted from
 * when it's done. With onNext it picks a timing (Add); without, it only
 * edits set dates (Change days).
 */
export function CustomPanel({ custom, onChange, onNext, timingLabel }) {
  const { t } = useTranslation(['chores']);
  const set = (patch) => {
    const next = { ...custom, ...patch };
    // 9 months can't land on set dates.
    if (next.every === 9) next.from = 'done';
    onChange(next);
  };
  const timing = customTiming(custom);
  return (
    <Box sx={panelSx}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('chores:board.every')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={custom.every} onChange={(_, v) => v && set({ every: v })} aria-label={t('chores:board.every')} sx={{ flexWrap: 'wrap' }}>
          {CUSTOM_EVERY.filter((n) => onNext || n !== 9).map((n) => (
            <ToggleButton key={n} value={n} sx={{ textTransform: 'none', px: 1.5 }}>
              {n === 12 ? t('chores:board.year') : t('chores:board.unit_m', { count: n })}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      {onNext && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('chores:board.countFrom')}</Typography>
          <ToggleButtonGroup size="small" exclusive value={custom.from} onChange={(_, v) => v && set({ from: v })} aria-label={t('chores:board.countFrom')}>
            <ToggleButton value="dates" disabled={custom.every === 9} sx={{ textTransform: 'none', px: 1.5 }}>{t('chores:board.fromDates')}</ToggleButton>
            <ToggleButton value="done" sx={{ textTransform: 'none', px: 1.5 }}>{t('chores:board.fromDone')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}
      {custom.from === 'dates' && (
        <TextField
          size="small"
          type="date"
          label={t('chores:board.startDate')}
          value={custom.start}
          onChange={(e) => set({ start: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ maxWidth: 220 }}
        />
      )}
      <Typography variant="body2" color="text.secondary">
        {custom.every === 9 ? `${t('chores:board.nineMonthsNote')} ` : ''}
        {custom.from === 'done' ? t('chores:board.fromDoneHelp') : (timing && t('chores:board.fromDatesHelp', { timing: timingLabel(timing) }))}
      </Typography>
      {onNext && (
        <Box>
          <Button variant="contained" size="small" disabled={!timing} onClick={() => onNext(timing)}>{t('chores:board.next')}</Button>
        </Box>
      )}
    </Box>
  );
}

function MonthlyPanel({ onNext }) {
  const { t } = useTranslation(['chores']);
  const [value, setValue] = useState('1');
  const dom = Number(value);
  const valid = Number.isInteger(dom) && dom >= 1 && dom <= 31;
  return (
    <Box sx={panelSx}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          type="number"
          label={t('chores:board.dayOfMonth')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          slotProps={{ htmlInput: { min: 1, max: 31 } }}
          sx={{ width: 160 }}
        />
        <Button variant="contained" size="small" disabled={!valid} onClick={() => onNext(monthlyTiming(String(dom)))}>{t('chores:board.next')}</Button>
      </Box>
      {valid && dom > 28 && <Typography variant="body2" color="text.secondary">{t('chores:board.shortMonths', { day: dom })}</Typography>}
    </Box>
  );
}

/**
 * The picker: the common timings as chips, Monthly and Custom panels, and
 * any set of days. Calls onPick(timing). Its choices start over each time it
 * mounts.
 */
export default function SchedulePicker({ onPick, timingLabel, shortDays }) {
  const { t } = useTranslation(['chores']);
  const [panel, setPanel] = useState(null); // 'monthly' | 'custom' while one is open
  const [custom, setCustom] = useState(customStart);
  const [days, setDays] = useState([]);
  return (
    <>
      <Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {COMMON_TIMINGS.map((tm) => (
            <Chip key={tm.key} label={timingLabel(tm)} onClick={() => onPick(tm)} variant="outlined" sx={{ fontSize: '0.875rem', height: 36 }} />
          ))}
          {['monthly', 'custom'].map((p) => (
            <Chip
              key={p}
              label={`${t(`chores:board.${p}Choice`)} …`}
              onClick={() => setPanel((open) => (open === p ? null : p))}
              variant={panel === p ? 'filled' : 'outlined'}
              color={panel === p ? 'primary' : 'default'}
              aria-expanded={panel === p}
              sx={{ fontSize: '0.875rem', height: 36 }}
            />
          ))}
        </Box>
        {panel === 'monthly' && <MonthlyPanel onNext={onPick} />}
        {panel === 'custom' && <CustomPanel custom={custom} onChange={setCustom} onNext={onPick} timingLabel={timingLabel} />}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" value={days} onChange={(_, v) => setDays(v)} aria-label={t('chores:board.pickDays')}>
          {DAY_ORDER.map((d) => <ToggleButton key={d} value={d} sx={{ minWidth: 44 }}>{shortDays[d]}</ToggleButton>)}
        </ToggleButtonGroup>
        <Button variant="contained" size="small" disabled={!days.length} onClick={() => onPick(weekTiming(days))}>
          {t('chores:board.next')}
        </Button>
      </Box>
    </>
  );
}

/**
 * A person's own schedules, under a line saying a chore can join one of
 * them: picking one calls onPick(timing). Nothing when they have none.
 */
export function TheirSchedules({ groups, personName, timingLabel, onPick }) {
  const { t } = useTranslation(['chores']);
  if (!groups.length) return null;
  return (
    <Box>
      <Alert severity="info" icon={false} sx={{ mb: 1 }}>{t('chores:board.orTheirTimings')}</Alert>
      <Typography variant="overline" color="text.secondary">{t('chores:board.theirTimings', { name: personName })}</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {groups.map((g) => (
          <Paper
            key={g.timing.key}
            variant="outlined"
            component="button"
            type="button"
            onClick={() => onPick(g.timing)}
            sx={{ textAlign: 'left', p: 1.5, cursor: 'pointer', bgcolor: 'background.paper', color: 'text.primary', font: 'inherit', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Typography sx={{ fontWeight: 700 }}>{timingLabel(g.timing)}</Typography>
            <Typography variant="body2" color="text.secondary">
              {g.schedules.map((s) => `${s.icon ? `${s.icon} ` : ''}${s.title}`).join(', ')}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
