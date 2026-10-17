import React from 'react';
import {
  Box, Checkbox, Chip, FormControlLabel, FormGroup, Radio, RadioGroup, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NOTIFICATION_EVENTS } from '../utils/pushNotifications.js';

// What a notification recipient hears about, and whose: shared by a device's
// browser push (DeviceNotifications) and an ntfy topic (NtfyTopicsTab).
// `members` is 'all' or a list of family member ids; `onChange` gets
// { events } or { members } with the next value. Leaving no one chosen, or no
// event, isn't offered: the last one can't be turned off.

export const EVENT_LABELS = {
  'chore.completed': 'admin:devices.notifications.eventCompleted',
  'chore.allCompleted': 'admin:devices.notifications.eventAllDone',
};

export default function NotificationAudience({ events, members, people, onChange, disabled = false }) {
  const { t } = useTranslation(['admin']);
  const chosen = Array.isArray(members) ? members : null;

  const toggleEvent = (event, on) => {
    const next = new Set(events);
    if (on) next.add(event); else next.delete(event);
    onChange({ events: NOTIFICATION_EVENTS.filter((e) => next.has(e)) });
  };
  const toggleMember = (id) => {
    const next = new Set(chosen || []);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (next.size) onChange({ members: [...next] });
  };

  return (
    <>
      <Typography variant="body2" sx={{ mb: 1 }}>{t('admin:devices.notifications.tellMeWhen')}</Typography>
      <FormGroup sx={{ mb: 1.5 }}>
        {NOTIFICATION_EVENTS.map((event) => (
          <FormControlLabel
            key={event}
            control={(
              <Checkbox
                checked={events.includes(event)}
                onChange={(e) => toggleEvent(event, e.target.checked)}
                disabled={disabled}
              />
            )}
            label={t(EVENT_LABELS[event])}
          />
        ))}
      </FormGroup>

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
