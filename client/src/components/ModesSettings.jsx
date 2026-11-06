import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  Add,
  AlarmOutlined,
  HomeOutlined,
  Save,
  ToggleOnOutlined,
  VerticalAlignBottom,
  VerticalAlignTop,
  Fullscreen,
  PictureInPictureAltOutlined,
} from '@mui/icons-material';
import { DURATIONS, LEVELS, newTakeoverId } from '../utils/takeovers.js';
import Autocomplete from '@mui/material/Autocomplete';
import { useTranslation } from 'react-i18next';
import { AdminFooter, AdminGroup, AdminNote, AdminRow } from './AdminRows.jsx';
import ModesHaSettings from './ModesHaSettings.jsx';
import { StackModeRows } from './StackModeFields.jsx';
import { WIDGET_STACKS_KEY, normalizeStacks, withModeSetting } from '../utils/widgetStacks.js';
import HaEntityPicker, { entitiesOfKind, statesFor } from './HaEntityPicker.jsx';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import { editWholeNumber } from '../utils/wholeNumberField.js';
import {
  DISPLAY_MODES_KEY,
  MINUTES_PER_DAY,
  MODE_COLORS,
  findOverlaps,
  newModeId,
  normalizeModesSettings,
  scheduleDaysKey,
} from '../utils/displayModes.js';

const DEVICE_SETTINGS_UPDATED_EVENT = 'homeglow:device-settings-updated';
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const CORE_WIDGETS = ['calendar', 'weather', 'chores', 'photos'];

const emptyMode = () => ({
  id: newModeId(),
  name: '',
  color: MODE_COLORS[0],
  schedule: { days: [1, 2, 3, 4, 5], start: '06:00', end: '09:00' },
  startTab: null,
  dim: false,
  alarm: null,
  when: null,
  onlyHome: [],
});

const formatClock = (minutes, locale) => {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
};

/**
 * Admin → Displays → Modes: this display's modes (utils/displayModes.js).
 * Modes save as they're added, changed or deleted; the behavior settings save
 * with the section's Save button. Everything is this display's own, kept in
 * its device settings.
 */
const ModesSettings = ({ onOpenConnections }) => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const apiDeviceUrl = getDeviceApiBase(API_BASE_URL);
  const [stored, setStored] = useState(null);
  const [deviceSettings, setDeviceSettings] = useState({});
  const [behavior, setBehavior] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  // Home Assistant: what this display's modes read, and its entities for the
  // pickers (loaded once it's known to be connected).
  const [haConnection, setHaConnection] = useState(null);
  const [entities, setEntities] = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [plugins, setPlugins] = useState([]);
  const [editingTakeover, setEditingTakeover] = useState(null);

  const flash = (type, text) => {
    const next = { type, text };
    setMessage(next);
    if (type === 'success') setTimeout(() => setMessage((current) => (current === next ? null : current)), 4000);
  };

  const load = useCallback(async () => {
    try {
      const [settingsResponse, tabsResponse] = await Promise.all([
        axios.get(`${apiDeviceUrl}/settings`),
        axios.get(`${apiDeviceUrl}/tabs`),
      ]);
      const settings = settingsResponse.data || {};
      const modes = normalizeModesSettings(settings[DISPLAY_MODES_KEY]);
      setDeviceSettings(settings);
      setStored(modes);
      setBehavior(modes);
      setTabs(Array.isArray(tabsResponse.data) ? tabsResponse.data : []);
      axios.get(`${API_BASE_URL}/api/widgets`)
        .then(({ data }) => setPlugins(Array.isArray(data) ? data : []))
        .catch(() => setPlugins([]));
      try {
        const { data } = await axios.get(`${apiDeviceUrl}/modes/ha`);
        setHaConnection({ ...data, configured: Boolean(data?.connected) });
      } catch {
        setHaConnection({ configured: false, states: {} });
      }
    } catch (error) {
      console.error('Error loading modes:', error);
      flash('error', t('admin:modes.loadFailed'));
    }
  }, [apiDeviceUrl, t]);

  useEffect(() => { void load(); }, [load]);

  const haConfigured = Boolean(haConnection?.configured);
  useEffect(() => {
    if (!haConfigured) return;
    setEntitiesLoading(true);
    axios.get(`${apiDeviceUrl}/modes/ha/entities`, { params: { kind: 'any' } })
      .then(({ data }) => setEntities(Array.isArray(data?.entities) ? data.entities : []))
      .catch(() => setEntities([]))
      .finally(() => setEntitiesLoading(false));
  }, [haConfigured, apiDeviceUrl]);
  // Names from the entity list, else from what the display last read (so they
  // still show while Home Assistant is away).
  const entityName = (id) => entities.find((e) => e.entity_id === id)?.name
    || haConnection?.states?.[id]?.attributes?.friendly_name
    || id;


  const persist = async (next, successText) => {
    setSaving(true);
    try {
      await axios.patch(`${apiDeviceUrl}/settings`, { [DISPLAY_MODES_KEY]: next });
      // Mode names are the helper's options: keep them in step.
      if (next?.ha?.helper) await axios.post(`${apiDeviceUrl}/modes/ha/sync`, {}).catch(() => {});
      window.dispatchEvent(new Event(DEVICE_SETTINGS_UPDATED_EVENT));
      await load();
      flash('success', successText);
      return true;
    } catch (error) {
      console.error('Error saving modes:', error);
      flash('error', error?.response?.data?.error || t('admin:modes.saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const tabName = (number) => {
    const tab = tabs.find((item) => item.number === Number(number));
    return tab?.label || t('admin:modes.tabNumber', { number });
  };

  const widgetLabel = (name) => (name.startsWith('plugin:')
    ? (plugins.find((p) => `plugin:${p.filename}` === name)?.name || name.slice('plugin:'.length).replace(/\.html?$/i, ''))
    : t(`admin:screensaver.expand.widgetNames.${name}`, { defaultValue: name }));

  // Widgets turned on here: what can take over.
  const takeoverWidgets = [
    ...CORE_WIDGETS.filter((name) => deviceSettings.widgetSettings?.[name]?.enabled),
    ...plugins
      .filter((p) => deviceSettings.pluginSettings?.[p.filename]?.enabled)
      .map((p) => `plugin:${p.filename}`),
  ].map((name) => ({ name, label: widgetLabel(name) }));

  const scheduleText = (schedule) => {
    if (!schedule) return t('admin:modes.noSchedule');
    const key = scheduleDaysKey(schedule.days);
    const days = key
      ? t(`admin:modes.days.${key}`)
      : DAY_ORDER.filter((day) => schedule.days.includes(day)).map((day) => t(`admin:modes.dayShort.${day}`)).join(', ');
    const [sh, sm] = schedule.start.split(':').map(Number);
    const [eh, em] = schedule.end.split(':').map(Number);
    return `${days} · ${formatClock(sh * 60 + sm, i18n.language)} – ${formatClock(eh * 60 + em, i18n.language)}`;
  };

  if (!stored || !behavior) {
    return message ? <Alert severity={message.type}>{message.text}</Alert> : null;
  }

  // This display's Stacks, for the mode window's "Stacks in this mode".
  const stacks = normalizeStacks(deviceSettings[WIDGET_STACKS_KEY]).stacks;
  const saveStacks = (next) => axios.patch(`${apiDeviceUrl}/settings`, { [WIDGET_STACKS_KEY]: { stacks: next } });

  // stackSettings: { stackId: setting | null } changed in the window.
  const saveMode = async (mode, stackSettings = {}) => {
    const changed = Object.keys(stackSettings);
    if (changed.length) {
      try {
        await saveStacks(stacks.map((stack) => (changed.includes(stack.id)
          ? withModeSetting(stack, mode.id, stackSettings[stack.id])
          : stack)));
      } catch (error) {
        console.error('Error saving stacks for the mode:', error);
        flash('error', t('admin:modes.saveFailed'));
        return;
      }
    }
    const exists = stored.modes.some((item) => item.id === mode.id);
    const modes = exists
      ? stored.modes.map((item) => (item.id === mode.id ? mode : item))
      : [...stored.modes, mode];
    if (await persist({ ...stored, modes }, t('admin:modes.savedMode', { name: mode.name }))) setEditing(null);
  };

  const deleteMode = async (mode) => {
    if (!window.confirm(t('admin:modes.confirmDelete', { name: mode.name }))) return;
    const modes = stored.modes.filter((item) => item.id !== mode.id);
    // Its Stack settings go with it.
    if (stacks.some((stack) => stack.modes?.[mode.id])) {
      await saveStacks(stacks.map((stack) => withModeSetting(stack, mode.id, null))).catch(() => {});
    }
    if (await persist({ ...stored, modes }, t('admin:modes.deleted', { name: mode.name }))) setEditing(null);
  };

  const saveBehavior = () => persist(
    normalizeModesSettings({ ...behavior, modes: stored.modes }),
    t('admin:modes.savedBehavior')
  );
  const setField = (patch) => setBehavior((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
        {t('admin:modes.help')}
      </Typography>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>
      )}

      <AdminGroup
        title={t('admin:modes.listHeading')}
        action={(
          <Button size="small" startIcon={<Add />} onClick={() => setEditing(emptyMode())}>
            {t('admin:modes.add')}
          </Button>
        )}
      >
        {stored.modes.length === 0 && <AdminNote>{t('admin:modes.empty')}</AdminNote>}
        {stored.modes.map((mode) => {
          return (
            <Box
              key={mode.id}
              sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: 'var(--hg-radius-md, 8px)' }}
            >
              <Box sx={{ width: 8, alignSelf: 'stretch', minHeight: 40, borderRadius: 1, backgroundColor: mode.color, flex: 'none' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>{mode.name}</Typography>
                  <Button size="small" onClick={() => setEditing(mode)} aria-label={t('admin:modes.editMode', { name: mode.name })}>
                    {t('admin:modes.editDetails')}
                  </Button>
                </Stack>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                  {(mode.schedule || !(mode.alarm || mode.when)) && <Chip size="small" label={scheduleText(mode.schedule)} />}
                  {mode.startTab && <Chip size="small" label={t('admin:modes.startsOn', { tab: tabName(mode.startTab) })} />}
                  {mode.dim && <Chip size="small" label={t('admin:modes.dimChip')} />}
                  {mode.alarm && (
                    <Chip
                      size="small"
                      icon={<AlarmOutlined />}
                      label={t('admin:modes.ha.alarmChip', { until: formatClock(Number(mode.alarm.until.slice(0, 2)) * 60 + Number(mode.alarm.until.slice(3)), i18n.language) })}
                    />
                  )}
                  {mode.when && (
                    <Chip size="small" icon={<ToggleOnOutlined />} label={t('admin:modes.ha.whenChip', { name: entityName(mode.when.entity), state: mode.when.state })} />
                  )}
                  {mode.onlyHome.length > 0 && (
                    <Chip size="small" icon={<HomeOutlined />} label={t('admin:modes.ha.homeChip', { names: mode.onlyHome.map(entityName).join(', ') })} />
                  )}
                </Stack>
              </Box>
            </Box>
          );
        })}
      </AdminGroup>

      <ModesHaSettings
        modes={stored}
        connection={haConnection}
        entities={entities}
        entitiesLoading={entitiesLoading}
        apiDeviceUrl={apiDeviceUrl}
        onChanged={async (text) => {
          await load();
          window.dispatchEvent(new Event(DEVICE_SETTINGS_UPDATED_EVENT));
          flash('success', text);
        }}
        onSaveHa={(patch, text) => persist({ ...stored, ha: { ...stored.ha, ...patch } }, text)}
        onOpenConnections={onOpenConnections}
      />

      <TakeoversGroup
        rules={stored.takeovers}
        haConfigured={haConfigured}
        widgetLabel={widgetLabel}
        entityName={entityName}
        onAdd={() => setEditingTakeover({
          id: newTakeoverId(), widget: takeoverWidgets[0]?.name || '', entity: '', op: 'is', state: '', level: 'high', place: 'bottom', seconds: 0, enabled: true,
        })}
        onEdit={setEditingTakeover}
        onToggle={(rule, enabled) => persist(
          { ...stored, takeovers: stored.takeovers.map((item) => (item.id === rule.id ? { ...item, enabled } : item)) },
          t('admin:modes.savedBehavior')
        )}
        onOpenConnections={onOpenConnections}
      />

      <AdminGroup title={t('admin:modes.behaviorHeading')}>
        <AdminRow
          label={t('admin:modes.showLabel')}
          hint={t('admin:modes.showLabelHelp')}
          control={(
            <Switch
              checked={behavior.showLabel}
              onChange={(e) => setField({ showLabel: e.target.checked })}
              slotProps={{ input: { 'aria-label': t('admin:modes.showLabel') } }}
            />
          )}
        />
        <AdminRow
          label={t('admin:modes.returnAfter')}
          hint={t('admin:modes.returnAfterHelp')}
          control={(
            <TextField
              type="number"
              size="small"
              label={t('admin:modes.minutes')}
              value={behavior.returnMinutes}
              onChange={(e) => setField({ returnMinutes: editWholeNumber(e.target.value) })}
              slotProps={{ htmlInput: { min: 0, max: 120, step: 1 } }}
              sx={{ width: 130 }}
            />
          )}
        />
      </AdminGroup>

      <AdminFooter>
        <Button variant="contained" onClick={saveBehavior} disabled={saving} startIcon={<Save />}>
          {t('admin:modes.save')}
        </Button>
      </AdminFooter>

      {editingTakeover && (
        <TakeoverDialog
          rule={editingTakeover}
          isNew={!stored.takeovers.some((item) => item.id === editingTakeover.id)}
          widgets={takeoverWidgets}
          entities={entities}
          entitiesLoading={entitiesLoading}
          saving={saving}
          onCancel={() => setEditingTakeover(null)}
          onSave={async (rule) => {
            const exists = stored.takeovers.some((item) => item.id === rule.id);
            const takeovers = exists
              ? stored.takeovers.map((item) => (item.id === rule.id ? rule : item))
              : [...stored.takeovers, rule];
            if (await persist({ ...stored, takeovers }, t('admin:modes.takeovers.saved', { name: widgetLabel(rule.widget) }))) setEditingTakeover(null);
          }}
          onDelete={async (rule) => {
            if (!window.confirm(t('admin:modes.takeovers.confirmDelete', { name: widgetLabel(rule.widget) }))) return;
            const takeovers = stored.takeovers.filter((item) => item.id !== rule.id);
            if (await persist({ ...stored, takeovers }, t('admin:modes.takeovers.deleted'))) setEditingTakeover(null);
          }}
        />
      )}

      {editing && (
        <ModeDialog
          mode={editing}
          isNew={!stored.modes.some((item) => item.id === editing.id)}
          otherModes={stored.modes.filter((item) => item.id !== editing.id)}
          tabs={tabs}
          tabName={tabName}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={saveMode}
          onDelete={deleteMode}
          scheduleText={scheduleText}
          locale={i18n.language}
          haConnected={haConfigured}
          entities={entities}
          entitiesLoading={entitiesLoading}
          helperOn={Boolean(stored.ha.helper)}
          stacks={stacks}
          widgetLabel={widgetLabel}
        />
      )}
    </>
  );
};

const LEVEL_DOT = { urgent: 'var(--hg-error, #d32f2f)', high: '#E0A030', normal: 'var(--accent)' };
const PLACE_ICON = { bottom: <VerticalAlignBottom fontSize="small" />, top: <VerticalAlignTop fontSize="small" />, full: <Fullscreen fontSize="small" /> };

// Admin → Modes → Takeovers: widgets that take over part of the wall.
const TakeoversGroup = ({ rules, haConfigured, widgetLabel, entityName, onAdd, onEdit, onToggle, onOpenConnections }) => {
  const { t } = useTranslation(['admin']);
  const durationText = (seconds) => (seconds ? t('admin:modes.takeovers.for', { time: durationLabel(t, seconds) }) : t('admin:modes.takeovers.whileOn'));
  return (
    <AdminGroup
      title={t('admin:modes.takeovers.heading')}
      action={haConfigured ? (
        <Button size="small" startIcon={<Add />} onClick={onAdd}>{t('admin:modes.takeovers.add')}</Button>
      ) : null}
    >
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
        {t('admin:modes.takeovers.help')}
      </Typography>
      {!haConfigured && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ flex: '1 1 240px' }}>{t('admin:modes.takeovers.needsHa')}</Typography>
          <Button variant="outlined" onClick={onOpenConnections}>{t('admin:modes.ha.openConnections')}</Button>
        </Box>
      )}
      {haConfigured && rules.length === 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
          <PictureInPictureAltOutlined color="disabled" sx={{ fontSize: 32 }} />
          <Typography variant="body2" color="text.secondary">{t('admin:modes.takeovers.empty')}</Typography>
        </Box>
      )}
      {rules.map((rule) => (
        <Box key={rule.id} sx={{ display: 'flex', gap: 1.5, p: 1.5, alignItems: 'center', opacity: rule.enabled ? 1 : 0.55 }}>
          <Box sx={{ width: 8, alignSelf: 'stretch', minHeight: 40, borderRadius: 1, backgroundColor: LEVEL_DOT[rule.level], flex: 'none' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>{widgetLabel(rule.widget)}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {t(rule.op === 'is_not' ? 'admin:modes.takeovers.whenIsNot' : 'admin:modes.takeovers.whenIs', { name: entityName(rule.entity), state: rule.state })}
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.75 }}>
              <Chip size="small" label={t(`admin:modes.takeovers.levels.${rule.level}`)} />
              <Chip size="small" icon={PLACE_ICON[rule.place]} label={t(`admin:modes.takeovers.places.${rule.place}`)} />
              <Chip size="small" label={durationText(rule.seconds)} />
            </Stack>
          </Box>
          <Switch
            checked={rule.enabled}
            onChange={(e) => onToggle(rule, e.target.checked)}
            slotProps={{ input: { 'aria-label': t('admin:modes.takeovers.enabled', { name: widgetLabel(rule.widget) }) } }}
          />
          <Button size="small" onClick={() => onEdit(rule)}>{t('admin:modes.editDetails')}</Button>
        </Box>
      ))}
    </AdminGroup>
  );
};

const durationLabel = (t, seconds) => (seconds < 60
  ? t('admin:modes.takeovers.seconds', { count: seconds })
  : t('admin:modes.takeovers.minutes', { count: seconds / 60 }));

const TakeoverDialog = ({ rule, isNew, widgets, entities, entitiesLoading, saving, onCancel, onSave, onDelete }) => {
  const { t } = useTranslation(['admin']);
  const [draft, setDraft] = useState(rule);
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const entity = draft.entity ? entities.find((e) => e.entity_id === draft.entity) : null;
  const isPlugin = draft.widget.startsWith('plugin:');
  const canSave = draft.widget && draft.entity && draft.state && !saving;
  const toggleSx = { '& .MuiToggleButton-root': { textTransform: 'none', flex: 1, gap: 0.75, py: 1 } };

  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? t('admin:modes.takeovers.newTitle') : t('admin:modes.takeovers.editTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField select label={t('admin:modes.takeovers.widget')} value={draft.widget} onChange={(e) => set({ widget: e.target.value })}>
            {widgets.map((widget) => <MenuItem key={widget.name} value={widget.name}>{widget.label}</MenuItem>)}
          </TextField>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('admin:modes.takeovers.when')}</Typography>
            <Stack spacing={2}>
              <HaEntityPicker
                entities={entities}
                loading={entitiesLoading}
                value={draft.entity || null}
                onChange={(id) => {
                  const picked = entities.find((e) => e.entity_id === id);
                  // Most "show it while something's on" rules read best as
                  // "is not off" for things that have more than on and off.
                  const suggestions = statesFor(picked);
                  const offish = suggestions.includes('off') ? 'off' : '';
                  set({ entity: id || '', state: offish || suggestions[0] || '', op: offish && !['binary_sensor', 'input_boolean', 'switch'].includes((id || '').split('.')[0]) ? 'is_not' : 'is' });
                }}
                label={t('admin:modes.takeovers.entity')}
              />
              <Stack direction="row" spacing={2}>
                <TextField select label={t('admin:modes.takeovers.op')} value={draft.op} onChange={(e) => set({ op: e.target.value })} sx={{ width: 150 }}>
                  <MenuItem value="is">{t('admin:modes.takeovers.ops.is')}</MenuItem>
                  <MenuItem value="is_not">{t('admin:modes.takeovers.ops.is_not')}</MenuItem>
                </TextField>
                <Autocomplete
                  freeSolo
                  options={statesFor(entity)}
                  value={draft.state}
                  onInputChange={(_, value) => set({ state: value.slice(0, 100) })}
                  renderInput={(params) => (
                    <TextField {...params} label={t('admin:modes.ha.whenState')} helperText={entity ? t('admin:modes.ha.whenNow', { state: entity.state }) : ' '} />
                  )}
                  sx={{ flex: 1 }}
                />
              </Stack>
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('admin:modes.takeovers.importance')}</Typography>
            <ToggleButtonGroup exclusive fullWidth value={draft.level} onChange={(_, level) => level && set({ level })} sx={toggleSx}>
              {LEVELS.map((level) => (
                <ToggleButton key={level} value={level}>
                  <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: LEVEL_DOT[level] }} />
                  {t(`admin:modes.takeovers.levels.${level}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{t(`admin:modes.takeovers.levelHelp.${draft.level}`)}</Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('admin:modes.takeovers.where')}</Typography>
            <ToggleButtonGroup exclusive fullWidth value={draft.place} onChange={(_, place) => place && set({ place })} sx={toggleSx}>
              {['bottom', 'top', 'full'].map((place) => (
                <ToggleButton key={place} value={place}>{PLACE_ICON[place]}{t(`admin:modes.takeovers.places.${place}`)}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{t('admin:modes.takeovers.whereHelp')}</Typography>
          </Box>

          <TextField select label={t('admin:modes.takeovers.howLong')} value={draft.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })}>
            {DURATIONS.map((seconds) => (
              <MenuItem key={seconds} value={seconds}>{seconds ? durationLabel(t, seconds) : t('admin:modes.takeovers.whileOn')}</MenuItem>
            ))}
          </TextField>

          {isPlugin && <Alert severity="info" variant="outlined">{t('admin:modes.takeovers.pluginNote')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        {!isNew ? <Button color="error" onClick={() => onDelete(rule)} disabled={saving}>{t('admin:modes.takeovers.delete')}</Button> : <span />}
        <Stack direction="row" spacing={1}>
          <Button onClick={onCancel}>{t('admin:modes.cancel')}</Button>
          <Button variant="contained" disabled={!canSave} onClick={() => onSave({ ...draft })}>{t('admin:modes.takeovers.save')}</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

// One "turn on from Home Assistant" option in the mode dialog: a switch, and
// its fields while it's on.
const TriggerRow = ({ icon, title, hint, checked, onToggle, children }) => (
  <Box sx={{ py: 1.5, '&:not(:last-of-type)': { borderBottom: '1px solid', borderColor: 'divider' } }}>
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box sx={{ color: checked ? 'primary.main' : 'text.secondary', display: 'flex' }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{hint}</Typography>
      </Box>
      <Switch checked={checked} onChange={(e) => onToggle(e.target.checked)} slotProps={{ input: { 'aria-label': title } }} />
    </Stack>
    {checked && <Box sx={{ mt: 1.5, pl: { xs: 0, sm: 4.5 } }}>{children}</Box>}
  </Box>
);

const ModeDialog = ({ mode, isNew, otherModes, tabs, tabName, saving, onCancel, onSave, onDelete, locale, haConnected, entities, entitiesLoading, helperOn, stacks = [], widgetLabel }) => {
  const { t } = useTranslation(['admin']);
  const [draft, setDraft] = useState(mode);
  // What each Stack does in this mode, changed here: { stackId: setting | null }.
  const [stackChanges, setStackChanges] = useState({});
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const setSchedule = (patch) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, ...patch } }));
  const scheduled = Boolean(draft.schedule);

  const overlaps = useMemo(() => {
    if (!scheduled || draft.schedule.days.length === 0) return [];
    return findOverlaps([draft, ...otherModes]).filter((hit) => hit.a === draft.id || hit.b === draft.id);
  }, [draft, otherModes, scheduled]);

  const sameTimes = scheduled && draft.schedule.start === draft.schedule.end;
  const noDays = scheduled && draft.schedule.days.length === 0;
  const nameTaken = otherModes.some((item) => item.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
  // Home Assistant options: switched on, each needs its entity.
  const [homeOn, setHomeOn] = useState(mode.onlyHome.length > 0);
  const alarmMissing = Boolean(draft.alarm) && !draft.alarm.entity;
  const whenMissing = Boolean(draft.when) && (!draft.when.entity || !draft.when.state);
  const homeMissing = homeOn && draft.onlyHome.length === 0;
  const whenEntity = draft.when?.entity ? entities.find((e) => e.entity_id === draft.when.entity) : null;
  const canSave = draft.name.trim() && !nameTaken && overlaps.length === 0 && !sameTimes && !noDays && !saving
    && !alarmMissing && !whenMissing && !homeMissing;

  const overlapText = (hit) => {
    const other = otherModes.find((item) => item.id === (hit.a === draft.id ? hit.b : hit.a));
    const day = Math.floor(hit.from / MINUTES_PER_DAY) % 7;
    return t('admin:modes.overlap', {
      name: other?.name || '',
      day: t(`admin:modes.dayLong.${day}`),
      from: formatClock(hit.from % MINUTES_PER_DAY, locale),
      to: formatClock(hit.to % MINUTES_PER_DAY, locale),
    });
  };

  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? t('admin:modes.newTitle') : t('admin:modes.editTitle', { name: mode.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label={t('admin:modes.name')}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value.slice(0, 40) })}
            error={Boolean(nameTaken)}
            helperText={nameTaken ? t('admin:modes.nameTaken') : t('admin:modes.nameHelp')}
            autoFocus={isNew}
          />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('admin:modes.color')}</Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {MODE_COLORS.map((color) => (
                <ButtonBase
                  key={color}
                  onClick={() => set({ color })}
                  aria-label={color}
                  aria-pressed={draft.color === color}
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: color,
                    outline: draft.color === color ? '3px solid' : 'none',
                    outlineColor: 'text.primary',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </Stack>
          </Box>

          <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">{t('admin:modes.onSchedule')}</Typography>
              <Switch
                checked={scheduled}
                onChange={(e) => set({ schedule: e.target.checked ? emptyMode().schedule : null })}
                slotProps={{ input: { 'aria-label': t('admin:modes.onSchedule') } }}
              />
            </Stack>
            {!scheduled && (
              <Typography variant="body2" color="text.secondary">
                {haConnected ? t('admin:modes.ha.byHandHelp') : t('admin:modes.byHandHelp')}
              </Typography>
            )}
            {scheduled && (
              <Stack spacing={2} sx={{ mt: 1 }}>
                <ToggleButtonGroup
                  value={draft.schedule.days}
                  onChange={(_, days) => setSchedule({ days: [...days].sort() })}
                  aria-label={t('admin:modes.daysLabel')}
                  size="small"
                  sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minWidth: 48 } }}
                >
                  {DAY_ORDER.map((day) => (
                    <ToggleButton key={day} value={day} aria-label={t(`admin:modes.dayLong.${day}`)}>
                      {t(`admin:modes.dayShort.${day}`)}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Stack direction="row" spacing={2}>
                  <TextField
                    type="time"
                    label={t('admin:modes.start')}
                    value={draft.schedule.start}
                    onChange={(e) => e.target.value && setSchedule({ start: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    type="time"
                    label={t('admin:modes.end')}
                    value={draft.schedule.end}
                    onChange={(e) => e.target.value && setSchedule({ end: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                    helperText={draft.schedule.end < draft.schedule.start ? t('admin:modes.nextDay') : ' '}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                {noDays && <Alert severity="warning">{t('admin:modes.pickDays')}</Alert>}
                {sameTimes && <Alert severity="warning">{t('admin:modes.sameTimes')}</Alert>}
                {overlaps.map((hit) => (
                  <Alert key={`${hit.a}-${hit.b}`} severity="error">{overlapText(hit)}</Alert>
                ))}
              </Stack>
            )}
          </Box>

          {haConnected && (
            <Box>
              <Typography variant="subtitle2">{t('admin:modes.ha.triggersHeading')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {helperOn ? t('admin:modes.ha.triggersHelpHelper', { name: draft.name.trim() || t('admin:modes.ha.thisMode') }) : t('admin:modes.ha.triggersHelp')}
              </Typography>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, px: 2 }}>
                <TriggerRow
                  icon={<AlarmOutlined />}
                  title={t('admin:modes.ha.alarm')}
                  hint={t('admin:modes.ha.alarmHelp')}
                  checked={Boolean(draft.alarm)}
                  onToggle={(on) => set({
                    alarm: on ? { entity: entitiesOfKind(entities, 'alarm')[0]?.entity_id || '', until: '09:00' } : null,
                  })}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <HaEntityPicker
                      entities={entities}
                      loading={entitiesLoading}
                      kind="alarm"
                      value={draft.alarm?.entity || null}
                      onChange={(id) => set({ alarm: { ...draft.alarm, entity: id || '' } })}
                      label={t('admin:modes.ha.alarmSensor')}
                      helperText={t('admin:modes.ha.alarmSensorHelp')}
                      error={alarmMissing}
                      sx={{ flex: 2 }}
                    />
                    <TextField
                      type="time"
                      label={t('admin:modes.ha.until')}
                      value={draft.alarm?.until || '09:00'}
                      onChange={(e) => e.target.value && set({ alarm: { ...draft.alarm, until: e.target.value } })}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                </TriggerRow>

                <TriggerRow
                  icon={<ToggleOnOutlined />}
                  title={t('admin:modes.ha.when')}
                  hint={t('admin:modes.ha.whenHelp')}
                  checked={Boolean(draft.when)}
                  onToggle={(on) => set({ when: on ? { entity: '', state: '' } : null })}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <HaEntityPicker
                      entities={entities}
                      loading={entitiesLoading}
                      value={draft.when?.entity || null}
                      onChange={(id) => {
                        const entity = entities.find((e) => e.entity_id === id);
                        const first = statesFor(entity)[0] || '';
                        set({ when: { entity: id || '', state: id ? (draft.when?.entity === id ? draft.when.state : first) : '' } });
                      }}
                      label={t('admin:modes.ha.whenEntity')}
                      error={whenMissing && !draft.when?.entity}
                      sx={{ flex: 2 }}
                    />
                    <Autocomplete
                      freeSolo
                      options={statesFor(whenEntity)}
                      value={draft.when?.state || ''}
                      onInputChange={(_, value) => set({ when: { ...draft.when, state: value.slice(0, 100) } })}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={t('admin:modes.ha.whenState')}
                          helperText={whenEntity ? t('admin:modes.ha.whenNow', { state: whenEntity.state }) : ' '}
                          error={whenMissing && Boolean(draft.when?.entity)}
                        />
                      )}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                </TriggerRow>

                <TriggerRow
                  icon={<HomeOutlined />}
                  title={t('admin:modes.ha.home')}
                  hint={t('admin:modes.ha.homeHelp')}
                  checked={homeOn}
                  onToggle={(on) => {
                    setHomeOn(on);
                    set({ onlyHome: on ? entitiesOfKind(entities, 'people').filter((e) => e.entity_id.startsWith('person.')).map((e) => e.entity_id) : [] });
                  }}
                >
                  <HaEntityPicker
                    multiple
                    entities={entities}
                    loading={entitiesLoading}
                    kind="people"
                    value={draft.onlyHome}
                    onChange={(ids) => set({ onlyHome: ids })}
                    label={t('admin:modes.ha.homeWho')}
                    helperText={homeMissing ? t('admin:modes.ha.homePick') : t('admin:modes.ha.homeWhoHelp')}
                    error={homeMissing}
                  />
                </TriggerRow>
              </Box>
            </Box>
          )}

          <TextField
            select
            label={t('admin:modes.startTab')}
            value={draft.startTab ?? ''}
            onChange={(e) => set({ startTab: e.target.value === '' ? null : Number(e.target.value) })}
            helperText={t('admin:modes.startTabHelp')}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">{t('admin:modes.startTabNone')}</MenuItem>
            {tabs.map((tab) => (
              <MenuItem key={tab.number} value={tab.number}>{tab.label || tabName(tab.number)}</MenuItem>
            ))}
          </TextField>

          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle2">{t('admin:modes.dim')}</Typography>
              <Typography variant="body2" color="text.secondary">{t('admin:modes.dimHelp')}</Typography>
            </Box>
            <Switch
              checked={draft.dim}
              onChange={(e) => set({ dim: e.target.checked })}
              slotProps={{ input: { 'aria-label': t('admin:modes.dim') } }}
            />
          </Stack>

          {stacks.length > 0 && (
            <Box>
              <Typography variant="subtitle2">{t('admin:stacks.modes.inThisMode')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('admin:stacks.modes.inThisModeHelp')}</Typography>
              <StackModeRows
                rows={stacks.map((stack) => ({
                  key: stack.id,
                  title: stack.name || stack.widgets.map(widgetLabel).join(' · '),
                  stack,
                  setting: stack.id in stackChanges ? stackChanges[stack.id] : (stack.modes?.[mode.id] || null),
                }))}
                widgetLabel={widgetLabel}
                onChange={(stackId, setting) => setStackChanges((prev) => ({ ...prev, [stackId]: setting }))}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        {!isNew ? (
          <Button color="error" onClick={() => onDelete(mode)} disabled={saving}>{t('admin:modes.delete')}</Button>
        ) : <span />}
        <Stack direction="row" spacing={1}>
          <Button onClick={onCancel}>{t('admin:modes.cancel')}</Button>
          <Button variant="contained" onClick={() => onSave({ ...draft, name: draft.name.trim() }, stackChanges)} disabled={!canSave}>
            {t('admin:modes.saveMode')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

export default ModesSettings;
