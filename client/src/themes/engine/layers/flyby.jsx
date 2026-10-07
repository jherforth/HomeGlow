import React, { useState } from 'react';
import { Box } from '@mui/material';
import { cross, draw, forMode, pick, pickWeighted } from '../motion.js';

// Now and then, one picture crosses the screen: a ship, a passing whale, a
// drifting astronaut. Each pass picks a picture (weighted), a side to enter
// from, a height within `span`, a slight climb or descent (`tilt`), a speed
// and, with `spin`, a slow tumble; then the screen stays empty for `every`
// seconds. Pictures are drawn facing right and mirrored when they fly left.
function nextPass(random, options, mode) {
  const picture = pickWeighted(random, options.pictures);
  const height = draw(random, picture.height ?? options.height ?? [5, 9]);
  const width = height * (picture.aspect ?? 1);
  const rightward = random() < 0.5;
  const [from, to] = options.span ?? [10, 70];
  const y0 = from + random() * (to - from);
  const tilt = draw(random, options.tilt ?? [0, 8]) * (random() < 0.5 ? -1 : 1);
  const climb = Math.tan((tilt * Math.PI) / 180);
  const spin = draw(random, options.spin ?? 0) * (random() < 0.5 ? -1 : 1);
  const tint = forMode(picture.tint, mode);
  const off = `${-width * 1.2}vh`;
  return {
    id: random(),
    src: forMode(picture.src, mode),
    tint: tint ? pick(random, tint) : null,
    height,
    width,
    rightward,
    x0: rightward ? off : '100vw',
    x1: rightward ? '100vw' : off,
    y0: `${y0.toFixed(1)}vh`,
    y1: `calc(${y0.toFixed(1)}vh + ${(climb * 100).toFixed(1)}vw)`,
    spin: `${Math.round(spin)}deg`,
    seconds: draw(random, options.seconds ?? [14, 24]).toFixed(1),
    pause: draw(random, options.every ?? [60, 180]).toFixed(1),
  };
}

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Flyby({ options, assets, random, mode }) {
  const [pass, setPass] = useState(() => nextPass(random, options, mode));
  const [still] = useState(prefersReducedMotion);
  const url = assets[pass.src];
  if (still || !url) return null;
  const picture = pass.tint
    ? {
      backgroundColor: pass.tint,
      maskImage: `url("${url}")`,
      WebkitMaskImage: `url("${url}")`,
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
    }
    : { backgroundImage: `url("${url}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' };
  return (
    <Box
      key={pass.id}
      onAnimationEnd={() => setPass(nextPass(random, options, mode))}
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${pass.width}vh`,
        height: `${pass.height}vh`,
        opacity: options.opacity ?? 1,
        '--x0': pass.x0,
        '--x1': pass.x1,
        '--y0': pass.y0,
        '--y1': pass.y1,
        '--spin': pass.spin,
        animation: `${cross} ${pass.seconds}s linear ${pass.pause}s 1 both`,
        willChange: 'transform',
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, ...picture, ...(pass.rightward ? {} : { transform: 'scaleX(-1)' }) }} />
    </Box>
  );
}

export default { name: 'flyby', Component: Flyby };
