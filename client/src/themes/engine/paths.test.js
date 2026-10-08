import { describe, expect, it } from 'vitest';
import { seededRandom } from './motion.js';
import { pathKeyframes, planOrbitSystem, planPath } from './paths.js';

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

  describe('orbits', () => {
    const aspect = 16 / 9;
    const options = { path: 'orbit', span: [10, 55], eccentricity: [0, 0.35] };
    // Several planets of one layer: one shared system, each its own pass.
    const layer = (seed, extra = {}) => {
      const random = seededRandom(seed);
      const system = planOrbitSystem(random, { ...options, ...extra });
      return { system, passes: Array.from({ length: 6 }, () => planPath(random, { ...options, ...extra }, { width: 10 }, aspect, system)) };
    };
    // Angle about the focus, in vh on both axes, as the planner works.
    const angleAbout = (system, f) => Math.atan2(f.y - system.focusY, f.x * aspect - system.focusX * aspect);

    it('every pass enters and leaves off screen, crossing it within `span`', () => {
      for (let seed = 1; seed <= 30; seed += 1) {
        for (const { frames } of layer(seed).passes) {
          const off = (f) => f.x < 0 || f.x > 100 || f.y < 0 || f.y > 100;
          expect(off(frames[0])).toBe(true);
          expect(off(frames[frames.length - 1])).toBe(true);
          expect(frames.some((f) => f.x > 25 && f.x < 75 && f.y >= 10 - 1e-6 && f.y <= 55 + 1e-6)).toBe(true);
          frames.forEach((f) => { expect(f.angle).toBe(0); expect(f.flip).toBe(1); });
        }
      }
    });

    it('all the planets of a layer go the same way round the one focus', () => {
      const ways = new Set();
      for (let seed = 1; seed <= 30; seed += 1) {
        const { system, passes } = layer(seed);
        ways.add(system.way);
        for (const { frames } of passes) {
          // Unwrapped angle about the focus moves steadily in the layer's direction.
          let previous = angleAbout(system, frames[0]);
          for (const f of frames.slice(1)) {
            let step = angleAbout(system, f) - previous;
            if (step > Math.PI) step -= 2 * Math.PI;
            if (step < -Math.PI) step += 2 * Math.PI;
            expect(Math.sign(step)).toBe(system.way);
            previous += step;
          }
        }
      }
      expect([...ways].sort()).toEqual([-1, 1]); // either, across page loads
      expect(layer(3, { direction: 'clockwise' }).system.way).toBe(1);
      expect(layer(3, { direction: 'counterclockwise' }).system.way).toBe(-1);
    });

    it('each planet is on its own ellipse with the focus at a focus', () => {
      const { system, passes } = layer(7);
      const fit = (frames) => {
        // r(theta) = p / (1 + e cos(theta - omega)) means 1/r is linear in cos(theta) and sin(theta).
        const rows = frames.map((f) => { const X = f.x * aspect - system.focusX * aspect; const Y = f.y - system.focusY; return [1, Math.cos(Math.atan2(Y, X)), Math.sin(Math.atan2(Y, X)), 1 / Math.hypot(X, Y)]; });
        const [a, b, c] = [0, 1, 2].map((k) => rows.reduce((sum, r) => sum + r[k] * r[3], 0));
        return rows.every((r) => Number.isFinite(r[3])) && [a, b, c];
      };
      const shapes = passes.map(({ frames }) => JSON.stringify(fit(frames).map((n) => n.toFixed(3))));
      expect(new Set(shapes).size).toBe(passes.length);
    });

    it('moves quicker nearer the focus (equal areas in equal times)', () => {
      const { system, passes } = layer(11, { eccentricity: [0.6, 0.6] });
      for (const { frames } of passes) {
        const r = (f) => Math.hypot(f.x * aspect - system.focusX * aspect, f.y - system.focusY);
        // Angular speed times r squared is the same all along.
        const swept = frames.slice(1).map((f, i) => {
          let step = angleAbout(system, f) - angleAbout(system, frames[i]);
          if (step > Math.PI) step -= 2 * Math.PI;
          if (step < -Math.PI) step += 2 * Math.PI;
          const rr = (r(f) + r(frames[i])) / 2;
          return (Math.abs(step) * rr * rr) / (f.at - frames[i].at);
        });
        const mean = swept.reduce((a, b) => a + b, 0) / swept.length;
        swept.forEach((v) => expect(Math.abs(v - mean) / mean).toBeLessThan(0.02));
      }
    });
  });
});
