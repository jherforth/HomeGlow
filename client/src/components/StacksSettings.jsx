import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, Close, ViewCarouselOutlined } from '@mui/icons-material';
import Autocomplete from '@mui/material/Autocomplete';
import { useTranslation } from 'react-i18next';
import { AdminGroup } from './AdminRows.jsx';
import HaEntityPicker, { statesFor } from './HaEntityPicker.jsx';
import { StackModeRows } from './StackModeFields.jsx';
import { DISPLAY_MODES_KEY, normalizeModesSettings } from '../utils/displayModes.js';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import {
  RETURN_CHOICES,
  WIDGET_STACKS_KEY,
  newStackId,
  normalizeStack,
  normalizeStacks,
  stackName,
  withModeSetting,
} from '../utils/widgetStacks.js';

const DEVICE_SETTINGS_UPDATED_EVENT = 'homeglow:device-settings-updated';
const CORE_WIDGETS = ['calendar', 'weather', 'chores', 'photos'];

/**
 * Admin → Dashboard → Widgets, under the widgets: this display's Stacks (utils/widgetStacks.js),
 * several widgets in one spot, flicked between. A Stack can also be made on
 * the wall: in Move/Resize, hold a widget over another.
 */
const StacksSettings = ({ onOpenConnections, onChanged }) => {
  const { t } = useTranslation(['admin', 'common']);
  const apiDeviceUrl = getDeviceApiBase(API_BASE_URL);
  const [stacks, setStacks] = useState(null);
  const [modes, setModes] = useState([]);
  const [deviceSettings, setDeviceSettings] = useState({});
  const [tabs, setTabs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [haConfigured, setHaConfigured] = useState(false);
  const [entities, setEntities] = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [editing, setEditing] = useState(null); // { stack, isNew, tab }
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const flash = (type, text) => {
    const next = { type, text };
    setMessage(next);
    if (type === 'success') setTimeout(() => setMessage((current) => (current === next ? null : current)), 4000);
  };

  const load = useCallback(async () => {
    try {
      const [settingsResponse, tabsResponse, assignmentsResponse] = await Promise.all([
        axios.get(`${apiDeviceUrl}/settings`),
        axios.get(`${apiDeviceUrl}/tabs`),
        axios.get(`${apiDeviceUrl}/widget-assignments`),
      ]);
      const settings = settingsResponse.data || {};
      setDeviceSettings(settings);
      setStacks(normalizeStacks(settings[WIDGET_STACKS_KEY]).stacks);
      setModes(normalizeModesSettings(settings[DISPLAY_MODES_KEY]).modes);
      setTabs(Array.isArray(tabsResponse.data) ? tabsResponse.data : []);
      setAssignments(Array.isArray(assignmentsResponse.data) ? assignmentsResponse.data : []);
      axios.get(`${API_BASE_URL}/api/widgets`)
        .then(({ data }) => setPlugins(Array.isArray(data) ? data : []))
        .catch(() => setPlugins([]));
      axios.get(`${apiDeviceUrl}/stacks/ha`)
        .then(({ data }) => setHaConfigured(Boolean(data?.connected)))
        .catch(() => setHaConfigured(false));
    } catch (error) {
      console.error('Error loading stacks:', error);
      flash('error', t('admin:stacks.loadFailed'));
    }
  }, [apiDeviceUrl, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const reload = () => { void load(); };
    window.addEventListener(DEVICE_SETTINGS_UPDATED_EVENT, reload);
    return () => window.removeEventListener(DEVICE_SETTINGS_UPDATED_EVENT, reload);
  }, [load]);

  useEffect(() => {
    if (!haConfigured) return;
    setEntitiesLoading(true);
    axios.get(`${apiDeviceUrl}/stacks/ha/entities`)
      .then(({ data }) => setEntities(Array.isArray(data?.entities) ? data.entities : []))
      .catch(() => setEntities([]))
      .finally(() => setEntitiesLoading(false));
  }, [haConfigured, apiDeviceUrl]);

  const widgetLabel = (name) => (name.startsWith('plugin:')
    ? (plugins.find((p) => `plugin:${p.filename}` === name)?.name || name.slice('plugin:'.length).replace(/\.html?$/i, ''))
    : t(`admin:screensaver.expand.widgetNames.${name}`, { defaultValue: name }));
  const entityName = (id) => entities.find((e) => e.entity_id === id)?.name || id;
  const tabName = (number) => tabs.find((tab) => tab.number === Number(number))?.label || t('admin:stacks.tabNumber', { number });

  // Widgets turned on here: what a Stack can hold.
  const available = [
    ...CORE_WIDGETS.filter((name) => deviceSettings.widgetSettings?.[name]?.enabled),
    ...plugins.filter((p) => deviceSettings.pluginSettings?.[p.filename]?.enabled).map((p) => `plugin:${p.filename}`),
  ];

  const tabsOf = (stack) => assignments
    .filter((row) => row.widget_name === stackName(stack.id))
    .map((row) => row.tab_number);

  const assign = (name, tab) => axios.post(`${apiDeviceUrl}/widget-assignments`, { widget_name: name, tabNumber: tab }).catch(() => {});
  const unassign = (name, tab) => axios.delete(`${apiDeviceUrl}/widget-assignments/${encodeURIComponent(`${tab}::${name}`)}`).catch(() => {});

  const saveStacks = async (next) => {
    await axios.patch(`${apiDeviceUrl}/settings`, { [WIDGET_STACKS_KEY]: { stacks: next } });
  };
  const done = async (text) => {
    window.dispatchEvent(new Event(DEVICE_SETTINGS_UPDATED_EVENT));
    await load();
    await onChanged?.();
    flash('success', text);
  };

  // Put a Stack on these tabs. Where it goes, it takes its widgets' place.
  const placeOn = async (stack, numbers) => {
    const name = stackName(stack.id);
    const now = tabsOf(stack);
    for (const tab of numbers.filter((n) => !now.includes(n))) {
      await assign(name, tab);
      const there = new Set(assignments.filter((row) => row.tab_number === Number(tab)).map((row) => row.widget_name));
      await Promise.all(stack.widgets.filter((widget) => there.has(widget)).map((widget) => unassign(widget, tab)));
    }
    for (const tab of now.filter((n) => !numbers.includes(n))) await unassign(name, tab);
  };
  const onPlace = async (stack, numbers) => {
    setSaving(true);
    try {
      await placeOn(stack, numbers);
      await done(t('admin:stacks.placed'));
    } finally {
      setSaving(false);
    }
  };

  const onSave = async (raw, isNew, numbers) => {
    setSaving(true);
    // Mode settings for widgets no longer in it go.
    const draft = normalizeStack(raw) || raw;
    try {
      const next = isNew ? [...stacks, draft] : stacks.map((stack) => (stack.id === draft.id ? draft : stack));
      await saveStacks(next);
      await placeOn(draft, numbers);
      setEditing(null);
      await done(t('admin:stacks.saved', { name: draft.name || t('admin:stacks.untitled') }));
    } catch (error) {
      console.error('Error saving stack:', error);
      flash('error', error?.response?.data?.error || t('admin:stacks.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Unstack: the widgets go back on each tab the Stack was on, the first in its spot.
  const onUnstack = async (stack) => {
    if (!window.confirm(t('admin:stacks.confirmUnstack'))) return;
    setSaving(true);
    try {
      const name = stackName(stack.id);
      for (const row of assignments.filter((item) => item.widget_name === name)) {
        const tab = row.tab_number;
        const there = new Set(assignments.filter((item) => item.tab_number === tab).map((item) => item.widget_name));
        const back = stack.widgets.filter((widget) => !there.has(widget));
        await unassign(name, tab);
        for (const widget of back) await assign(widget, tab);
        if (back[0] && row.layout_w != null) {
          await axios.patch(`${apiDeviceUrl}/widget-assignments/layout/bulk`, {
            layouts: [{ widget_name: back[0], tabNumber: tab, layout_x: row.layout_x, layout_y: row.layout_y, layout_w: row.layout_w, layout_h: row.layout_h }],
          }).catch(() => {});
        }
      }
      await saveStacks(stacks.filter((item) => item.id !== stack.id));
      setEditing(null);
      await done(t('admin:stacks.unstacked'));
    } catch (error) {
      console.error('Error unstacking:', error);
      flash('error', t('admin:stacks.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!stacks) return message ? <Alert severity={message.type}>{message.text}</Alert> : null;

  return (
    <Box>
      {message && <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <AdminGroup
        title={t('admin:stacks.heading')}
        action={(
          <Button
            size="small"
            startIcon={<Add />}
            disabled={available.length < 2}
            onClick={() => setEditing({
              isNew: true,
              stack: { id: newStackId(), name: '', widgets: available.slice(0, 2), returnSeconds: 60, attention: [], modes: {} },
            })}
          >
            {t('admin:stacks.add')}
          </Button>
        )}
      >
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
          {t('admin:stacks.help')}
        </Typography>
        {stacks.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
            <ViewCarouselOutlined color="disabled" sx={{ fontSize: 32 }} />
            <Typography variant="body2" color="text.secondary">{t('admin:stacks.empty')}</Typography>
          </Box>
        )}
        {stacks.map((stack) => {
          const on = tabsOf(stack);
          return (
            <Box key={stack.id} data-stack-row={stack.id} sx={{ p: 1.5, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <ViewCarouselOutlined sx={{ color: 'var(--accent)', flex: 'none' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{stack.name || stack.widgets.map(widgetLabel).join(' · ')}</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.75 }}>
                    {stack.widgets.map((widget, i) => (
                      <Chip key={widget} size="small" variant={i === 0 ? 'filled' : 'outlined'} label={widgetLabel(widget)} />
                    ))}
                  </Stack>
                </Box>
                <Button size="small" onClick={() => setEditing({ isNew: false, stack })}>{t('admin:stacks.edit')}</Button>
              </Box>
              <TabsPicker
                tabs={tabs}
                value={on}
                disabled={saving}
                onChange={(numbers) => onPlace(stack, numbers)}
                helperText={on.length ? t('admin:stacks.placeOnHelp') : t('admin:stacks.notPlaced')}
                sx={{ mt: 1.5, ml: { sm: 4.5 } }}
              />
            </Box>
          );
        })}
      </AdminGroup>

      {editing && (
        <StackDialog
          stack={editing.stack}
          isNew={editing.isNew}
          tabs={tabs}
          placedOn={tabsOf(editing.stack)}
          modes={modes}
          available={available}
          widgetLabel={widgetLabel}
          entityName={entityName}
          haConfigured={haConfigured}
          entities={entities}
          entitiesLoading={entitiesLoading}
          saving={saving}
          onOpenConnections={onOpenConnections}
          onCancel={() => setEditing(null)}
          onSave={onSave}
          onUnstack={() => onUnstack(editing.stack)}
        />
      )}
    </Box>
  );
};

const returnLabel = (t, seconds) => {
  if (!seconds) return t('admin:stacks.returnNever');
  return seconds < 60
    ? t('admin:stacks.seconds', { count: seconds })
    : t('admin:stacks.minutes', { count: seconds / 60 });
};

// "Show on tabs", like each widget above.
const TabsPicker = ({ tabs, value, onChange, disabled, helperText, sx }) => {
  const { t } = useTranslation(['admin']);
  return (
    <Autocomplete
      multiple
      size="small"
      disabled={disabled}
      options={tabs}
      getOptionLabel={(option) => option.label || t('admin:stacks.tabNumber', { number: option.number })}
      isOptionEqualToValue={(a, b) => a.number === b.number}
      value={tabs.filter((tab) => value.includes(tab.number))}
      onChange={(_, picked) => onChange(picked.map((tab) => tab.number))}
      renderInput={(params) => (
        <TextField {...params} label={t('admin:widgets.showOnTabs')} placeholder={value.length ? '' : t('admin:widgets.selectTabs')} helperText={helperText} />
      )}
      sx={sx}
    />
  );
};

const StackDialog = ({
  stack, isNew, tabs, placedOn, modes, available, widgetLabel, entityName, haConfigured, entities, entitiesLoading,
  saving, onOpenConnections, onCancel, onSave, onUnstack,
}) => {
  const { t } = useTranslation(['admin']);
  const [draft, setDraft] = useState(stack);
  const [onTabs, setOnTabs] = useState(isNew ? (tabs[0] ? [tabs[0].number] : []) : placedOn);
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const choices = [...new Set([...draft.widgets, ...available])];
  const addable = choices.filter((name) => !draft.widgets.includes(name));
  const ruleFor = (widget) => draft.attention.find((rule) => rule.widget === widget) || null;

  const move = (i, step) => {
    const widgets = [...draft.widgets];
    [widgets[i], widgets[i + step]] = [widgets[i + step], widgets[i]];
    set({ widgets });
  };
  const remove = (widget) => set({
    widgets: draft.widgets.filter((name) => name !== widget),
    attention: draft.attention.filter((rule) => rule.widget !== widget),
  });
  const setRule = (widget, patch) => {
    const current = ruleFor(widget);
    const rest = draft.attention.filter((rule) => rule.widget !== widget);
    if (patch === null) return set({ attention: rest });
    return set({ attention: [...rest, { widget, op: 'is', state: '', entity: '', ...current, ...patch }] });
  };
  const rulesOk = draft.attention.every((rule) => rule.entity && rule.state);
  const canSave = draft.widgets.length >= 2 && rulesOk && !saving;

  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? t('admin:stacks.newTitle') : t('admin:stacks.editTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label={t('admin:stacks.name')}
            placeholder={draft.widgets.map(widgetLabel).join(' · ')}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value.slice(0, 40) })}
            helperText={t('admin:stacks.nameHelp')}
          />

          <Box>
            <Typography variant="subtitle2">{t('admin:stacks.widgets')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('admin:stacks.widgetsHelp')}</Typography>
            <Stack spacing={1}>
              {draft.widgets.map((widget, i) => {
                const rule = ruleFor(widget);
                const entity = rule?.entity ? entities.find((e) => e.entity_id === rule.entity) : null;
                return (
                  <Box key={widget} sx={{ border: '1px solid var(--card-border)', borderRadius: 2, p: 1.25 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ width: 22, color: 'text.secondary', fontWeight: 700 }}>{i + 1}</Typography>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600 }} noWrap>{widgetLabel(widget)}</Typography>
                        {i === 0 && <Typography variant="caption" color="text.secondary">{t('admin:stacks.first')}</Typography>}
                      </Box>
                      <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('admin:stacks.moveUp', { name: widgetLabel(widget) })}><ArrowUpward fontSize="small" /></IconButton>
                      <IconButton size="small" disabled={i === draft.widgets.length - 1} onClick={() => move(i, 1)} aria-label={t('admin:stacks.moveDown', { name: widgetLabel(widget) })}><ArrowDownward fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => remove(widget)} aria-label={t('admin:stacks.remove', { name: widgetLabel(widget) })}><Close fontSize="small" /></IconButton>
                    </Box>
                    {haConfigured && !rule && (
                      <Button size="small" sx={{ mt: 0.5, ml: 3 }} onClick={() => setRule(widget, {})}>{t('admin:stacks.addJump')}</Button>
                    )}
                    {haConfigured && rule && (
                      <Stack spacing={1.5} sx={{ mt: 1.25, ml: 3.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>{t('admin:stacks.jumpWhen')}</Typography>
                          <Button size="small" onClick={() => setRule(widget, null)}>{t('admin:stacks.removeJump')}</Button>
                        </Box>
                        <HaEntityPicker
                          entities={entities}
                          loading={entitiesLoading}
                          value={rule.entity || null}
                          onChange={(id) => {
                            const picked = entities.find((e) => e.entity_id === id);
                            const suggestions = statesFor(picked);
                            const offish = suggestions.includes('off') ? 'off' : '';
                            setRule(widget, {
                              entity: id || '',
                              state: offish || suggestions[0] || '',
                              op: offish && !['binary_sensor', 'input_boolean', 'switch'].includes((id || '').split('.')[0]) ? 'is_not' : 'is',
                            });
                          }}
                          label={t('admin:stacks.entity')}
                        />
                        <Stack direction="row" spacing={1.5}>
                          <TextField select size="small" label={t('admin:stacks.op')} value={rule.op} onChange={(e) => setRule(widget, { op: e.target.value })} sx={{ width: 130 }}>
                            <MenuItem value="is">{t('admin:stacks.ops.is')}</MenuItem>
                            <MenuItem value="is_not">{t('admin:stacks.ops.is_not')}</MenuItem>
                          </TextField>
                          <Autocomplete
                            freeSolo
                            size="small"
                            options={statesFor(entity)}
                            value={rule.state}
                            onInputChange={(_, value) => setRule(widget, { state: value.slice(0, 100) })}
                            renderInput={(params) => <TextField {...params} label={t('admin:stacks.state')} />}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        {rule.entity && rule.state && (
                          <Typography variant="caption" color="text.secondary">
                            {t(rule.op === 'is_not' ? 'admin:stacks.whenIsNot' : 'admin:stacks.whenIs', { name: entityName(rule.entity), state: rule.state })}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Box>
                );
              })}
            </Stack>
            {addable.length > 0 && draft.widgets.length < 12 && (
              <TextField
                select
                size="small"
                label={t('admin:stacks.addWidget')}
                value=""
                onChange={(e) => set({ widgets: [...draft.widgets, e.target.value] })}
                sx={{ mt: 1.5, minWidth: 220 }}
              >
                {addable.map((name) => <MenuItem key={name} value={name}>{widgetLabel(name)}</MenuItem>)}
              </TextField>
            )}
            {draft.widgets.length < 2 && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>{t('admin:stacks.needTwo')}</Typography>
            )}
            {!haConfigured && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 220px' }}>{t('admin:stacks.jumpNeedsHa')}</Typography>
                <Button size="small" variant="outlined" onClick={onOpenConnections}>{t('admin:stacks.openConnections')}</Button>
              </Box>
            )}
          </Box>

          <TextField
            select
            label={t('admin:stacks.returnAfter')}
            value={draft.returnSeconds}
            onChange={(e) => set({ returnSeconds: Number(e.target.value) })}
            helperText={t('admin:stacks.returnHelp')}
          >
            {[...new Set([...RETURN_CHOICES, draft.returnSeconds])].sort((a, b) => a - b).map((seconds) => (
              <MenuItem key={seconds} value={seconds}>{returnLabel(t, seconds)}</MenuItem>
            ))}
          </TextField>

          <TabsPicker tabs={tabs} value={onTabs} onChange={setOnTabs} helperText={t('admin:stacks.placeOnHelp')} />

          {draft.widgets.length >= 2 && (
            <Box>
              <Typography variant="subtitle2">{t('admin:stacks.modes.heading')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {modes.length ? t('admin:stacks.modes.help') : t('admin:stacks.modes.none')}
              </Typography>
              {modes.length > 0 && (
                <StackModeRows
                  rows={modes.map((mode) => ({
                    key: mode.id,
                    title: mode.name,
                    color: mode.color,
                    stack: draft,
                    setting: draft.modes?.[mode.id] || null,
                  }))}
                  widgetLabel={widgetLabel}
                  onChange={(modeId, setting) => setDraft((prev) => withModeSetting(prev, modeId, setting))}
                />
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {!isNew && <Button color="error" onClick={onUnstack} disabled={saving} sx={{ mr: 'auto' }}>{t('admin:stacks.unstack')}</Button>}
        <Button onClick={onCancel}>{t('admin:stacks.cancel')}</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => onSave(draft, isNew, onTabs)}>{t('admin:stacks.save')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default StacksSettings;
