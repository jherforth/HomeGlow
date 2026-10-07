import React, { useState } from 'react';
import { Box } from '@mui/material';
import { draw, shoot } from '../motion.js';

// An occasional streak (a shooting star) on a new path each time: a start
// near the top, a heading into the screen, a length and a speed, then a pause.
// With `burst`, each pass is a shower: that many streaks on nearly the same
// heading, scattered around the start and a moment apart (a meteor storm).
// Drawn tail first along its heading, so the tail always trails the path.
function nextPass(random, options) {
  const fromLeft = random() < 0.5;
  const heading = fromLeft ? 15 + random() * 55 : 110 + random() * 55;
  const x = (fromLeft ? -5 : 45) + random() * 60;
  const y = -5 + random() * 45;
  const pause = draw(random, options.every ?? [10, 30]);
  const count = draw(random, options.burst ?? 1, { integer: true });
  const shower = count > 1;
  const streaks = Array.from({ length: count }, () => {
    const seconds = draw(random, options.seconds ?? [1, 2.4]);
    const delay = shower ? random() * 4 : 0;
    return {
      x0: `${Math.round(x + (shower ? (random() - 0.5) * 40 : 0))}vw`,
      y0: `${Math.round(y + (shower ? (random() - 0.5) * 30 : 0))}vh`,
      heading: `${Math.round(heading + (shower ? (random() - 0.5) * 8 : 0))}deg`,
      travel: `${Math.round(30 + random() * 35)}vw`,
      length: Math.round(draw(random, options.length ?? [90, 200])),
      seconds: seconds.toFixed(2),
      start: (pause + delay).toFixed(2),
      end: pause + delay + seconds,
    };
  });
  const last = streaks.reduce((latest, s, i) => (s.end > streaks[latest].end ? i : latest), 0);
  return { id: random(), streaks, last };
}

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Streaks({ options, random }) {
  const [pass, setPass] = useState(() => nextPass(random, options));
  const [still] = useState(prefersReducedMotion);
  if (still) return null;
  const color = options.color || '#ffffff';
  return pass.streaks.map((streak, i) => (
    <Box
      key={`${pass.id}-${i}`}
      onAnimationEnd={i === pass.last ? () => setPass(nextPass(random, options)) : undefined}
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: streak.length,
        height: 2,
        marginLeft: `-${streak.length}px`,
        transformOrigin: '100% 50%',
        borderRadius: 2,
        background: `linear-gradient(90deg, transparent, ${color})`,
        boxShadow: `0 0 6px ${color}`,
        opacity: 0,
        '--x0': streak.x0,
        '--y0': streak.y0,
        '--heading': streak.heading,
        '--travel': streak.travel,
        animation: `${shoot} ${streak.seconds}s ease-in ${streak.start}s 1 both`,
        willChange: 'transform, opacity',
      }}
    />
  ));
}

export default { name: 'streaks', Component: Streaks };
