import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { Check } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GOOGLE_EVENT_COLORS } from '../utils/googleEventColors.js';

// Swatches for a Google event's color (issue #244): the calendar's own color
// first, as "no color of its own", then Google's eleven. `value` is a colorId
// or '' for the calendar's color; `calendarColor` paints that first swatch so
// it shows what the event will actually look like.
const EventColorPicker = ({ value, onChange, calendarColor }) => {
  const { t } = useTranslation('calendar');

  const swatch = (id, hex, label) => {
    const selected = value === id;
    const select = () => onChange(id);
    return (
      <Tooltip key={id || 'default'} title={label}>
        <Box
          role="radio"
          aria-checked={selected}
          aria-label={label}
          tabIndex={0}
          onClick={select}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              select();
            }
          }}
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: hex,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
            // A ring in the surface color, then the text color, so the picked
            // swatch stands out on light and dark themes alike.
            boxShadow: selected ? '0 0 0 2px var(--card-bg), 0 0 0 4px var(--text)' : 'none',
            transition: 'transform 0.15s ease',
            '&:hover': { transform: 'scale(1.1)' },
            '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: 3 },
          }}
        >
          {selected && <Check fontSize="small" aria-hidden="true" />}
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {t('event.color')}
      </Typography>
      <Box
        role="radiogroup"
        aria-label={t('event.color')}
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}
      >
        {swatch('', calendarColor || 'var(--accent)', t('event.colorDefault'))}
        {/* Sets the calendar's own color apart from the eleven. */}
        <Box aria-hidden="true" sx={{ width: '1px', height: 24, backgroundColor: 'var(--card-border)', mx: 0.25 }} />
        {GOOGLE_EVENT_COLORS.map((color) => swatch(color.id, color.hex, t(`event.colors.${color.key}`)))}
      </Box>
    </Box>
  );
};

export default EventColorPicker;
