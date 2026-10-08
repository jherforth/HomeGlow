import { describe, expect, it } from 'vitest';
import { seededRandom } from './motion.js';
import { pathKeyframes, planPath } from './paths.js';

const plans = (options, n = 40, width = 10) => Array.from({ length: n }, (_, i) => planPath(seededRandom(i + 1), options, { width }, 16 / 9));
const visible = (frames) => frames.filter((f) => f.x >= 0 && f.x <= 100);

describe('curved crossings', () => {
  it('an arc crosses the whole screen, level, bending no more than `bend` on screen', () => {
    for (const { frames, rightward } of plans({ path: 'arc', bend: [4, 12], span: [20, 60] })) {
      const xs = frames.map((f) => f.x);
      expect(Math.min(...xs)).toBeLessThan(0);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(100);
      // Steadily one way: no doubling back.
      xs.slice(1).forEach((x, i) => expect(rightward ? x >= xs[i] : x <= xs[i]).toBe(true));
      frames.forEach((f) => { expect(f.angle).toBe(0); expect(f.flip).toBe(rightward ? 1 : -1); });
      const ys = visible(frames).map((f) => f.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(12 + 1e-6);
    }
  });

  it('a wanderer faces where it goes, never steeper than `pitch`', () => {
    let tilted = 0;
    for (const { frames } of plans({ path: 'wander', wander: [3, 8], pitch: 12 })) {
      frames.forEach((f) => expect(Math.abs(f.angle)).toBeLessThanOrEqual(12 + 1e-9));
      tilted += frames.filter((f) => Math.abs(f.angle) > 1).length;
    }
    expect(tilted).toBeGreaterThan(0);
  });

  it('with `turn`, a wanderer swims partway in, turns once through zero width, and leaves the way it came', () => {
    const all = plans({ path: 'wander', turn: 1 });
    for (const { frames, rightward, turns } of all) {
      expect(turns).toBe(true);
      const first = frames[0]; const last = frames[frames.length - 1];
      expect(last.x).toBeCloseTo(first.x, 5);
      expect(first.flip).toBe(rightward ? 1 : -1);
      expect(last.flip).toBe(rightward ? -1 : 1);
      expect(frames.some((f) => Math.abs(f.flip) < 0.01)).toBe(true);
      // Mid-turn, it is level.
      frames.filter((f) => Math.abs(f.flip) < 1).forEach((f) => expect(f.angle).toBe(0));
      const inmost = rightward ? Math.max(...frames.map((f) => f.x)) : Math.min(...frames.map((f) => f.x));
      expect(inmost).toBeGreaterThanOrEqual(25 - 1e-6);
      expect(inmost).toBeLessThanOrEqual(75 + 1e-6);
    }
  });

  it('glide varies the speed but still ends at the far side', () => {
    const { frames } = planPath(seededRandom(7), { path: 'arc', glide: 0.6 }, { width: 8 });
    const steps = frames.slice(1).map((f, i) => Math.abs(f.x - frames[i].x));
    expect(Math.max(...steps) / Math.min(...steps)).toBeGreaterThan(1.5);
    expect(frames[0].at).toBe(0);
    expect(frames[frames.length - 1].at).toBe(100);
  });

  it('is the same scene from the same seed, and renders as transform keyframes', () => {
    const a = planPath(seededRandom(3), { path: 'wander', turn: 0.5 }, { width: 6 });
    const b = planPath(seededRandom(3), { path: 'wander', turn: 0.5 }, { width: 6 });
    expect(a).toEqual(b);
    const css = pathKeyframes(a.frames);
    expect(css).toMatch(/^0\.00% \{ transform: translate\(-?[\d.]+vw, -?[\d.]+vh\) rotate\(-?[\d.]+deg\) scaleX\(-?[\d.]+\); \}/);
    expect(css).not.toMatch(/NaN|Infinity/);
  });
});
