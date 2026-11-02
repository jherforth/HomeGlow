import React from 'react';
import { Box } from '@mui/material';
import { API_BASE_URL } from '../utils/apiConfig.js';
import PhotoDetails from './PhotoDetails.jsx';

// One photo held up for a closer look while the screensaver waits: as large
// as the screen allows, alone on black (the slideshow underneath is hidden,
// not dimmed), with its details along the bottom whether or not the
// slideshow shows them. No controls: a tap anywhere puts
// it back, and the screensaver closes it by itself after a while.
export default function PhotoLightbox({ photo }) {
  if (!photo) return null;
  return (
    <Box
      data-testid="photo-lightbox"
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        animation: 'sssFadeIn 0.25s ease-out',
        '@keyframes sssFadeIn': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: 'inline-flex',
          maxWidth: '94%',
          maxHeight: '94%',
          borderRadius: 'var(--hg-radius-md)',
          overflow: 'hidden',
          boxShadow: '0 0 80px 10px var(--hg-black-70)',
        }}
      >
        <Box
          component="img"
          src={`${API_BASE_URL}${photo.url}`}
          alt=""
          sx={{ display: 'block', maxWidth: '94vw', maxHeight: '94vh', objectFit: 'contain' }}
        />
        <PhotoDetails photo={photo} />
      </Box>
    </Box>
  );
}
