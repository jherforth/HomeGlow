import React, { useContext, useMemo } from 'react';
import { Box } from '@mui/material';
import { ThemeContext } from '../themes/engine/ThemeContext.js';
import { ornamentBoxes } from '../utils/ornaments.js';

// The active theme's ornaments on one widget frame: still pictures under the
// frame decoration, clipped to the frame, taking no space and no pointer
// events. Classic has none, so it renders nothing.
export default function FrameOrnaments() {
  const { theme, mode } = useContext(ThemeContext);
  const boxes = useMemo(
    () => ornamentBoxes(theme?.ornaments, theme?.ornamentAssets, mode),
    [theme?.ornaments, theme?.ornamentAssets, mode],
  );
  if (boxes.length === 0) return null;
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 998, borderRadius: 'inherit', overflow: 'hidden' }}>
      {boxes.map((sx, i) => <Box key={i} sx={sx} />)}
    </Box>
  );
}
