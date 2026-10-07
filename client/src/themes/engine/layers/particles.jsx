import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { draw, fall, forMode, pick, reducedMotion, rise, twinkle } from '../motion.js';

// Many small things: a picture from the theme's folder, or plain glowing dots
// in the theme's colors. They rise (bubbles), fall (snow, leaves) or twinkle
// in place (stars).
function Particles({ options, assets, random, mode }) {
  const url = options.src ? assets[forMode(options.src, mode)] : null;
  const motion = options.motion || 'rise';
  const items = useMemo(() => {
    const count = draw(random, options.count, { integer: true });
    const [from, to] = options.span || [0, 100];
    return Array.from({ length: count }, () => {
      const seconds = draw(random, options.seconds ?? (motion === 'twinkle' ? [2, 6] : [16, 32]));
      return {
        left: from + random() * (to - from),
        top: random() * 85,
        size: draw(random, options.size ?? (motion === 'twinkle' ? [2, 4] : [6, 20])),
        seconds,
        delay: -random() * (motion === 'twinkle' ? 6 : seconds),
        drift: (random() - 0.5) * 2 * draw(random, options.drift ?? 40),
        color: options.colors ? pick(random, options.colors) : '#ffffff',
      };
    });
  }, [options, random, motion]);
  if (options.src && !url) return null;

  return items.map((item, i) => {
    const look = url
      ? { backgroundImage: `url("${url}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }
      : { borderRadius: '50%', background: item.color, boxShadow: `0 0 ${item.size * 1.5}px ${item.size / 2}px ${item.color}` };
    const where = motion === 'twinkle'
      ? { top: `${item.top}%` }
      : motion === 'fall' ? { top: -item.size - 10 } : { bottom: -item.size - 10 };
    const keyframes = motion === 'twinkle' ? twinkle : motion === 'fall' ? fall : rise;
    return (
      <Box
        key={i}
        sx={{
          position: 'absolute',
          left: `${item.left}%`,
          ...where,
          width: item.size,
          height: item.size,
          ...look,
          opacity: motion === 'twinkle' ? undefined : options.opacity ?? 1,
          '--drift': `${Math.round(item.drift)}px`,
          animation: `${keyframes} ${item.seconds.toFixed(2)}s ${motion === 'twinkle' ? 'ease-in-out' : 'linear'} ${item.delay.toFixed(2)}s infinite${motion === 'twinkle' ? ' alternate' : ''}`,
          willChange: 'transform, opacity',
          ...reducedMotion,
        }}
      />
    );
  });
}

export default { name: 'particles', Component: Particles };
