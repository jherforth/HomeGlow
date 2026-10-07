import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { draw, pick, reducedMotion, wander } from '../motion.js';

// Soft color blobs drifting and swelling: radial gradients, so they are soft
// without a blur filter, moved only by transform.
function Blobs({ options, random }) {
  const blobs = useMemo(() => {
    const count = draw(random, options.count ?? [3, 5], { integer: true });
    return Array.from({ length: count }, () => ({
      left: random() * 90,
      top: random() * 80,
      size: draw(random, options.size ?? [30, 60]),
      color: pick(random, options.colors),
      seconds: draw(random, options.seconds ?? [40, 90]),
      delay: -random() * 60,
      dx1: `${Math.round((random() - 0.5) * 30)}vw`,
      dy1: `${Math.round((random() - 0.5) * 30)}vh`,
      dx2: `${Math.round((random() - 0.5) * 30)}vw`,
      dy2: `${Math.round((random() - 0.5) * 30)}vh`,
      s1: (0.8 + random() * 0.5).toFixed(2),
      s2: (0.8 + random() * 0.5).toFixed(2),
    }));
  }, [options, random]);
  return blobs.map((b, i) => (
    <Box
      key={i}
      sx={{
        position: 'absolute',
        left: `${b.left}%`,
        top: `${b.top}%`,
        width: `${b.size}vmin`,
        height: `${b.size}vmin`,
        marginLeft: `${-b.size / 2}vmin`,
        marginTop: `${-b.size / 2}vmin`,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${b.color} 0%, transparent 70%)`,
        opacity: options.opacity ?? 0.5,
        '--dx1': b.dx1, '--dy1': b.dy1, '--dx2': b.dx2, '--dy2': b.dy2, '--s1': b.s1, '--s2': b.s2,
        animation: `${wander} ${b.seconds.toFixed(1)}s ease-in-out ${b.delay.toFixed(1)}s infinite`,
        willChange: 'transform',
        ...reducedMotion,
      }}
    />
  ));
}

export default { name: 'blobs', Component: Blobs };
