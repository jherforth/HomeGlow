// Shared by every ambience layer: keyframes, the seeded random source, how a
// theme's ranges are drawn, and the rules every layer obeys. Only transform
// and opacity animate (the compositor's work, not the main thread's), and
// nothing animates for anyone who prefers reduced motion.

import { keyframes } from '@emotion/react';

export const reducedMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } };

/** A small, fast, seeded generator (mulberry32): the same seed, the same scene. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string to a 32-bit seed. */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The seed a theme's scene is drawn from. `load` (the default) is new on
 * every page load; `day` is shared by every display and changes daily;
 * `fixed` never changes, for a designed composition.
 */
export function sceneSeed(variety, themeId, now = new Date(), loadSeed = Math.random()) {
  if (variety === 'fixed') return hashSeed(`fixed:${themeId}`);
  if (variety === 'day') {
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    return hashSeed(`day:${themeId}:${day}`);
  }
  return hashSeed(`load:${themeId}:${loadSeed}`);
}

/** A per-mode option ({ light, dark }) for the mode on screen; anything else as is. */
export function forMode(value, mode) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'light' in value && 'dark' in value ? value[mode] : value;
}

/** A value from a theme option: a number as is, a [min, max] range drawn. */
export function draw(random, value, { integer = false } = {}) {
  if (!Array.isArray(value)) return value;
  const [min, max] = value;
  const n = min + random() * (max - min);
  return integer ? Math.round(n) : n;
}

/** One entry from a list of { weight } objects, by weight (weight 1 if unset). */
export function pickWeighted(random, list) {
  const total = list.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  let r = random() * total;
  for (const entry of list) {
    r -= entry.weight ?? 1;
    if (r <= 0) return entry;
  }
  return list[list.length - 1];
}

/** One entry from a list, or from [{ color, weight }] by weight. */
export function pick(random, list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  if (typeof list[0] !== 'object') return list[Math.floor(random() * list.length)];
  const total = list.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  let r = random() * total;
  for (const entry of list) {
    r -= entry.weight ?? 1;
    if (r <= 0) return entry.color;
  }
  return list[list.length - 1].color;
}

/**
 * `count` positions across [from, to] percent: the span cut into equal slots,
 * one per item, each jittered within its slot. Spread like this, a scene never
 * clumps on one side or leaves a hole, and is still different every time.
 */
export function spread(random, count, [from, to] = [0, 100]) {
  const slot = (to - from) / Math.max(1, count);
  return Array.from({ length: count }, (_, i) => from + slot * (i + 0.15 + random() * 0.7));
}

export const sway = keyframes`
  from { transform: rotate(var(--angle-from)); }
  to { transform: rotate(var(--angle-to)); }
`;

export const bob = keyframes`
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(0, var(--distance), 0); }
`;

export const pulse = keyframes`
  from { transform: scale(var(--scale-from)); }
  to { transform: scale(var(--scale-to)); }
`;

export const rise = keyframes`
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translate3d(var(--drift), -115vh, 0); opacity: 0; }
`;

export const fall = keyframes`
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translate3d(var(--drift), 115vh, 0); opacity: 0; }
`;

export const twinkle = keyframes`
  from { opacity: 0.15; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1); }
`;

export const driftA = keyframes`
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-25%, -12%, 0); }
`;

export const driftB = keyframes`
  from { transform: translate3d(-20%, -8%, 0); }
  to { transform: translate3d(0, 0, 0); }
`;

export const shoot = keyframes`
  0% { opacity: 0; transform: translate(var(--x0), var(--y0)) rotate(var(--heading)) translateX(0); }
  12% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--x0), var(--y0)) rotate(var(--heading)) translateX(var(--travel)); }
`;

export const wander = keyframes`
  0% { transform: translate3d(0, 0, 0) scale(1); }
  33% { transform: translate3d(var(--dx1), var(--dy1), 0) scale(var(--s1)); }
  66% { transform: translate3d(var(--dx2), var(--dy2), 0) scale(var(--s2)); }
  100% { transform: translate3d(0, 0, 0) scale(1); }
`;

export const cross = keyframes`
  from { transform: translate3d(var(--x0), var(--y0), 0) rotate(0deg); }
  to { transform: translate3d(var(--x1), var(--y1), 0) rotate(var(--spin)); }
`;
