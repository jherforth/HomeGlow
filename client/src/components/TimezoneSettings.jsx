import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';
import { useTranslation } from 'react-i18next';
import {
  detectBrowserTimezone,
  fetchServerTimezoneInfo,
  formatUtcOffset,
  listTimeZones,
  saveServerTimezone,
} from '../utils/timezone.js';

/**
 * The household time zone (issue #193). Unlike the rest of the Interface tab
 * this is not per display: it is the server's zone, which decides chore days,
 * due times and the midnight reset for everyone.
 */
const TimezoneSettings = () => {
  const { t } = useTranslation(['admin']);
  const [info, setInfo] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const browserZone = useMemo(() => detectBrowserTimezone(), []);
  // Offsets as of now: the list shows what each zone is today, DST included.
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    try {
      const data = await fetchServerTimezoneInfo();
      setInfo(data);
      setSelected(data.timezone);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const zones = useMemo(() => listTimeZones(info?.timezone), [info?.timezone]);
  const nameOf = (zone) => zone.replaceAll('_', ' ');
  const labelFor = useCallback(
    (zone) => (zone ? `${zone.replaceAll('_', ' ')} (${formatUtcOffset(zone, now)})` : ''),
    [now],
  );
  // Match "new york", "new_york" and "-05:00" alike.
  const filterOptions = useMemo(
    () => createFilterOptions({ stringify: (zone) => `${zone} ${labelFor(zone)}` }),
    [labelFor],
  );

  const save = async (timezone) => {
    setSaving(true);
    setStatus(null);
    try {
      const data = await saveServerTimezone(timezone);
      setInfo(data);
      setSelected(data.timezone);
      setStatus({ type: 'success', text: t('admin:timezone.saved', { zone: nameOf(data.timezone) }) });
    } catch (error) {
      setStatus({ type: 'error', text: t('admin:timezone.saveFailed', { error: error.message }) });
    } finally {
      setSaving(false);
    }
  };

  if (loadFailed) {
    return <Alert severity="error">{t('admin:timezone.loadFailed')}</Alert>;
  }
  if (!info) {
    return <CircularProgress size={24} />;
  }

  const SOURCE_KEYS = {
    setting: 'sourceSetting',
    env: 'sourceEnv',
    host: 'sourceHost',
    default: 'sourceDefault',
  };
  const sourceText = t(`admin:timezone.${SOURCE_KEYS[info.source] || 'sourceDefault'}`);
  // What clearing the saved zone goes back to. Older servers only report
  // envTimezone, so fall back on that.
  const fallbackSource = info.fallbackSource || (info.envTimezone ? 'env' : 'default');
  const fallbackZone = nameOf(info.fallbackTimezone || info.envTimezone || 'America/New_York');
  const RESET_KEYS = { env: 'resetToEnv', host: 'resetToHost', default: 'resetToDefault' };

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 2 }}>
        {t('admin:timezone.current', { zone: labelFor(info.timezone) })}{' '}
        <Typography component="span" variant="body2" color="text.secondary">({sourceText})</Typography>
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap', mb: 1.5 }}>
        <Autocomplete
          options={zones}
          value={selected}
          onChange={(event, value) => setSelected(value)}
          getOptionLabel={labelFor}
          filterOptions={filterOptions}
          disableClearable
          sx={{ flex: '1 1 280px', maxWidth: 440 }}
          renderInput={(params) => <TextField {...params} label={t('admin:timezone.label')} size="small" />}
        />
        <Button
          variant="contained"
          onClick={() => save(selected)}
          disabled={saving || !selected || selected === info.timezone}
        >
          {t('admin:timezone.save')}
        </Button>
      </Box>

      {browserZone && browserZone !== info.timezone && (
        <Alert
          severity="info"
          sx={{ mb: 1.5 }}
          action={(
            <Button color="inherit" size="small" disabled={saving} onClick={() => setSelected(browserZone)}>
              {t('admin:timezone.useDetected')}
            </Button>
          )}
        >
          {t('admin:timezone.detectedDiffers', { zone: labelFor(browserZone) })}
        </Alert>
      )}

      {info.source === 'setting' && (
        <Button size="small" disabled={saving} onClick={() => save(null)} sx={{ mb: 1.5, px: 0 }}>
          {t(`admin:timezone.${RESET_KEYS[fallbackSource] || 'resetToDefault'}`, { zone: fallbackZone })}
        </Button>
      )}

      {status && <Alert severity={status.type} sx={{ mb: 1.5 }}>{status.text}</Alert>}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {t('admin:timezone.help')}
      </Typography>
    </Box>
  );
};

export default TimezoneSettings;
