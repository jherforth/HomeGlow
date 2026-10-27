import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  FormControlLabel,
  MenuItem,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminRow } from './AdminRows.jsx';
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
import { editWholeNumber } from '../utils/wholeNumberField.js';

const INTERFACE_SETTINGS_UPDATED_EVENT = 'homeglow:interface-settings-updated';

// Display dimming on its own card, so it saves only its own field: the
// household default plus this display's override. "Use household" removes
// the display's dimming override rather than copying the household's
// value, so the display keeps following later household changes. Saves
// go through saveAppearanceFields, which re-reads the stored appearance
// first — saving here, then saving Appearance without reloading, leaves
// each card's fields exactly as saved.
//
// It has no save button of its own: `saveRef` is pointed at its save, which
// the section's one Save button calls along with the section's own.
const DisplayDimmingSettings = ({ saveRef }) => {
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

  useEffect(() => {
    if (!saveRef) return undefined;
    saveRef.current = draft ? save : null;
    return () => { saveRef.current = null; };
  });

  if (!draft) return null;

  const dimming = draft ?? DEFAULT_DIMMING;
  const dayPct = Math.round((dimming.day ?? DEFAULT_DIMMING.day) * 100);
  const nightPct = Math.round((dimming.night ?? DEFAULT_DIMMING.night) * 100);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  const hourPicker = (field, label) => (
    <TextField
      select
      size="small"
      label={label}
      value={dimming[field] ?? DEFAULT_DIMMING[field]}
      disabled={locked}
      onChange={(e) => updateDimming({ [field]: parseInt(e.target.value, 10) })}
      sx={{ minWidth: 150, flex: { xs: 1, sm: 'none' } }}
    >
      {hours.map((hour) => (
        <MenuItem key={hour} value={hour}>{formatHourOfDay(hour)}</MenuItem>
      ))}
    </TextField>
  );

  const brightness = (field, label, pct) => (
    <AdminRow
      label={label}
      disabled={locked}
      fill
      control={(
        <>
          <Slider
            value={pct}
            min={0}
            max={100}
            step={5}
            disabled={locked}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}%`}
            onChange={(_, v) => updateDimming({ [field]: v / 100 })}
            aria-label={label}
            sx={{ width: { xs: 'auto', sm: 200 }, flex: { xs: 1, sm: 'none' }, mx: 1 }}
          />
          <Typography variant="body2" sx={{ width: 40, textAlign: 'right' }}>{pct}%</Typography>
        </>
      )}
    />
  );

  return (
    <>
      {message && <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
      <AdminGroup
        title={t('admin:appearance.dimming.heading')}
        action={(
          <ToggleButtonGroup
            exclusive
            size="small"
            value={scope}
            onChange={(_, value) => value && setScope(value)}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.25, py: 0.25 } }}
          >
            <ToggleButton value="device">{t('admin:appearance.scopeDevice')}</ToggleButton>
            <ToggleButton value="household">{t('admin:appearance.scopeHousehold')}</ToggleButton>
          </ToggleButtonGroup>
        )}
      >
        <AdminRow
          label={t('admin:appearance.dimming.enabled')}
          hint={t('admin:appearance.dimming.help')}
          under={scope === 'device' && (
            <FormControlLabel
              control={<Switch size="small" checked={useHousehold} onChange={(e) => setUseHouseholdField(e.target.checked)} />}
              label={<Typography variant="body2" color="text.secondary">{t('admin:appearance.useHousehold')}</Typography>}
              sx={{ display: 'flex', mt: 0.5, ml: -0.5, mr: 0 }}
            />
          )}
          control={(
            <Switch
              checked={dimming.enabled ?? DEFAULT_DIMMING.enabled}
              disabled={locked}
              onChange={(e) => updateDimming({ enabled: e.target.checked })}
              slotProps={{ input: { 'aria-label': t('admin:appearance.dimming.enabled') } }}
            />
          )}
        />
        <AdminRow
          label={t('admin:appearance.dimming.after')}
          disabled={locked}
          control={(
            <TextField
              type="number"
              size="small"
              value={dimming.after ?? DEFAULT_DIMMING.after}
              disabled={locked}
              slotProps={{ htmlInput: { min: 0, step: 1, 'aria-label': t('admin:appearance.dimming.after') } }}
              onChange={(e) => updateDimming({ after: editWholeNumber(e.target.value) })}
              sx={{ width: 96 }}
            />
          )}
        />
        {brightness('day', t('admin:appearance.dimming.day'), dayPct)}
        {brightness('night', t('admin:appearance.dimming.night'), nightPct)}
        <AdminRow
          label={t('admin:appearance.dimming.nightHours')}
          hint={t('admin:appearance.dimming.nightHelp')}
          disabled={locked}
          fill
          control={(
            <>
              {hourPicker('nightStart', t('admin:appearance.dimming.nightStart'))}
              {hourPicker('nightEnd', t('admin:appearance.dimming.nightEnd'))}
            </>
          )}
        />
        {/* Independent of dimming, so after all of its settings. */}
        <AdminRow
          label={t('admin:appearance.dimming.pixelShift')}
          hint={t('admin:appearance.dimming.pixelShiftHelp')}
          control={(
            <Switch
              checked={dimming.pixelShift ?? DEFAULT_DIMMING.pixelShift}
              disabled={locked}
              onChange={(e) => updateDimming({ pixelShift: e.target.checked })}
              slotProps={{ input: { 'aria-label': t('admin:appearance.dimming.pixelShift') } }}
            />
          )}
        />
      </AdminGroup>
    </>
  );
};

export default DisplayDimmingSettings;
