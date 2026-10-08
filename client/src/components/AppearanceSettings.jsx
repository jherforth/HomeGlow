import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
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
import PersonalizeFields from './PersonalizeFields';
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
import { resolveTheme } from '../utils/themes.js';
import { useThemeRegistry } from '../utils/installedThemes.js';
import { pickWeatherScene, weatherScenesOf } from '../utils/weatherScenes.js';
import { PREVIEW_MS, setWeatherScenePreview, useWeatherScenePreview } from '../utils/useWeatherCondition.js';

const capitalize = (text) => (text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text);

const INTERFACE_SETTINGS_UPDATED_EVENT = 'homeglow:interface-settings-updated';
// Classic's colors. A theme with colors of its own replaces all three.
const COLOR_KEYS = ['primary', 'secondary', 'accent'];

const pickFields = (appearance) => Object.fromEntries(APPEARANCE_FIELDS.map((field) => [field, appearance[field]]));

// Appearance for the household and for this display. The household sets the
// default; this display can override any field on its own. "Use household"
// removes an override rather than copying the household's value, so the
// display keeps following later household changes.
const AppearanceSettings = () => {
  const { t } = useTranslation(['admin', 'weather']);
  const { themes, assets } = useThemeRegistry();
  const previewScene = useWeatherScenePreview();
  const [weatherStatus, setWeatherStatus] = useState(null);
  const apiDeviceUrl = getDeviceApiBase(API_BASE_URL);
  const [household, setHousehold] = useState(null);
  const [device, setDevice] = useState({});
  const [scope, setScope] = useState('device');
  const [draft, setDraft] = useState(null);
  const [inherit, setInherit] = useState(() => Object.fromEntries(APPEARANCE_FIELDS.map((field) => [field, true])));
  const [pickerAnchor, setPickerAnchor] = useState({ key: null, el: null });
  const [message, setMessage] = useState(null);
  // A chosen theme that has since been removed still shows, as not installed.
  const missingTheme = draft?.theme && !themes.some((theme) => theme.id === draft.theme) ? draft.theme : null;
  const chosenTheme = themes.find((theme) => theme.id === draft?.theme);
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

  // A theme with weather scenes (#247) shows the weather at the same location
  // Auto mode uses for sunrise and sunset.
  const draftWeather = draft ? resolveTheme(draft.theme, themes, assets).weather : null;
  const draftLat = draft?.autoDark?.lat;
  const draftLon = draft?.autoDark?.lon;

  // What the weather scenes would show now, or why they can't.
  useEffect(() => {
    if (!draftWeather) {
      setWeatherStatus(null);
      return undefined;
    }
    let cancelled = false;
    const params = typeof draftLat === 'number' && typeof draftLon === 'number' ? { lat: draftLat, lon: draftLon } : {};
    axios.get(`${API_BASE_URL}/api/weather/condition`, { params })
      .then(({ data }) => { if (!cancelled) setWeatherStatus({ condition: data?.condition }); })
      .catch((error) => { if (!cancelled) setWeatherStatus({ error: reasonFor(error) }); });
    return () => { cancelled = true; };
    // reasonFor only words the error; it does not change what is asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!draftWeather, draftLat, draftLon]);

  // The location matters in Auto mode, and for a theme with weather scenes,
  // so it is only looked up then. It is required only for Auto: Home
  // Assistant reports its own location. Geocoding runs on the server, which
  // holds the provider credentials. `enabled` is still written for older
  // builds, which read it.
  const resolveLocation = async (autoDark, mode, needsWeather) => {
    if (mode !== 'auto' && !needsWeather) return autoDark;
    const query = autoDark.locationQuery.trim();
    if (!query && mode !== 'auto') return autoDark;
    if (!query) throw new Error(t('admin:messages.autoDarkNeedsLocation'));
    const stored = scope === 'household' ? household.autoDark : resolveAppearance(household, device).autoDark;
    if (query === stored.locationQuery && typeof stored.lat === 'number') return { ...autoDark, enabled: true, locationQuery: query };
    const { data } = await axios.get(`${API_BASE_URL}/api/weather/geocode`, { params: { q: query } });
    if (typeof data?.lat !== 'number' || typeof data?.lon !== 'number') {
      throw new Error(t('admin:appearance.locationNotFound'));
    }
    return { ...autoDark, enabled: true, locationQuery: query, lat: data.lat, lon: data.lon, resolvedName: data.resolvedName || query };
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
          next.autoDark = await resolveLocation(draft.autoDark, draft.mode, !!draftWeather);
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

  const resolvedTheme = resolveTheme(draft.theme, themes, assets);
  const sceneLabel = (key) => (key === 'default'
    ? t('admin:appearance.weather.defaultScene')
    : capitalize(t(`weather:conditions.${key}`)));

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

      <Typography variant="subtitle2" sx={{ mt: 1 }}>{t('admin:appearance.theme')}</Typography>
      {inheritSwitch('theme')}
      <FormControl fullWidth sx={{ mb: 1 }} disabled={locked('theme')}>
        <Select value={draft.theme} inputProps={{ 'aria-label': t('admin:appearance.theme') }} onChange={(e) => updateDraft('theme', e.target.value)}>
          {missingTheme && (
            <MenuItem value={missingTheme} disabled>
              {t('admin:themes.notInstalled', { id: missingTheme })}
            </MenuItem>
          )}
          {themes.map((theme) => (
            <MenuItem key={theme.id} value={theme.id}>
              {theme.name}
              {theme.author && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {t('admin:plugins.byAuthor', { author: theme.author })}
                </Typography>
              )}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
        {t(`admin:appearance.themeDescriptions.${draft.theme}`, { defaultValue: chosenTheme?.description || '' })}
      </Typography>

      <Typography variant="subtitle2">{t('admin:appearance.mode')}</Typography>
      {inheritSwitch('mode')}
      <FormControl fullWidth sx={{ mb: 3 }} disabled={locked('mode')}>
        <Select value={draft.mode} inputProps={{ 'aria-label': t('admin:appearance.mode') }} onChange={(e) => updateDraft('mode', e.target.value)}>
          {MODES.map((mode) => (
            <MenuItem key={mode} value={mode}>{t(`admin:appearance.modes.${mode}`)}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {(draft.mode === 'auto' || draftWeather) && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2">{t(draftWeather ? 'admin:appearance.weather.location' : 'admin:appearance.autoDark')}</Typography>
          {inheritSwitch('autoDark')}
          <TextField
            fullWidth
            required={draft.mode === 'auto'}
            disabled={locked('autoDark')}
            slotProps={{ htmlInput: { 'aria-label': t(draftWeather ? 'admin:appearance.weather.location' : 'admin:appearance.autoDark') } }}
            value={draft.autoDark.locationQuery}
            onChange={(e) => updateDraft('autoDark', { ...draft.autoDark, locationQuery: e.target.value })}
            helperText={draft.autoDark.resolvedName
              ? t('admin:appearance.resolvedLocation', { name: draft.autoDark.resolvedName })
              : t('admin:autoDark.locationHelp')}
          />
        </Box>
      )}

      {draftWeather && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2">{t('admin:appearance.weather.heading')}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('admin:appearance.weather.help')}
          </Typography>
          {weatherStatus?.condition && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t('admin:appearance.weather.now', {
                condition: capitalize(t(`weather:conditions.${weatherStatus.condition}`)),
                scene: sceneLabel(pickWeatherScene(draftWeather, weatherStatus.condition)),
              })}
            </Typography>
          )}
          {weatherStatus?.error && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {t('admin:appearance.weather.unavailable', { reason: weatherStatus.error })}
            </Alert>
          )}
          {draft.mode !== 'auto' && (
            <Alert severity="info" sx={{ mb: 1 }}>{t('admin:appearance.weather.nightHint')}</Alert>
          )}
          <Typography variant="body2" sx={{ mt: 2, mb: 0.5, fontWeight: 600 }}>{t('admin:appearance.weather.preview')}</Typography>
          <FormControl fullWidth size="small">
            <Select
              value={previewScene || ''}
              displayEmpty
              inputProps={{ 'aria-label': t('admin:appearance.weather.preview') }}
              onChange={(e) => setWeatherScenePreview(e.target.value || null)}
            >
              <MenuItem value="">{t('admin:appearance.weather.live')}</MenuItem>
              {weatherScenesOf(draftWeather).map((key) => (
                <MenuItem key={key} value={key}>{sceneLabel(key)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {t('admin:appearance.weather.previewHelp', { minutes: PREVIEW_MS / 60000 })}
          </Typography>
        </Box>
      )}


      {/* A theme with colors of its own replaces these, so they show only for
          one that uses them (Classic). The stored values are kept. */}
      {!resolvedTheme.colors && (
        <>
          <Typography variant="subtitle2">{t('admin:appearance.colors')}</Typography>
          {inheritSwitch('colors')}
          <Box sx={{ maxWidth: 600, mb: 2 }}>
            {COLOR_KEYS.map(colorPicker)}
          </Box>
        </>
      )}

      <PersonalizeFields
        draft={draft}
        updateDraft={updateDraft}
        locked={locked}
        inheritSwitch={inheritSwitch}
        onError={(text) => flash('error', text)}
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
