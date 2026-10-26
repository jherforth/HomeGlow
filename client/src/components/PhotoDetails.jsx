import React from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { photoDetailLines } from '../utils/photoDetails.js';

// A photo's details in the screensaver: when it was taken, who is in it and
// where, as far as the photo says (utils/photoDetails.js).
//   'overlay'  over the bottom of a collage tile, white on a soft shade
//   'print'    in the white border of a Coffee Table print, like a note on it
// Nothing at all for a photo that carries none.
export default function PhotoDetails({ photo, variant = 'overlay' }) {
  const { t } = useTranslation('common');
  const lines = photoDetailLines(photo, { more: (count) => t('common:photoDetails.morePeople', { count }) });
  if (!lines.length) return null;

  const text = lines.map((line, i) => (
    <Box
      key={i}
      component="span"
      sx={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(i === 0 ? { fontWeight: 600 } : {}),
      }}
    >
      {line}
    </Box>
  ));

  if (variant === 'print') {
    return (
      <Box
        data-testid="photo-details"
        sx={{ color: '#3d3b38', fontSize: 'clamp(10px, 0.8vw, 15px)', lineHeight: 1.3, pt: '0.4em', textAlign: 'left' }}
      >
        {text}
      </Box>
    );
  }

  return (
    <Box
      data-testid="photo-details"
      aria-hidden
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        px: 'clamp(8px, 0.9vw, 16px)',
        pt: '2.5em',
        pb: 'clamp(6px, 0.7vw, 12px)',
        color: '#fff',
        fontSize: 'clamp(11px, 0.85vw, 16px)',
        lineHeight: 1.3,
        textShadow: '0 1px 2px var(--hg-black-90)',
        background: 'linear-gradient(to bottom, transparent 0%, var(--hg-black-50) 100%)',
        pointerEvents: 'none',
      }}
    >
      {text}
    </Box>
  );
}
