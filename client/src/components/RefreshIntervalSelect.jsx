import React from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { Timer } from '@mui/icons-material';

const RefreshIntervalSelect = ({ labelId, value, onChange, options }) => (
  <FormControl fullWidth size="small">
    <InputLabel id={labelId}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Timer fontSize="small" />
        Auto-Refresh Interval
      </Box>
    </InputLabel>
    <Select
      labelId={labelId}
      value={value || 0}
      onChange={(e) => onChange(e.target.value)}
      label="Auto-Refresh Interval"
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  </FormControl>
);

export default RefreshIntervalSelect;
