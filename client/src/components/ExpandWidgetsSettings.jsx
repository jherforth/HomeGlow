import React, { useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
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
    <Box sx={{ mt: 1, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
        {t('screensaver.expand.heading')}
      </Typography>
      <FormControlLabel
        control={(
          <Switch
            checked={enabled}
            onChange={(e) => onChange({ expandWidgets: e.target.checked })}
          />
        )}
        label={t('screensaver.expand.enable')}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, ml: 6 }}>
        {t('screensaver.expand.enableHelp')}
      </Typography>

      {enabled && (
        <Box sx={{ ml: { xs: 0, sm: 6 } }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            {t('screensaver.expand.method')}
          </Typography>
          <RadioGroup
            value={settings.expandMethod}
            onChange={(e) => onChange({ expandMethod: e.target.value })}
            sx={{ mb: 2 }}
          >
            {EXPAND_METHODS.map((method) => (
              <FormControlLabel
                key={method}
                value={method}
                control={<Radio />}
                sx={{ alignItems: 'flex-start', mb: 1, '& .MuiRadio-root': { pt: 0.25 } }}
                label={(
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t(`screensaver.expand.methods.${method}`)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t(`screensaver.expand.methods.${method}Help`)}
                    </Typography>
                  </Box>
                )}
              />
            ))}
          </RadioGroup>

          <FormControl size="small" sx={{ mb: 0.5, minWidth: 240 }}>
            <InputLabel id="expand-idle-label">{t('screensaver.expand.idle')}</InputLabel>
            <Select
              labelId="expand-idle-label"
              value={settings.expandIdleMinutes}
              label={t('screensaver.expand.idle')}
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('screensaver.expand.idleHelp')}
          </Typography>

          {widgets.length > 0 && (
            <>
              <Button
                size="small"
                onClick={() => setListOpen((open) => !open)}
                endIcon={(
                  <ExpandMore
                    sx={{ transform: listOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
                  />
                )}
                aria-expanded={listOpen}
                sx={{ textTransform: 'none', px: 0 }}
              >
                {leftOut > 0
                  ? t('screensaver.expand.chooseSome', { count: leftOut })
                  : t('screensaver.expand.chooseAll')}
              </Button>
              <Collapse in={listOpen}>
                <Box
                  sx={{
                    mt: 1,
                    border: '1px solid var(--card-border)',
                    borderRadius: 'var(--hg-radius-sm)',
                  }}
                >
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
                        borderTop: index === 0 ? 'none' : '1px solid var(--card-border)',
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
                        inputProps={{ 'aria-label': widget.label }}
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
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

export default ExpandWidgetsSettings;
