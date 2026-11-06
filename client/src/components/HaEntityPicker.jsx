import React from 'react';
import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';

// Which entities each picker offers. Next-alarm sensors come first for alarms.
export const ENTITY_KINDS = {
  helper: (e) => e.entity_id.startsWith('input_select.'),
  alarm: (e) => e.entity_id.startsWith('sensor.') && (e.device_class === 'timestamp' || /alarm/.test(e.entity_id)),
  people: (e) => /^(person|device_tracker|zone)\./.test(e.entity_id),
  any: () => true,
};

const alarmRank = (e) => (/next_alarm/.test(e.entity_id) ? 0 : 1);

export function entitiesOfKind(entities, kind) {
  const list = (entities || []).filter(ENTITY_KINDS[kind] || ENTITY_KINDS.any);
  if (kind === 'alarm') return [...list].sort((a, b) => alarmRank(a) - alarmRank(b) || a.name.localeCompare(b.name));
  return list;
}

const renderOption = (props, option) => {
  const { key, ...rest } = props;
  return (
    <Box component="li" key={key} {...rest} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 600 }}>{option.name}</Typography>
        <Typography noWrap variant="body2" color="text.secondary" sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
          {option.entity_id}
        </Typography>
      </Box>
      {option.state != null && option.state !== '' && (
        <Chip size="small" label={String(option.state).length > 22 ? `${String(option.state).slice(0, 20)}…` : option.state} />
      )}
    </Box>
  );
};

/**
 * Pick Home Assistant entities by friendly name, with their id and state.
 * `entities` is [{ entity_id, name, state, device_class }]; `value` an entity
 * id (or ids, with `multiple`).
 */
// The states worth offering for "when <entity> is …".
const STATE_SUGGESTIONS = {
  binary_sensor: ['on', 'off'],
  input_boolean: ['on', 'off'],
  switch: ['on', 'off'],
  light: ['on', 'off'],
  fan: ['on', 'off'],
  person: ['home', 'not_home'],
  device_tracker: ['home', 'not_home'],
  lock: ['locked', 'unlocked'],
  cover: ['open', 'closed'],
  media_player: ['playing', 'paused', 'idle', 'off'],
  alarm_control_panel: ['disarmed', 'armed_home', 'armed_away', 'armed_night', 'triggered'],
  vacuum: ['cleaning', 'docked', 'returning', 'error'],
};
export const statesFor = (entity) => {
  if (!entity) return [];
  if (Array.isArray(entity.options)) return entity.options;
  const domain = entity.entity_id.split('.')[0];
  const list = STATE_SUGGESTIONS[domain] || [];
  return entity.state && !list.includes(entity.state) ? [...list, entity.state] : list;
};

const HaEntityPicker = ({ entities, kind = 'any', value, onChange, label, placeholder, helperText, multiple = false, loading = false, error = false, sx }) => {
  const options = entitiesOfKind(entities, kind);
  const byId = new Map((entities || []).map((e) => [e.entity_id, e]));
  // An id the list doesn't have (Home Assistant away, or renamed) still shows.
  const known = (id) => byId.get(id) || { entity_id: id, name: id, state: null };
  const selected = multiple ? (value || []).map(known) : (value ? known(value) : null);

  return (
    <Autocomplete
      multiple={multiple}
      options={options}
      value={selected}
      loading={loading}
      onChange={(_, next) => onChange(multiple ? next.map((e) => e.entity_id) : (next?.entity_id || null))}
      getOptionLabel={(option) => option?.name || option?.entity_id || ''}
      isOptionEqualToValue={(a, b) => a.entity_id === b.entity_id}
      filterOptions={(list, { inputValue }) => {
        const q = inputValue.trim().toLowerCase();
        if (!q) return list.slice(0, 200);
        return list.filter((e) => e.name.toLowerCase().includes(q) || e.entity_id.includes(q)).slice(0, 200);
      }}
      renderOption={renderOption}
      renderValue={multiple ? (items, getItemProps) => items.map((item, index) => {
        const { key, ...rest } = getItemProps({ index });
        return <Chip key={key} size="small" label={item.name} {...rest} />;
      }) : undefined}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} helperText={helperText} error={error} />
      )}
      sx={sx}
    />
  );
};

export default HaEntityPicker;
