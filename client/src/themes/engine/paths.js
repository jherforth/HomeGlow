// Curved crossings for flyby layers: where a picture travels, how fast, and
// which way it faces, as transform keyframes. Pure functions of the seeded
// random source, so a scene can be tested and repeated.
//
// x is in vw (0 is the left edge, 100 the right), y in vh. Paths are sampled
// into keyframes rather than drawn with offset-path: a path() is in pixels,
// so it would not scale with the screen, and auto rotation turns a picture
// moving left upside down. Only transform animates.
//
//   arc     a slice of a long parabola, whose low or high point is usually
//           off screen, so the visible part is a gentle curve (planets)
//   wander  a meander up and down (fish); with `turn`, some swim partway in,
//           turn around and leave the way they came

import { draw } from './motion.js';

const SAMPLES = 48;
// The share of a pass a turn-around takes: the picture narrows to nothing and
// opens mirrored, as a fish turning toward you does.
const TURN_SHARE = 0.05;

const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const sign = (random) => (random() < 0.5 ? -1 : 1);

/** y (vh) along the path at a given x (vw) and progress u (0 to 1). */
function heightFn(random, options, path) {
  const [from, to] = options.span ?? [10, 70];
  const center = from + random() * (to - from);
  if (path === 'arc') {
    // A parabola with its vertex somewhere from well left of the screen to
    // well right of it; `bend` is the most it rises or falls on screen.
    const bend = draw(random, options.bend ?? [4, 14]);
    const vertex = -40 + random() * 180;
    const reach = Math.max(vertex ** 2, (100 - vertex) ** 2) || 1;
    const k = (sign(random) * bend) / reach;
    const middle = (50 - vertex) ** 2;
    return (x) => center + k * ((x - vertex) ** 2 - middle);
  }
  // Two slow waves of different lengths, so the meander does not repeat.
  const amplitude = draw(random, options.wander ?? [2, 6]);
  const f1 = 0.6 + random() * 0.8;
  const f2 = 1.5 + random() * 1.0;
  const p1 = random() * Math.PI * 2;
  const p2 = random() * Math.PI * 2;
  return (x, u) => center + amplitude * (0.65 * Math.sin(2 * Math.PI * f1 * u + p1) + 0.35 * Math.sin(2 * Math.PI * f2 * u + p2));
}

/** Progress along the path (0 to 1) at time t (0 to 1), with `glide` easing the speed up and down. */
function distanceFn(random, options) {
  const glide = clamp(draw(random, options.glide ?? 0), 0, 0.8);
  if (!glide) return (t) => t;
  const f = 1 + random() * 1.5;
  const phase = random() * Math.PI * 2;
  // The integral of 1 + glide * sin(2*pi*f*t + phase), normalized to end at 1.
  const raw = (t) => t - (glide / (2 * Math.PI * f)) * (Math.cos(2 * Math.PI * f * t + phase) - Math.cos(phase));
  const end = raw(1);
  return (t) => raw(t) / end;
}

/**
 * One pass of a curved crossing.
 *
 * picture: { width } in vh. aspect: the screen's width over its height.
 * Returns { frames: [{ at, x, y, angle, flip }], rightward }, `at` in percent
 * of the pass, `flip` 1 facing right and -1 mirrored (it passes through 0
 * during a turn-around).
 */
export function planPath(random, options, picture, aspect = 16 / 9) {
  const path = options.path === 'arc' ? 'arc' : 'wander';
  const facing = options.facing ?? (path === 'arc' ? 'fixed' : 'path');
  const pitch = draw(random, options.pitch ?? 15);
  const rightward = random() < 0.5;
  const off = ((picture.width ?? 5) * 1.2) / aspect; // vh to vw, plus a margin
  const entry = rightward ? -off : 100;
  const exit = rightward ? 100 : -off;
  const turns = path === 'wander' && random() < (options.turn ?? 0);
  const turnX = turns ? 25 + random() * 50 : null;
  const heightAt = heightFn(random, options, path);
  const distance = distanceFn(random, options);

  // Where the picture is at progress s: straight across, or in to the turn and back.
  const xAt = (s) => {
    if (!turns) return entry + (exit - entry) * s;
    const half = (s <= 0.5 ? s : 1 - s) * 2;
    return entry + (turnX - entry) * half;
  };
  const turnStart = 0.5 - TURN_SHARE / 2;
  const turnEnd = 0.5 + TURN_SHARE / 2;
  const facingAt = (s) => {
    const way = rightward ? 1 : -1;
    if (!turns || s < turnStart) return way;
    if (s > turnEnd) return -way;
    return way * Math.cos(((s - turnStart) / TURN_SHARE) * Math.PI); // through 0
  };

  const times = [];
  for (let i = 0; i <= SAMPLES; i += 1) times.push(i / SAMPLES);
  if (turns) times.push(turnStart, 0.5, turnEnd);
  // The turn is placed in progress, not time; map it back through the glide.
  const timeOf = (s) => {
    let low = 0; let high = 1;
    for (let i = 0; i < 30; i += 1) {
      const mid = (low + high) / 2;
      if (distance(mid) < s) low = mid; else high = mid;
    }
    return (low + high) / 2;
  };
  const sampled = [...new Set((turns ? times.map((t, i) => (i > SAMPLES ? timeOf(t) : t)) : times).map((t) => Number(t.toFixed(4))))].sort((a, b) => a - b);

  const frames = sampled.map((t) => {
    const s = distance(t);
    const x = xAt(s);
    const y = heightAt(x, s);
    const flip = facingAt(s);
    let angle = 0;
    if (facing === 'path' && Math.abs(flip) === 1) {
      const ds = 0.002;
      const x2 = xAt(Math.min(1, s + ds)); const y2 = heightAt(x2, Math.min(1, s + ds));
      const x1 = xAt(Math.max(0, s - ds)); const y1 = heightAt(x1, Math.max(0, s - ds));
      // Screen slope in pixels: a vw is `aspect` times a vh.
      const dx = Math.abs(x2 - x1) * aspect;
      const dy = y2 - y1;
      const slope = dx > 1e-6 ? Math.atan2(dy, dx) * (180 / Math.PI) : 0;
      angle = flip * clamp(slope, -pitch, pitch);
    }
    return { at: t * 100, x, y, angle, flip };
  });
  return { frames, rightward, turns };
}

/** The CSS keyframes body for a planned path. */
export function pathKeyframes(frames) {
  return frames.map((f) => `${f.at.toFixed(2)}% { transform: translate(${f.x.toFixed(2)}vw, ${f.y.toFixed(2)}vh) rotate(${f.angle.toFixed(2)}deg) scaleX(${f.flip.toFixed(3)}); }`).join('\n');
}
