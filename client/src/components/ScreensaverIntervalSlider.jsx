import React from 'react';
import { Slider } from '@mui/material';
import { AdminRow } from './AdminRows.jsx';

const ScreensaverIntervalSlider = ({ label, value, onChange, min, max, marks, unit = 'second' }) => (
  <AdminRow
    label={`${label}: ${value} ${unit}${value !== 1 ? 's' : ''}`}
    fill
    control={(
      <Slider
        value={value}
        onChange={(_, v) => onChange(v)}
        min={min}
        max={max}
        marks={marks}
        aria-label={label}
        sx={{ width: { xs: 'auto', sm: 260 }, flex: { xs: 1, sm: 'none' }, mx: 1.5, mb: 1.5, '& .MuiSlider-markLabel': { fontSize: '0.75rem' } }}
      />
    )}
  />
);

export default ScreensaverIntervalSlider;
