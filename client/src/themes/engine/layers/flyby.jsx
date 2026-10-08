import React, { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@emotion/react';
import { cross, draw, forMode, pick, pickWeighted } from '../motion.js';
import { pathKeyframes, planOrbitSystem, planPath } from '../paths.js';

// Now and then, one picture crosses the screen: a ship, a passing whale, a
// drifting astronaut. Each pass picks a picture (weighted), a side to enter
// from, a height within `span`, a slight climb or descent (`tilt`), a speed
// and, with `spin`, a slow tumble; then the screen stays empty for `every`
// seconds. Pictures are drawn facing right and mirrored when they fly left.
//
// With `path` set to `arc` or `wander`, the picture follows a curve instead
// (paths.js): a slice of a long parabola, or a meander that faces where it
// goes and may turn around. `count` keeps several in flight at once, each on
// its own loop, and `begin: underway` puts the first of each partway along
// its path when the page loads, so the scene does not start empty. With
// `path: orbit`, every picture in the layer circles one focus, the same way
// round, each on its own ellipse.
const screenAspect = () => (typeof window !== 'undefined' && window.innerHeight
  ? window.innerWidth / window.innerHeight
  : 16 / 9);

function nextPass(random, options, mode, first = false, system = null) {
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
  const seconds = draw(random, options.seconds ?? [14, 24]);
  const hue = options.hue === undefined ? 0 : draw(random, options.hue);
  // A fixed tilt for the whole crossing, either way: a ringed planet's ring
  // or a gas giant's bands at a slant.
  const angle = options.angle === undefined ? 0 : draw(random, options.angle) * (random() < 0.5 ? -1 : 1);
  const underway = first && options.begin === 'underway';
  const timing = {
    seconds: seconds.toFixed(1),
    // Underway: already some way along, with no wait; otherwise the pause first.
    pause: underway ? (-(0.15 + random() * 0.7) * seconds).toFixed(1) : draw(random, options.every ?? [60, 180]).toFixed(1),
  };
  if (options.path === 'arc' || options.path === 'wander' || options.path === 'orbit') {
    const { frames } = planPath(random, options, { width }, screenAspect(), system);
    return {
      id: random(),
      src: forMode(picture.src, mode),
      tint: tint ? pick(random, tint) : null,
      height,
      width,
      hue,
      angle,
      frames: pathKeyframes(frames),
      ...timing,
    };
  }
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
    hue,
    angle,
    ...timing,
  };
}

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Traveler({ options, assets, random, mode, system }) {
  const [pass, setPass] = useState(() => nextPass(random, options, mode, true, system));
  const travel = useMemo(() => (pass.frames ? keyframes`${pass.frames}` : null), [pass.frames]);
  const url = assets[pass.src];
  if (!url) return null;
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
      onAnimationEnd={() => setPass(nextPass(random, options, mode, false, system))}
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${pass.width}vh`,
        height: `${pass.height}vh`,
        opacity: options.opacity ?? 1,
        ...(travel
          ? { animation: `${travel} ${pass.seconds}s linear ${pass.pause}s 1 both` }
          : {
            '--x0': pass.x0,
            '--x1': pass.x1,
            '--y0': pass.y0,
            '--y1': pass.y1,
            '--spin': pass.spin,
            animation: `${cross} ${pass.seconds}s linear ${pass.pause}s 1 both`,
          }),
        willChange: 'transform',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          ...picture,
          // A path's keyframes carry their own mirroring.
          ...(() => {
            const turns = [pass.angle ? `rotate(${pass.angle.toFixed(1)}deg)` : '', travel || pass.rightward ? '' : 'scaleX(-1)'].filter(Boolean);
            return turns.length ? { transform: turns.join(' ') } : {};
          })(),
          ...(pass.hue ? { filter: `hue-rotate(${Math.round(pass.hue)}deg)` } : {}),
        }}
      />
    </Box>
  );
}

function Flyby({ options, assets, random, mode }) {
  const [still] = useState(prefersReducedMotion);
  const [count] = useState(() => Math.max(1, draw(random, options.count ?? 1, { integer: true })));
  // One focus and one way round for the whole layer, so the planets keep company.
  const [system] = useState(() => (options.path === 'orbit' ? planOrbitSystem(random, options) : null));
  if (still) return null;
  return Array.from({ length: count }, (_, i) => (
    <Traveler key={i} options={options} assets={assets} random={random} mode={mode} system={system} />
  ));
}

export default { name: 'flyby', Component: Flyby };
