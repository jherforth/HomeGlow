import React from 'react';
import {
  Box, Checkbox, Chip, FormControlLabel, FormGroup, Radio, RadioGroup, Tooltip, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NOTIFICATION_EVENTS } from '../utils/pushNotifications.js';
import { lastSend } from '../utils/notificationChannels.js';

// What a notification recipient hears about, and whose: shared by a device's
// browser push, an ntfy topic and a Home Assistant phone (Admin → System →
// Notifications), so every recipient chooses the same way.
//
// `events` holds chore events and "plugin:<id>" for each plugin it hears;
// `plugins` are the installed plugins that may notify ([{ id, name }]).
// `members` is 'all' or a list of family member ids. `onChange` gets
// { events } or { members } with the next value. Leaving no one chosen isn't
// offered: the last person can't be turned off.

export const EVENT_LABELS = {
  'chore.completed': 'admin:devices.notifications.eventCompleted',
  'chore.allCompleted': 'admin:devices.notifications.eventAllDone',
};

export const pluginEvent = (pluginId) => `plugin:${pluginId}`;

/** A chosen event's label: a chore event's words, or the plugin's name. */
export function eventLabel(t, event, plugins = []) {
  if (EVENT_LABELS[event]) return t(EVENT_LABELS[event]);
  const id = event.startsWith('plugin:') ? event.slice('plugin:'.length) : event;
  return plugins.find((plugin) => plugin.id === id)?.name || id;
}

export default function NotificationAudience({
  events, members, people, plugins = [], onChange, disabled = false,
}) {
  const { t } = useTranslation(['admin']);
  const chosen = Array.isArray(members) ? members : null;

  const toggleEvent = (event, on) => {
    const next = new Set(events);
    if (on) next.add(event); else next.delete(event);
    // Only what can still be chosen: a plugin removed since drops out.
    const choosable = [...NOTIFICATION_EVENTS, ...plugins.map((plugin) => pluginEvent(plugin.id))];
    onChange({ events: choosable.filter((e) => next.has(e)) });
  };
  const toggleMember = (id) => {
    const next = new Set(chosen || []);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (next.size) onChange({ members: [...next] });
  };

  const box = (event, label) => (
    <FormControlLabel
      key={event}
      control={(
        <Checkbox
          checked={events.includes(event)}
          onChange={(e) => toggleEvent(event, e.target.checked)}
          disabled={disabled}
        />
      )}
      label={label}
    />
  );

  return (
    <>
      <Typography variant="body2" sx={{ mb: 1 }}>{t('admin:devices.notifications.tellMeWhen')}</Typography>
      <FormGroup sx={{ mb: 1.5 }}>
        {NOTIFICATION_EVENTS.map((event) => box(event, t(EVENT_LABELS[event])))}
      </FormGroup>

      {plugins.length > 0 && (
        <>
          <Typography variant="body2" sx={{ mb: 1 }}>{t('admin:devices.notifications.fromPlugins')}</Typography>
          <FormGroup sx={{ mb: 1.5 }}>
            {plugins.map((plugin) => box(pluginEvent(plugin.id), plugin.name))}
          </FormGroup>
        </>
      )}

      <Typography variant="body2" sx={{ mb: 0.5 }}>{t('admin:devices.notifications.whose')}</Typography>
      <RadioGroup
        row
        value={chosen ? 'some' : 'all'}
        onChange={(e) => onChange({ members: e.target.value === 'all' ? 'all' : people.map((p) => p.id) })}
      >
        <FormControlLabel value="all" control={<Radio disabled={disabled} />} label={t('admin:devices.notifications.everyone')} />
        <FormControlLabel value="some" control={<Radio disabled={disabled || !people.length} />} label={t('admin:devices.notifications.only')} />
      </RadioGroup>
      {chosen && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          {people.map((p) => (
            <Chip
              key={p.id}
              label={p.username}
              color={chosen.includes(p.id) ? 'primary' : 'default'}
              variant={chosen.includes(p.id) ? 'filled' : 'outlined'}
              onClick={() => toggleMember(p.id)}
              disabled={disabled}
            />
          ))}
        </Box>
      )}
    </>
  );
}

/** How a recipient's last send went, for its table row. */
export function LastSendChip({ recipient }) {
  const { t } = useTranslation(['admin']);
  const outcome = lastSend(recipient);
  if (outcome === 'failed') {
    return (
      <Tooltip title={recipient.lastFailure}>
        <Chip size="small" color="warning" label={t('admin:notify.failed')} />
      </Tooltip>
    );
  }
  if (outcome === 'delivered') return <Chip size="small" color="success" variant="outlined" label={t('admin:notify.delivered')} />;
  return '—';
}

/** "Hears about" as chips, and "About" as names, for a recipient's table row. */
export function AudienceSummary({ events, members, people, plugins }) {
  const { t } = useTranslation(['admin']);
  const nameOf = (id) => people.find((p) => p.id === id)?.username || `#${id}`;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
        {events.length
          ? events.map((event) => <Chip key={event} size="small" label={eventLabel(t, event, plugins)} />)
          : <Typography variant="body2" color="text.secondary">{t('admin:notify.nothing')}</Typography>}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('admin:notify.aboutWhom', {
          whom: members === 'all' ? t('admin:devices.notifications.everyone') : (members || []).map(nameOf).join(', '),
        })}
      </Typography>
    </Box>
  );
}
