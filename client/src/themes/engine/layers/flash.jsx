import React, { useState } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@emotion/react';
import { draw } from '../motion.js';

// Now and then, lightning: a glow from a point along the top of the sky that
// brightens and fades, with an optional second flicker. For a weather theme's
// storm scenes (#247).
//
// Kept gentle for anyone sensitive to flashing light: opacity only, at most
// half strength (the schema caps `strength` at 0.5), a soft glow rather than
// a full-screen field, no more than two flickers in under a second, and at
// least four seconds between strikes. Nothing flashes for anyone who prefers
// reduced motion.
const flicker = keyframes`
  0% { opacity: 0; }
  10% { opacity: var(--peak); }
  24% { opacity: 0; }
  36% { opacity: var(--second); }
  56% { opacity: 0; }
  100% { opacity: 0; }
`;

const STRIKE_SECONDS = 0.8;

function nextStrike(random, options) {
  return {
    id: random(),
    pause: draw(random, options.every ?? [8, 30]),
    x: Math.round(10 + random() * 80),
    // The second flicker, when there is one, is a little weaker.
    second: (options.double ?? true) && random() < 0.6 ? 0.6 + random() * 0.3 : 0,
  };
}

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Flash({ options, random }) {
  const [strike, setStrike] = useState(() => nextStrike(random, options));
  const [still] = useState(prefersReducedMotion);
  if (still) return null;
  const peak = options.strength ?? 0.3;
  const color = options.color || '#e8eeff';
  return (
    <Box
      key={strike.id}
      onAnimationEnd={() => setStrike(nextStrike(random, options))}
      sx={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 70% 60% at ${strike.x}% 0%, ${color} 0%, transparent 75%)`,
        opacity: 0,
        '--peak': peak,
        '--second': (peak * strike.second).toFixed(3),
        animation: `${flicker} ${STRIKE_SECONDS}s linear ${strike.pause.toFixed(2)}s 1 both`,
        willChange: 'opacity',
      }}
    />
  );
}

export default { name: 'flash', Component: Flash };
