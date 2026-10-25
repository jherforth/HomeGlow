import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import AdminFormSection from './AdminFormSection';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import {
  APPEARANCE_SETTING_KEY,
  DEFAULT_DIMMING,
  normalizeDeviceAppearance,
  normalizeHouseholdAppearance,
  resolveAppearance,
} from '../utils/appearance.js';
import { saveAppearanceFields } from '../utils/appearanceSave.js';
import { formatHourOfDay } from '../utils/dateUtils.js';

const INTERFACE_SETTINGS_UPDATED_EVENT = 'homeglow:interface-settings-updated';

// Display dimming on its own card, so it saves only its own field: the
// household default plus this display's override. "Use household" removes
// the display's dimming override rather than copying the household's
// value, so the display keeps following later household changes. Saves
// go through saveAppearanceFields, which re-reads the stored appearance
// first — saving here, then saving Appearance without reloading, leaves
// each card's fields exactly as saved.
const DisplayDimmingSettings = () => {
  const { t } = useTranslation(['admin']);
  const apiDeviceUrl = getDeviceApiBase(API_BASE_URL);
  const [household, setHousehold] = useState(null);
  const [device, setDevice] = useState({});
  const [scope, setScope] = useState('device');
  const [draft, setDraft] = useState(null);
  const [useHousehold, setUseHousehold] = useState(true);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  // Success fades; a problem stays until dismissed, so it cannot be missed.
  const flash = (type, text) => {
    const next = { type, text };
    setMessage(next);
    if (type === 'success') setTimeout(() => setMessage((current) => (current === next ? null : current)), 4000);
  };

  const reasonFor = (error) => error?.response?.data?.error || error?.message || t('admin:appearance.saveFailed');

  const load = useCallback(async () => {
    try {
      const [householdResponse, deviceResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/settings`, { params: { keys: APPEARANCE_SETTING_KEY } }),
        axios.get(`${apiDeviceUrl}/settings`),
      ]);
      setHousehold(normalizeHouseholdAppearance(householdResponse.data?.[APPEARANCE_SETTING_KEY]));
      setDevice(normalizeDeviceAppearance(deviceResponse.data?.appearance));
    } catch (error) {
      console.error('Error loading dimming settings:', error);
      flash('error', t('admin:appearance.loadFailed'));
    }
  }, [apiDeviceUrl, t]);

  useEffect(() => { void load(); }, [load]);

  // The draft shows what the chosen scope stores; on this display, a
  // dimming that follows the household shows the household's value.
  useEffect(() => {
    if (!household) return;
    if (scope === 'household') {
      setDraft(household.dimming);
      return;
    }
    const resolved = resolveAppearance(household, device);
    setDraft(resolved.dimming);
    setUseHousehold(resolved.source.dimming === 'household');
  }, [scope, household, device]);

  const locked = scope === 'device' && useHousehold;

  const setUseHouseholdField = (value) => {
    setUseHousehold(value);
    // Turning "Use household" on shows the household's value again.
    if (value) setDraft(household.dimming);
  };

  const updateDimming = (patch) => setDraft((prev) => ({ ...(prev ?? DEFAULT_DIMMING), ...patch }));

  const finish = async (text) => {
    window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
    await load();
    flash('success', text);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (scope === 'device' && useHousehold) {
        await saveAppearanceFields('device', {}, { useHousehold: ['dimming'] });
      } else {
        await saveAppearanceFields(scope, { dimming: draft });
      }
      await finish(t('admin:appearance.saved'));
    } catch (error) {
      console.error('Error saving dimming settings:', error);
      flash('error', reasonFor(error));
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return null;

  const dimming = draft ?? DEFAULT_DIMMING;
  const dayPct = Math.round((dimming.day ?? DEFAULT_DIMMING.day) * 100);
  const nightPct = Math.round((dimming.night ?? DEFAULT_DIMMING.night) * 100);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  return (
    <AdminFormSection title={t('admin:appearance.dimming.heading')} subtitle={t('admin:appearance.dimming.help')}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={scope}
        onChange={(_, value) => value && setScope(value)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="device">{t('admin:appearance.scopeDevice')}</ToggleButton>
        <ToggleButton value="household">{t('admin:appearance.scopeHousehold')}</ToggleButton>
      </ToggleButtonGroup>

      {message && <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}

      {scope === 'device' && (
        <FormControlLabel
          control={<Switch checked={useHousehold} onChange={(e) => setUseHouseholdField(e.target.checked)} />}
          label={t('admin:appearance.useHousehold')}
          sx={{ mb: 1, display: 'block' }}
        />
      )}

      <FormControlLabel
        control={(
          <Switch
            checked={dimming.enabled ?? DEFAULT_DIMMING.enabled}
            disabled={locked}
            onChange={(e) => updateDimming({ enabled: e.target.checked })}
          />
        )}
        label={t('admin:appearance.dimming.enabled')}
        sx={{ mb: 2, display: 'block' }}
      />

      <Typography variant="subtitle2">{t('admin:appearance.dimming.day')} — {dayPct}%</Typography>
      <Box sx={{ px: 3, maxWidth: 460 }}>
        <Slider
          value={dayPct}
          min={0}
          max={100}
          step={5}
          disabled={locked}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          onChange={(_, v) => updateDimming({ day: v / 100 })}
          aria-label={t('admin:appearance.dimming.day')}
        />
      </Box>
      <Typography variant="subtitle2">{t('admin:appearance.dimming.night')} — {nightPct}%</Typography>
      <Box sx={{ px: 3, maxWidth: 460, mb: 2 }}>
        <Slider
          value={nightPct}
          min={0}
          max={100}
          step={5}
          disabled={locked}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          onChange={(_, v) => updateDimming({ night: v / 100 })}
          aria-label={t('admin:appearance.dimming.night')}
        />
      </Box>

      <Typography variant="subtitle2">{t('admin:appearance.dimming.nightHours')}</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <TextField
          type="number"
          size="small"
          label={t('admin:appearance.dimming.after')}
          value={dimming.after ?? DEFAULT_DIMMING.after}
          disabled={locked}
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
          onChange={(e) => updateDimming({ after: e.target.value })}
          sx={{ width: 200 }}
        />
        <TextField
          select
          size="small"
          label={t('admin:appearance.dimming.nightStart')}
          value={dimming.nightStart ?? DEFAULT_DIMMING.nightStart}
          disabled={locked}
          onChange={(e) => updateDimming({ nightStart: parseInt(e.target.value, 10) })}
          sx={{ width: 200 }}
        >
          {hours.map((hour) => (
            <MenuItem key={hour} value={hour}>{formatHourOfDay(hour)}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t('admin:appearance.dimming.nightEnd')}
          value={dimming.nightEnd ?? DEFAULT_DIMMING.nightEnd}
          disabled={locked}
          onChange={(e) => updateDimming({ nightEnd: parseInt(e.target.value, 10) })}
          sx={{ width: 200 }}
        >
          {hours.map((hour) => (
            <MenuItem key={hour} value={hour}>{formatHourOfDay(hour)}</MenuItem>
          ))}
        </TextField>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
        {t('admin:appearance.dimming.nightHelp')}
      </Typography>

      <Button variant="contained" startIcon={<Save />} onClick={save} disabled={saving}>
        {scope === 'household' ? t('admin:appearance.saveHousehold') : t('admin:appearance.saveDevice')}
      </Button>
    </AdminFormSection>
  );
};

export default DisplayDimmingSettings;
