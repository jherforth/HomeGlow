import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { draw, fall, forMode, pick, reducedMotion, rise, swingX, twinkle } from '../motion.js';

// Many small things: a picture from the theme's folder, or plain glowing dots
// in the theme's colors. They rise (bubbles), fall (snow, leaves) or twinkle
// in place (stars). A falling or rising item can also swing side to side
// (swing, in px, over swingSeconds) and be softly blurred (blur, in px): the
// swing runs on a wrapper so it never fights the vertical fall/rise transform.
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
        // Drawn after color, and only when the theme sets them: a range
        // default here would consume a draw and reshuffle every existing
        // particle layer's seeded layout, which the per-layer seeds exist
        // to keep stable.
        swing: options.swing === undefined ? 0 : draw(random, options.swing),
        swingSeconds: options.swing === undefined ? 0 : draw(random, options.swingSeconds ?? [3, 6]),
        blur: options.blur === undefined ? 0 : draw(random, options.blur),
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
    const fallAnimation = `${keyframes} ${item.seconds.toFixed(2)}s ${motion === 'twinkle' ? 'ease-in-out' : 'linear'} ${item.delay.toFixed(2)}s infinite${motion === 'twinkle' ? ' alternate' : ''}`;
    const innerSx = {
      width: item.swing > 0 ? '100%' : item.size,
      height: item.swing > 0 ? '100%' : item.size,
      ...look,
      opacity: motion === 'twinkle' ? undefined : options.opacity ?? 1,
      ...(item.blur > 0 ? { filter: `blur(${item.blur.toFixed(1)}px)` } : {}),
      '--drift': `${Math.round(item.drift)}px`,
      animation: fallAnimation,
      willChange: 'transform, opacity',
      ...reducedMotion,
    };
    const inner = <Box sx={innerSx} />;
    if (item.swing <= 0) {
      // No swing wrapper: the item itself carries the inner look, positioned.
      return (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            left: `${item.left}%`,
            ...where,
            ...innerSx,
          }}
        />
      );
    }
    return (
      <Box
        key={i}
        sx={{
          position: 'absolute',
          left: `${item.left}%`,
          ...where,
          width: item.size,
          height: item.size,
          '--swing': `${Math.round(item.swing)}px`,
          animation: `${swingX} ${item.swingSeconds.toFixed(2)}s ease-in-out infinite alternate`,
          willChange: 'transform',
          ...reducedMotion,
        }}
      >
        {inner}
      </Box>
    );
  });
}

export default { name: 'particles', Component: Particles };
