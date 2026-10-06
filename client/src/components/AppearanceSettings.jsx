import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import ColorPickerPopover from './ColorPickerPopover';
import AdminFormSection from './AdminFormSection';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase, getDeviceName } from '../utils/deviceName.js';
import {
  APPEARANCE_FIELDS,
  APPEARANCE_SETTING_KEY,
  MODES,
  normalizeDeviceAppearance,
  normalizeHouseholdAppearance,
  pruneMatchingOverrides,
  resolveAppearance,
} from '../utils/appearance.js';

const INTERFACE_SETTINGS_UPDATED_EVENT = 'homeglow:interface-settings-updated';
const COLOR_KEYS = ['primary', 'secondary', 'accent'];

const pickFields = (appearance) => Object.fromEntries(APPEARANCE_FIELDS.map((field) => [field, appearance[field]]));

// Appearance for the household and for this display. The household sets the
// default; this display can override mode, colors and the auto-dark location,
// each on its own. "Use household" removes an override rather than copying the
// household's value, so the display keeps following later household changes.
const AppearanceSettings = () => {
  const { t } = useTranslation(['admin']);
  const apiDeviceUrl = getDeviceApiBase(API_BASE_URL);
  const [household, setHousehold] = useState(null);
  const [device, setDevice] = useState({});
  const [scope, setScope] = useState('device');
  const [draft, setDraft] = useState(null);
  const [inherit, setInherit] = useState({ mode: true, colors: true, autoDark: true });
  const [pickerAnchor, setPickerAnchor] = useState({ key: null, el: null });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  // Success fades; a problem stays until dismissed, so it cannot be missed.
  const flash = (type, text) => {
    const next = { type, text };
    setMessage(next);
    // Clear only this message; a warning shown since must stay.
    if (type === 'success') setTimeout(() => setMessage((current) => (current === next ? null : current)), 4000);
  };

  // The server explains provider failures (no weather key, say) better than
  // axios's "Request failed with status code 401".
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
      console.error('Error loading appearance settings:', error);
      flash('error', t('admin:appearance.loadFailed'));
    }
  }, [apiDeviceUrl, t]);

  useEffect(() => { void load(); }, [load]);

  // The draft shows what the chosen scope stores; on this display, fields that
  // follow the household show the household's value, read-only.
  useEffect(() => {
    if (!household) return;
    if (scope === 'household') {
      setDraft(pickFields(household));
      return;
    }
    const resolved = resolveAppearance(household, device);
    setDraft(pickFields(resolved));
    setInherit(Object.fromEntries(APPEARANCE_FIELDS.map((field) => [field, resolved.source[field] === 'household'])));
  }, [scope, household, device]);

  const locked = (field) => scope === 'device' && inherit[field];

  const setInheritField = (field, value) => {
    setInherit((prev) => ({ ...prev, [field]: value }));
    // Turning "Use household" on shows the household's value again.
    if (value) setDraft((prev) => ({ ...prev, [field]: household[field] }));
  };

  const updateDraft = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  // Geocoding runs on the server, which holds the provider credentials.
  const resolveLocation = async (autoDark) => {
    if (!autoDark.enabled) return autoDark;
    const query = autoDark.locationQuery.trim();
    if (!query) throw new Error(t('admin:messages.autoDarkNeedsLocation'));
    const stored = scope === 'household' ? household.autoDark : resolveAppearance(household, device).autoDark;
    if (query === stored.locationQuery && typeof stored.lat === 'number') return { ...autoDark, locationQuery: query };
    const { data } = await axios.get(`${API_BASE_URL}/api/weather/geocode`, { params: { q: query } });
    if (typeof data?.lat !== 'number' || typeof data?.lon !== 'number') {
      throw new Error(t('admin:appearance.locationNotFound'));
    }
    return { ...autoDark, locationQuery: query, lat: data.lat, lon: data.lon, resolvedName: data.resolvedName || query };
  };

  const saveHousehold = (appearance) => axios.post(`${API_BASE_URL}/api/settings`, {
    key: APPEARANCE_SETTING_KEY,
    value: JSON.stringify(appearance),
  });

  const saveDevice = (overrides) => axios.patch(`${apiDeviceUrl}/settings`, { appearance: overrides });

  const finish = async (text) => {
    window.dispatchEvent(new Event(INTERFACE_SETTINGS_UPDATED_EVENT));
    await load();
    flash('success', text);
  };

  // A location that cannot be looked up must not cost the rest of the save:
  // theme, mode and colors are saved, and the auto-mode location stays as it
  // was, with the reason shown.
  const save = async () => {
    setSaving(true);
    try {
      let fields = APPEARANCE_FIELDS.filter((field) => scope === 'household' || !inherit[field]);
      let next = { ...draft };
      let locationProblem = null;
      if (fields.includes('autoDark')) {
        try {
          next.autoDark = await resolveLocation(draft.autoDark);
        } catch (error) {
          locationProblem = reasonFor(error);
          if (scope === 'household') next.autoDark = household.autoDark;
          else if (device.autoDark) next.autoDark = device.autoDark;
          else fields = fields.filter((field) => field !== 'autoDark');
        }
      }
      if (scope === 'household') {
        await saveHousehold(next);
      } else {
        await saveDevice(Object.fromEntries(fields.map((field) => [field, next[field]])));
      }
      await finish(t('admin:appearance.saved'));
      if (locationProblem) flash('warning', t('admin:appearance.savedButLocation', { reason: locationProblem }));
    } catch (error) {
      console.error('Error saving appearance:', error);
      flash('error', reasonFor(error));
    } finally {
      setSaving(false);
    }
  };

  // This display's look becomes the household's; other displays drop the
  // overrides that now match it, so they follow the household from here on.
  const makeHouseholdDefault = async () => {
    setSaving(true);
    try {
      const nextHousehold = pickFields(resolveAppearance(household, device));
      await saveHousehold(nextHousehold);
      await saveDevice({});
      const thisDevice = getDeviceName();
      const { data: devices } = await axios.get(`${API_BASE_URL}/api/devices`);
      for (const { name } of Array.isArray(devices) ? devices : []) {
        if (name === thisDevice) continue;
        const base = `${API_BASE_URL}/api/devices/${encodeURIComponent(name)}`;
        const { data } = await axios.get(`${base}/settings`);
        const current = normalizeDeviceAppearance(data?.appearance);
        const pruned = pruneMatchingOverrides(current, nextHousehold);
        if (JSON.stringify(pruned) !== JSON.stringify(current)) {
          await axios.patch(`${base}/settings`, { appearance: pruned });
        }
      }
      await finish(t('admin:appearance.madeHouseholdDefault'));
    } catch (error) {
      console.error('Error making this display the household default:', error);
      flash('error', reasonFor(error));
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return null;

  const inheritSwitch = (field) => scope === 'device' && (
    <FormControlLabel
      control={<Switch checked={inherit[field]} onChange={(e) => setInheritField(field, e.target.checked)} />}
      label={t('admin:appearance.useHousehold')}
      sx={{ mb: 1, display: 'block' }}
    />
  );

  const colorPicker = (key) => (
    <Box key={key} sx={{ mb: 2 }}>
      <Typography variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
        {t(`admin:appearance.colorLabels.${key}`)}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          role="button"
          aria-label={t(`admin:appearance.colorLabels.${key}`)}
          onClick={(e) => {
            if (locked('colors')) return;
            setPickerAnchor(pickerAnchor.key === key ? { key: null, el: null } : { key, el: e.currentTarget });
          }}
          sx={{
            width: 60,
            height: 60,
            backgroundColor: draft.colors[key],
            border: '3px solid var(--card-border)',
            borderRadius: 'var(--hg-radius-md)',
            cursor: locked('colors') ? 'default' : 'pointer',
            opacity: locked('colors') ? 0.6 : 1,
          }}
        />
        <TextField
          value={draft.colors[key]}
          disabled={locked('colors')}
          onChange={(e) => updateDraft('colors', { ...draft.colors, [key]: e.target.value })}
          sx={{ flex: 1 }}
          placeholder="#000000"
        />
      </Box>
      <ColorPickerPopover
        anchorEl={pickerAnchor.key === key ? pickerAnchor.el : null}
        color={draft.colors[key]}
        onChange={(color) => updateDraft('colors', { ...draft.colors, [key]: color.hex })}
        onClose={() => setPickerAnchor({ key: null, el: null })}
      />
    </Box>
  );

  return (
    <AdminFormSection title={t('admin:appearance.heading')} subtitle={t('admin:appearance.subtitle')}>
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

      <Typography variant="subtitle2" sx={{ mt: 1 }}>{t('admin:appearance.mode')}</Typography>
      {inheritSwitch('mode')}
      <FormControl fullWidth sx={{ mb: 1 }} disabled={locked('mode')}>
        <InputLabel>{t('admin:appearance.mode')}</InputLabel>
        <Select value={draft.mode} label={t('admin:appearance.mode')} onChange={(e) => updateDraft('mode', e.target.value)}>
          {MODES.map((mode) => (
            <MenuItem key={mode} value={mode}>{t(`admin:appearance.modes.${mode}`)}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
        {t('admin:appearance.modeHelp')}
      </Typography>

      <Typography variant="subtitle2">{t('admin:appearance.colors')}</Typography>
      {inheritSwitch('colors')}
      <Box sx={{ maxWidth: 600, mb: 2 }}>{COLOR_KEYS.map(colorPicker)}</Box>

      <Typography variant="subtitle2">{t('admin:appearance.autoDark')}</Typography>
      {inheritSwitch('autoDark')}
      <FormControlLabel
        control={(
          <Switch
            checked={draft.autoDark.enabled}
            disabled={locked('autoDark')}
            onChange={(e) => updateDraft('autoDark', { ...draft.autoDark, enabled: e.target.checked })}
          />
        )}
        label={t('admin:autoDark.enable')}
        sx={{ mb: 1, display: 'block' }}
      />
      <TextField
        fullWidth
        disabled={locked('autoDark')}
        label={t('admin:autoDark.location')}
        value={draft.autoDark.locationQuery}
        onChange={(e) => updateDraft('autoDark', { ...draft.autoDark, locationQuery: e.target.value })}
        helperText={draft.autoDark.resolvedName
          ? t('admin:appearance.resolvedLocation', { name: draft.autoDark.resolvedName })
          : t('admin:autoDark.locationHelp')}
        sx={{ mb: 3 }}
      />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<Save />} onClick={save} disabled={saving}>
          {scope === 'household' ? t('admin:appearance.saveHousehold') : t('admin:appearance.saveDevice')}
        </Button>
        {scope === 'device' && (
          <Button variant="outlined" onClick={makeHouseholdDefault} disabled={saving}>
            {t('admin:appearance.makeHouseholdDefault')}
          </Button>
        )}
      </Box>
    </AdminFormSection>
  );
};

export default AppearanceSettings;
