import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { RETURN_CHOICES, ROTATE_CHOICES, normalizeModeSetting } from '../utils/widgetStacks.js';

// What a Stack does in one mode (utils/widgetStacks.js stackInMode), edited
// the same way from the Stack's window (one row per mode) and the mode's
// window (one row per Stack).

const timeLabel = (t, seconds) => (seconds < 60
  ? t('admin:stacks.seconds', { count: seconds })
  : t('admin:stacks.minutes', { count: seconds / 60 }));

/** One line saying what the mode changes, or "As usual". */
export function stackModeSummary(t, stack, setting, widgetLabel) {
  if (!setting) return t('admin:stacks.modes.asUsual');
  const parts = [];
  const shown = setting.widgets?.length ? stack.widgets.filter((name) => setting.widgets.includes(name)) : stack.widgets;
  const first = shown.includes(setting.first) ? setting.first : shown[0];
  if (first && first !== stack.widgets[0]) parts.push(t('admin:stacks.modes.showsFirst', { name: widgetLabel(first) }));
  const left = stack.widgets.filter((name) => !shown.includes(name));
  if (left.length) parts.push(t('admin:stacks.modes.leavesOut', { names: left.map(widgetLabel).join(', ') }));
  if (setting.returnSeconds != null) {
    parts.push(setting.returnSeconds
      ? t('admin:stacks.modes.backAfter', { time: timeLabel(t, setting.returnSeconds) })
      : t('admin:stacks.modes.neverBack'));
  }
  if (setting.rotateSeconds) parts.push(t('admin:stacks.modes.turnsEvery', { time: timeLabel(t, setting.rotateSeconds) }));
  if (setting.noJump) parts.push(t('admin:stacks.modes.noJumpShort'));
  return parts.length ? parts.join(' · ') : t('admin:stacks.modes.asUsual');
}

/**
 * The fields for one Stack in one mode.
 * - stack: { widgets, returnSeconds, attention }
 * - setting: the mode's setting, or null for as usual
 * - onChange(setting): an object, or null for as usual
 */
export const StackModeFields = ({ stack, setting, onChange, widgetLabel }) => {
  const { t } = useTranslation(['admin']);
  const value = setting || {};
  // Only what differs from usual is kept; nothing left is "as usual".
  const set = (patch) => onChange(normalizeModeSetting({ ...value, ...patch }, stack.widgets));
  const included = value.widgets?.length ? stack.widgets.filter((name) => value.widgets.includes(name)) : stack.widgets;
  const first = included.includes(value.first) ? value.first : included[0];

  const toggle = (name) => {
    const next = included.includes(name) ? included.filter((item) => item !== name) : stack.widgets.filter((item) => item === name || included.includes(item));
    if (next.length === 0) return; // A Stack always holds one.
    set({ widgets: next.length === stack.widgets.length ? undefined : next });
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>{t('admin:stacks.modes.holds')}</Typography>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {stack.widgets.map((name) => {
            const on = included.includes(name);
            return (
              <Chip
                key={name}
                label={widgetLabel(name)}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                onClick={() => toggle(name)}
                aria-pressed={on}
                sx={{ minHeight: 36 }}
              />
            );
          })}
        </Stack>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          size="small"
          label={t('admin:stacks.modes.first')}
          value={first}
          onChange={(e) => set({ first: e.target.value })}
          sx={{ flex: 1 }}
        >
          {included.map((name) => <MenuItem key={name} value={name}>{widgetLabel(name)}</MenuItem>)}
        </TextField>
        <TextField
          select
          size="small"
          label={t('admin:stacks.returnAfter')}
          value={value.returnSeconds ?? ''}
          onChange={(e) => set({ returnSeconds: e.target.value === '' ? undefined : Number(e.target.value) })}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ flex: 1 }}
        >
          <MenuItem value="">
            {t('admin:stacks.modes.usualTime', { time: stack.returnSeconds ? timeLabel(t, stack.returnSeconds) : t('admin:stacks.returnNever') })}
          </MenuItem>
          {RETURN_CHOICES.map((seconds) => (
            <MenuItem key={seconds} value={seconds}>{seconds ? timeLabel(t, seconds) : t('admin:stacks.returnNever')}</MenuItem>
          ))}
        </TextField>
      </Stack>

      <TextField
        select
        size="small"
        label={t('admin:stacks.modes.rotate')}
        value={value.rotateSeconds || 0}
        onChange={(e) => set({ rotateSeconds: Number(e.target.value) || undefined })}
        helperText={t('admin:stacks.modes.rotateHelp')}
        disabled={included.length < 2}
      >
        {ROTATE_CHOICES.map((seconds) => (
          <MenuItem key={seconds} value={seconds}>
            {seconds ? t('admin:stacks.modes.every', { time: timeLabel(t, seconds) }) : t('admin:stacks.modes.rotateOff')}
          </MenuItem>
        ))}
      </TextField>

      {stack.attention.length > 0 && (
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('admin:stacks.modes.noJump')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('admin:stacks.modes.noJumpHelp')}</Typography>
          </Box>
          <Switch
            checked={value.noJump === true}
            onChange={(e) => set({ noJump: e.target.checked || undefined })}
            slotProps={{ input: { 'aria-label': t('admin:stacks.modes.noJump') } }}
          />
        </Stack>
      )}

      {setting && (
        <Box>
          <Button size="small" onClick={() => onChange(null)}>{t('admin:stacks.modes.reset')}</Button>
        </Box>
      )}
    </Stack>
  );
};

/**
 * A list of rows that open into StackModeFields: one per mode (in a Stack's
 * window) or one per Stack (in a mode's window).
 * - rows: [{ key, title, color?, stack, setting }]
 * - onChange(key, setting)
 */
export const StackModeRows = ({ rows, onChange, widgetLabel }) => {
  const { t } = useTranslation(['admin']);
  return (
    <Box sx={{ border: '1px solid var(--card-border)', borderRadius: 2, overflow: 'hidden' }}>
      {rows.map((row) => (
        <Accordion key={row.key} disableGutters elevation={0} square sx={{ '&:before': { display: 'none' }, '& + &': { borderTop: '1px solid var(--card-border)' } }}>
          <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 56 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
              {row.color && <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: row.color, flex: 'none' }} />}
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>{row.title}</Typography>
                <Typography variant="caption" color={row.setting ? 'primary' : 'text.secondary'} sx={{ display: 'block' }}>
                  {stackModeSummary(t, row.stack, row.setting, widgetLabel)}
                </Typography>
              </Box>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <StackModeFields
              stack={row.stack}
              setting={row.setting}
              widgetLabel={widgetLabel}
              onChange={(setting) => onChange(row.key, setting)}
            />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};
