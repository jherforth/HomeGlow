import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { bob, clumped, draw, forMode, pick, pickWeighted, pulse, reducedMotion, spread, sway } from '../motion.js';

// Copies of pictures spread across the screen, or gathered into `clumps`
// (patches `clumpWidth` percent wide, open ground between). One picture (`src`), or a
// list (`pictures`) each copy picks from, by weight, with its own proportions,
// size and tint, so one layer can scatter several kinds of thing. Each copy
// may be mirrored (`flip`) and moves on its own: sway (anchored at its base,
// like kelp), bob, pulse, or none. Moving copies use two periods that don't
// divide evenly, so the motion never quite repeats; with `current`, a slow
// third motion rolls across them like a passing current. Taller copies are
// drawn behind shorter ones. `lift` raises each copy a drawn percent of the
// screen above `base`, so copies can sit anywhere (planets in a sky), and
// `hue` turns each copy's colors by a drawn amount (a still filter, painted
// once).
function motionFor(kind, amount) {
  if (kind === 'bob') return { keyframes: bob, vars: { '--distance': `${-amount}px` } };
  if (kind === 'pulse') return { keyframes: pulse, vars: { '--scale-from': 1, '--scale-to': 1 + amount / 100 } };
  return { keyframes: sway, vars: { '--angle-from': `${-amount}deg`, '--angle-to': `${amount}deg` } };
}

function Sprites({ options, assets, random, mode }) {
  const kind = options.motion || 'sway';
  const { items, currentSeconds } = useMemo(() => {
    const pictures = options.pictures || [{ src: options.src, aspect: options.aspect, height: options.height, tint: options.tint }];
    const count = draw(random, options.count, { integer: true });
    const positions = options.clumps === undefined
      ? spread(random, count, options.span)
      : clumped(random, count, draw(random, options.clumps, { integer: true }), options.clumpWidth ?? [6, 12], options.span);
    const list = positions.map((x) => {
      const picture = pickWeighted(random, pictures);
      const seconds = draw(random, options.seconds ?? [6, 10]);
      const amount = kind === 'bob' ? draw(random, options.distance ?? [6, 14]) : draw(random, options.angle ?? [2, 5]);
      const tint = forMode(picture.tint ?? options.tint, mode);
      return {
        x,
        url: assets[forMode(picture.src, mode)],
        aspect: picture.aspect ?? options.aspect ?? 0.5,
        height: draw(random, picture.height ?? options.height),
        tint: tint ? pick(random, tint) : null,
        flip: options.flip ? random() < 0.5 : false,
        lift: options.lift === undefined ? 0 : draw(random, options.lift),
        hue: options.hue === undefined ? 0 : draw(random, options.hue),
        first: { seconds, amount, delay: -random() * seconds },
        // A second, uneven period: together they make the motion wander.
        second: { seconds: seconds * (1.37 + random() * 0.34), amount: amount * (0.35 + random() * 0.3), delay: -random() * seconds * 2 },
      };
    }).sort((a, b) => b.height - a.height);
    return { items: list, currentSeconds: 40 + random() * 50 };
  }, [options, random, mode, assets, kind]);

  const layer = (step, child) => {
    if (kind === 'none') return child;
    const { keyframes, vars } = motionFor(kind, step.amount);
    return (
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '50% 100%',
          ...vars,
          animation: `${keyframes} ${step.seconds.toFixed(2)}s ease-in-out ${step.delay.toFixed(2)}s infinite alternate`,
          willChange: 'transform',
          ...reducedMotion,
        }}
      >
        {child}
      </Box>
    );
  };

  return items.filter((item) => item.url).map((item, i) => {
    const width = item.height * item.aspect;
    const picture = item.tint
      ? {
        backgroundColor: item.tint,
        maskImage: `url("${item.url}")`,
        WebkitMaskImage: `url("${item.url}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center bottom',
        WebkitMaskPosition: 'center bottom',
      }
      : { backgroundImage: `url("${item.url}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom' };
    const still = (
      <Box sx={{
        position: 'absolute',
        inset: 0,
        ...picture,
        ...(item.flip ? { transform: 'scaleX(-1)' } : {}),
        ...(item.hue ? { filter: `hue-rotate(${Math.round(item.hue)}deg)` } : {}),
      }}
      />
    );
    const body = layer(item.first, layer(item.second, still));
    // The current: a slow sway whose phase follows position, so it travels.
    const current = options.current && kind !== 'none'
      ? layer({ seconds: currentSeconds, amount: item.first.amount * 0.8, delay: -(item.x / 100) * currentSeconds * 0.5 }, body)
      : body;
    return (
      <Box
        key={i}
        sx={{
          position: 'absolute',
          left: `${item.x}%`,
          bottom: item.lift ? `calc(${options.base || '0px'} + ${item.lift.toFixed(1)}vh)` : options.base || 0,
          height: `${item.height}vh`,
          width: `${width}vh`,
          marginLeft: `${-width / 2}vh`,
          opacity: options.opacity ?? 1,
        }}
      >
        {current}
      </Box>
    );
  });
}

export default { name: 'sprites', Component: Sprites };
