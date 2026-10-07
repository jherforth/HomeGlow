import React from 'react';
import { Box } from '@mui/material';
import { draw, driftA, driftB, reducedMotion } from '../motion.js';

// Two oversized fields of soft light drifting against each other (caustics).
// Plain alpha, not a blend mode: blending a full-screen layer every frame
// costs a slow GPU most of its frame rate.
function Field({ options, random }) {
  const alpha = options.strength === 'bright' ? 0.35 : 0.22;
  const spacing = draw(random, options.spacing ?? [120, 190]);
  const seconds = draw(random, options.seconds ?? [28, 40]);
  const light = (size) => `radial-gradient(ellipse 60% 40% at 50% 50%, rgba(255, 255, 255, ${alpha}) 0%, rgba(255, 255, 255, 0) 70%) 0 0 / ${size}px ${size * 0.7}px`;
  const sheet = (size, keyframes, s) => ({
    position: 'absolute',
    inset: '-50%',
    background: light(size),
    animation: `${keyframes} ${s.toFixed(1)}s ease-in-out infinite alternate`,
    willChange: 'transform',
    ...reducedMotion,
  });
  return (
    <Box sx={{ position: 'absolute', inset: 0, opacity: 0.55 }}>
      <Box sx={sheet(spacing, driftA, seconds)} />
      <Box sx={sheet(spacing * 0.72, driftB, seconds * 0.76)} />
    </Box>
  );
}

export default { name: 'field', Component: Field };
