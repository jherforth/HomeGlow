import React from 'react';
import { Typography, Slider } from '@mui/material';

const ScreensaverIntervalSlider = ({ label, value, onChange, min, max, marks, unit = 'second' }) => (
  <>
    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
      {label}: {value} {unit}{value !== 1 ? 's' : ''}
    </Typography>
    <Slider
      value={value}
      onChange={(_, v) => onChange(v)}
      min={min}
      max={max}
      marks={marks}
      sx={{ mb: 4 }}
    />
  </>
);

export default ScreensaverIntervalSlider;
