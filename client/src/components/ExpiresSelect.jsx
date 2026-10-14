import React from 'react';
import { FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EXPIRE_OPTIONS } from '../utils/choreExpiry.js';

// How long after its due time (a routine: its end time) a chore expires, as a
// short list for touch screens (issue #279). `value` is '' (never) or minutes.
export function expireOptionLabel(t, minutes) {
  if (minutes === 0) return t('chores:expiry.atDue');
  if (minutes < 60) return t('chores:expiry.minutesAfter', { count: minutes });
  return t('chores:expiry.hoursAfter', { count: minutes / 60 });
}

const ExpiresSelect = ({ id, value, onChange, disabled = false, helperText, sx }) => {
  const { t } = useTranslation();
  return (
    <FormControl size="small" disabled={disabled} sx={{ maxWidth: 280, ...sx }}>
      <InputLabel id={`${id}-label`} shrink>{t('chores:expiry.label')}</InputLabel>
      <Select
        labelId={`${id}-label`}
        label={t('chores:expiry.label')}
        value={disabled ? '' : value}
        notched
        displayEmpty
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      >
        <MenuItem value="">{t('chores:expiry.never')}</MenuItem>
        {EXPIRE_OPTIONS.map((minutes) => (
          <MenuItem key={minutes} value={minutes}>{expireOptionLabel(t, minutes)}</MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};

export default ExpiresSelect;
