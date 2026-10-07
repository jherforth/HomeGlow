import React, { useId, useMemo } from 'react';
import { Box } from '@mui/material';
import { draw, pick } from '../motion.js';

// A still field of dots (a starfield), painted once and never animated. Each
// dot draws one brightness and takes its size and opacity from it, so dim
// dots are small and bright ones large, as stars look. Most are dim and few
// bright (the draw is skewed), and the brightest get a faint halo.
const HALO = 0.88;

function Dots({ options, random }) {
  const id = useId().replace(/:/g, '');
  const dots = useMemo(() => {
    const count = draw(random, options.count, { integer: true });
    const [rMin, rMax] = Array.isArray(options.size) ? options.size : [options.size ?? 0.6, options.size ?? 1.5];
    const [oMin, oMax] = Array.isArray(options.opacity) ? options.opacity : [options.opacity ?? 0.35, options.opacity ?? 0.95];
    return Array.from({ length: count }, () => {
      const brightness = random() ** 2.2;
      // A little play, so equal brightness doesn't mean identical dots.
      const jitter = 0.85 + random() * 0.3;
      return {
        x: Math.round(random() * 1000),
        y: Math.round(random() * 600),
        r: Math.min(rMax, (rMin + (rMax - rMin) * brightness) * jitter),
        o: oMin + (oMax - oMin) * brightness,
        halo: brightness > HALO,
        fill: options.colors ? pick(random, options.colors) : '#ffffff',
      };
    });
  }, [options, random]);
  // A halo fades out from the star's own color: one gradient per color used.
  const haloColors = [...new Set(dots.filter((d) => d.halo).map((d) => d.fill))];
  const gradient = (fill) => `${id}-halo-${haloColors.indexOf(fill)}`;
  return (
    <Box component="svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        {haloColors.map((fill) => (
          <radialGradient key={fill} id={gradient(fill)}>
            <stop offset="0" stopColor={fill} stopOpacity="0.45" />
            <stop offset="1" stopColor={fill} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {dots.filter((d) => d.halo).map((d, i) => <circle key={`h${i}`} cx={d.x} cy={d.y} r={d.r * 4} fill={`url(#${gradient(d.fill)})`} />)}
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.fill} opacity={d.o} />)}
    </Box>
  );
}

export default { name: 'dots', Component: Dots };
