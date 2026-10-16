import React from 'react';
import { Box } from '@mui/material';
import { beatX, draw, leanX, reducedMotion } from './motion.js';

// A picture that bends (manifest version 7): kelp swaying in a current, a
// fish's tail beating. The picture is cut into a chain of slices from a fixed
// edge, each nested in the one before it, so each slice moves with
// everything nearer the fixed edge and adds a little of its own: a curve,
// with no main-thread work, since each slice only animates its transform.
// The tip lags the root by `wave` of a cycle, so the bend travels outward.
//
//   sway   each slice leans about its joint (plants, tentacles), sheared
//          rather than turned, so the joints hold across a wide picture;
//          rooted at the bottom, or with `from: top` at the top; `amount` is
//          the tip's total lean in degrees
//   beat   each slice narrows toward its joint and opens again (a fish's tail
//          seen from the side, swinging toward you and away), from the right
//          edge, since pictures face right and the tail is on the left;
//          `amount` is how much narrower the tip gets at either end of the
//          swing, 0 to 0.8
//
// `start` (0 to 0.95) is how far from the fixed edge the bend begins; below
// it the picture is still. `seconds` is one full cycle. Slices nearer the tip
// take more of the bend, as a stem is stiffer at its base.

const DEFAULTS = {
  sway: { from: 'bottom', start: 0, segments: 6, wave: 0.25 },
  beat: { from: 'right', start: 0.5, segments: 6, wave: 0.25 },
};
// A sliver of overlap toward the fixed edge, so no hairline shows at a joint.
const OVERLAP = 0.004;

/**
 * Draw one copy's bend from a theme's `flex` options. Pure: a seeded random
 * source in, the same plan out. Returns null for no flex.
 */
export function planFlex(random, flex) {
  if (!flex) return null;
  const kind = flex.kind === 'beat' ? 'beat' : 'sway';
  const { from, start, segments, wave } = { ...DEFAULTS[kind], ...flex, ...(kind === 'beat' ? { from: 'right' } : {}) };
  const count = Math.max(1, Math.round(draw(random, segments, { integer: true })));
  const amount = draw(random, flex.amount ?? (kind === 'beat' ? 0.3 : 8));
  const seconds = draw(random, flex.seconds ?? (kind === 'beat' ? 3 : 8));
  const phase = random();
  const weights = Array.from({ length: count }, (_, i) => ((i + 1) / count) ** 1.2);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const length = (1 - start) / count;
  // Narrowing compounds down the chain, so each slice takes a share such that
  // the tip ends `amount` narrower; leaning simply adds.
  const share = (w) => (kind === 'beat' ? (1 - Math.min(amount, 0.8)) ** (w / total) : (amount * w) / total);
  // A full cycle is `seconds`. A sway runs one way per half; a beat narrows
  // twice per cycle (at both ends of the swing), so a quarter each way.
  const run = kind === 'beat' ? seconds / 4 : seconds / 2;
  const lag = (wave * seconds) / count;
  const base = -(phase * seconds) - count * lag;
  return {
    kind,
    from,
    still: start,
    run,
    slices: weights.map((w, i) => ({
      u0: start + i * length,
      u1: i === count - 1 ? 1 : start + (i + 1) * length,
      share: share(w),
      delay: base + i * lag,
    })),
  };
}

const pct = (n) => `${(n * 100).toFixed(2)}%`;

// Where a slice [u0, u1] (measured from the fixed edge) sits, as a clip-path
// inset (top right bottom left), and where its joint is, as a transform origin.
function geometry(from, u0, u1) {
  const near = pct(Math.max(0, u0));
  const far = pct(1 - u1);
  switch (from) {
    case 'top': return { clip: `inset(${near} 0 ${far} 0)`, origin: `50% ${near}` };
    case 'right': return { clip: `inset(0 ${near} 0 ${far})`, origin: `${pct(1 - u0)} 50%` };
    default: return { clip: `inset(${far} 0 ${near} 0)`, origin: `50% ${pct(1 - u0)}` };
  }
}

/**
 * A picture drawn with a planned bend. `picture` is the style that paints
 * it (a background, or a tint through a mask); every slice paints the whole
 * picture and clips to its own part, so the slices meet exactly.
 */
export function Flexed({ plan, picture }) {
  const slice = (u0, u1) => (
    <Box sx={{ position: 'absolute', inset: 0, ...picture, clipPath: geometry(plan.from, u0, u1).clip }} />
  );
  const chain = plan.slices.reduceRight((inner, s) => {
    const { origin } = geometry(plan.from, s.u0, s.u1);
    const motion = plan.kind === 'beat'
      ? { keyframes: beatX, vars: { '--squeeze': s.share.toFixed(4) } }
      : { keyframes: leanX, vars: { '--angle-from': `${(-s.share).toFixed(3)}deg`, '--angle-to': `${s.share.toFixed(3)}deg` } };
    return (
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          transformOrigin: origin,
          ...motion.vars,
          animation: `${motion.keyframes} ${plan.run.toFixed(2)}s ease-in-out ${s.delay.toFixed(2)}s infinite alternate`,
          willChange: 'transform',
          ...reducedMotion,
        }}
      >
        {slice(plan.kind === 'sway' ? s.u0 - OVERLAP : s.u0, s.u1)}
        {inner}
      </Box>
    );
  }, null);
  return (
    <>
      {plan.still > 0 ? slice(0, plan.still) : null}
      {chain}
    </>
  );
}
