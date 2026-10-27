import React, { useState } from 'react';
import {
  Box,
  Collapse,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminRow } from './AdminRows.jsx';
import {
  EXPAND_IDLE_CHOICES,
  EXPAND_METHODS,
  normalizeExpandOff,
  setWidgetExpandAllowed,
} from '../utils/widgetExpand.js';

/**
 * Admin → Displays: expanding widgets on this display (utils/widgetExpand.js).
 * Saved with the screensaver settings by the section's Save button.
 *
 * - settings: the screensaver settings being edited
 * - onChange(patch): merge a change into them
 * - widgets: [{ name, label, manifestBlocks }] for the widgets turned on here;
 *   `name` is the widget name ('calendar', 'plugin:Grill.html') and
 *   manifestBlocks is true for a plugin whose manifest says "expand": false.
 */
const ExpandWidgetsSettings = ({ settings, onChange, widgets = [] }) => {
  const { t } = useTranslation('admin');
  // The per-widget list stays folded until asked for, so it never crowds the
  // section on a board with many plugins.
  const [listOpen, setListOpen] = useState(false);
  const enabled = settings.expandWidgets === true;
  const off = normalizeExpandOff(settings.expandOff);
  const leftOut = widgets.filter((widget) => widget.manifestBlocks || off.includes(widget.name)).length;

  return (
    <AdminGroup title={t('screensaver.expand.heading')}>
      <AdminRow
        label={t('screensaver.expand.enable')}
        hint={t('screensaver.expand.enableHelp')}
        control={(
          <Switch
            checked={enabled}
            onChange={(e) => onChange({ expandWidgets: e.target.checked })}
            slotProps={{ input: { 'aria-label': t('screensaver.expand.enable') } }}
          />
        )}
      />
      {enabled && (
        <AdminRow
          label={t('screensaver.expand.method')}
          hint={t(`screensaver.expand.methods.${settings.expandMethod}Help`, { defaultValue: '' })}
          fill
          control={(
            <ToggleButtonGroup
              exclusive
              size="small"
              value={settings.expandMethod}
              onChange={(_, method) => method && onChange({ expandMethod: method })}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.75, py: 0.5 } }}
            >
              {EXPAND_METHODS.map((method) => (
                <ToggleButton key={method} value={method}>{t(`screensaver.expand.methods.${method}`)}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
        />
      )}
      {enabled && (
        <AdminRow
          label={t('screensaver.expand.idle')}
          hint={t('screensaver.expand.idleHelp')}
          fill
          control={(
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <Select
                value={settings.expandIdleMinutes}
                inputProps={{ 'aria-label': t('screensaver.expand.idle') }}
                onChange={(e) => onChange({ expandIdleMinutes: Number(e.target.value) })}
              >
                {EXPAND_IDLE_CHOICES.map((minutes) => (
                  <MenuItem key={minutes} value={minutes}>
                    {minutes === 0
                      ? t('screensaver.expand.idleOff')
                      : t('screensaver.expand.idleMinutes', { count: minutes })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      )}
      {enabled && widgets.length > 0 && (
        <AdminRow
          label={leftOut > 0
            ? t('screensaver.expand.chooseSome', { count: leftOut })
            : t('screensaver.expand.chooseAll')}
          control={(
            <IconButton
              onClick={() => setListOpen((open) => !open)}
              aria-expanded={listOpen}
              aria-label={leftOut > 0
                ? t('screensaver.expand.chooseSome', { count: leftOut })
                : t('screensaver.expand.chooseAll')}
            >
              <ExpandMore sx={{ transform: listOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
            </IconButton>
          )}
          extra={(
            <Collapse in={listOpen}>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
                {widgets.map((widget, index) => (
                  <Box
                    key={widget.name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      px: 1.5,
                      py: 0.5,
                      minHeight: 48,
                      borderTop: index === 0 ? 'none' : 1,
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap>{widget.label}</Typography>
                      {widget.manifestBlocks && (
                        <Typography variant="caption" color="text.secondary">
                          {t('screensaver.expand.pluginBlocks')}
                        </Typography>
                      )}
                    </Box>
                    <Switch
                      slotProps={{ input: { 'aria-label': widget.label } }}
                      checked={!widget.manifestBlocks && !off.includes(widget.name)}
                      disabled={widget.manifestBlocks}
                      onChange={(e) => onChange({
                        expandOff: setWidgetExpandAllowed(off, widget.name, e.target.checked),
                      })}
                    />
                  </Box>
                ))}
              </Box>
            </Collapse>
          )}
        />
      )}
    </AdminGroup>
  );
};

export default ExpandWidgetsSettings;
