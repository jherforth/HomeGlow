import React from 'react';
import { Box } from '@mui/material';
import { Star, StarBorder, Close, BeachAccess } from '@mui/icons-material';

// One day of a chore's record (see utils/choreDays.js), drawn at `size` px.
// A star for done, a cross for a logged miss, an empty star for a due day with
// nothing logged, a dot for a day off.
export default function ChoreDayMark({ state, size = 14, label }) {
  const common = { fontSize: size, display: 'block' };
  let mark;
  switch (state) {
    case 'done':
      mark = <Star sx={{ ...common, color: 'warning.main' }} />;
      break;
    case 'missed':
      mark = <Close sx={{ ...common, color: 'var(--hg-error)' }} />;
      break;
    case 'today':
      mark = <StarBorder sx={{ ...common, color: 'var(--accent)' }} />;
      break;
    case 'open':
      mark = <StarBorder sx={{ ...common, color: 'text.disabled' }} />;
      break;
    case 'vacation':
      mark = <BeachAccess sx={{ ...common, color: 'text.disabled' }} />;
      break;
    default:
      mark = (
        <Box sx={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled' }} />
        </Box>
      );
  }
  return (
    <Box component="span" role="img" aria-label={label} title={label} sx={{ display: 'inline-flex' }}>
      {mark}
    </Box>
  );
}
