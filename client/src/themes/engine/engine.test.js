import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LAYER_NAMES, MAX_LAYERS, validateAmbience } from './schemas.js';
import { draw, hashSeed, pick, sceneSeed, seededRandom, spread } from './motion.js';

const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(v);
const check = (ambience, assets = ['assets/kelp.svg']) => validateAmbience(ambience, { assets, isColor });

describe('layers and their schemas', () => {
  it('every layer file has a schema, and every schema a layer file', () => {
    // Read the folder rather than import the components, so this needs no DOM.
    const files = readdirSync(join(__dirname, 'layers')).filter((f) => f.endsWith('.jsx')).map((f) => f.replace('.jsx', ''));
    expect(files.sort()).toEqual([...LAYER_NAMES].sort());
  });
});

describe('validateAmbience', () => {
  const kelp = { layer: 'sprites', src: 'assets/kelp.svg', count: [6, 9], height: [18, 34], tint: ['#3f8f6b'], current: true };

  it('accepts a well-formed layer', () => {
    expect(check([kelp, { layer: 'dots', count: 200, colors: [{ color: '#ffffff', weight: 3 }, '#ff9b5e'] }])).toEqual([]);
  });

  it('rejects unknown layers and options, bad values, and assets outside the folder', () => {
    expect(check([{ layer: 'fireworks' }])).toHaveLength(1);
    expect(check([{ ...kelp, wobble: true }])).toHaveLength(1);
    expect(check([{ ...kelp, count: 99 }])).toHaveLength(1);
    expect(check([{ ...kelp, count: [9, 6] }])).toHaveLength(1);
    expect(check([{ ...kelp, src: 'assets/missing.svg' }])).toHaveLength(1);
    expect(check([{ ...kelp, src: '../reef/assets/kelp.svg' }])).toHaveLength(1);
    expect(check([{ ...kelp, src: 'https://evil.example/x.svg' }])).toHaveLength(1);
    expect(check([{ ...kelp, tint: ['red; background: url(x)'] }])).toHaveLength(1);
    expect(check([{ layer: 'sprites', src: 'assets/kelp.svg' }])).toEqual(['ambience[0].count is required', 'ambience[0].height is required']);
    expect(check([{ layer: 'sprites', count: 3 }])).toEqual(['ambience[0] needs src or pictures (one, not both)']);
    expect(check([{ layer: 'particles', count: 5 }])).toEqual(['ambience[0] needs src or colors']);
  });

  it('accepts per-mode pictures and tints, and picture lists', () => {
    const assets = ['assets/a-day.svg', 'assets/a-night.svg', 'assets/kelp.svg'];
    expect(check([{
      layer: 'sprites', count: 4, motion: 'none', flip: true,
      pictures: [{ src: { light: 'assets/a-day.svg', dark: 'assets/a-night.svg' }, aspect: 1.5, height: [6, 9], weight: 2 },
        { src: 'assets/kelp.svg', height: 20, tint: { light: ['#3f8f6b'], dark: ['#06384a'] } }],
    }], assets)).toEqual([]);
    expect(check([{ layer: 'sprites', count: 2, pictures: [{ src: { light: 'assets/a-day.svg', dark: 'assets/missing.svg' } }] }], assets)).toHaveLength(1);
    expect(check([{ layer: 'sprites', count: 2, pictures: [{ src: 'assets/kelp.svg', wobble: 1 }] }], assets)).toHaveLength(1);
    expect(check([{ layer: 'image', src: { light: 'assets/a-day.svg' } }], assets)).toHaveLength(1);
  });

  it('accepts chance, flybys, bursts, lifted and hue-turned sprites, and an image picked from a list', () => {
    const assets = ['assets/a.svg', 'assets/b.svg', 'assets/kelp.svg'];
    expect(check([
      { layer: 'image', src: ['assets/a.svg', 'assets/b.svg'], anchor: 'fill', angle: [-60, 60], flip: true, chance: 0.5 },
      { layer: 'flyby', pictures: [{ src: 'assets/a.svg', aspect: 2 }], height: [3, 6], every: [90, 300], seconds: [12, 26], tilt: [0, 10], spin: [0, 360] },
      { layer: 'streaks', burst: [10, 22], every: [150, 420] },
      { layer: 'sprites', count: [1, 3], lift: [20, 70], hue: [0, 360], pictures: [{ src: 'assets/b.svg' }] },
    ], assets)).toEqual([]);
    expect(check([{ layer: 'field', chance: 2 }])).toEqual(['ambience[0].chance must be a number from 0 to 1']);
    expect(check([{ layer: 'flyby' }])).toEqual(['ambience[0].pictures is required']);
    expect(check([{ layer: 'image', src: ['assets/a.svg', 'assets/missing.svg'] }], assets)).toHaveLength(1);
    expect(check([{ layer: 'image', src: [] }], assets)).toHaveLength(1);
    expect(check([{ layer: 'streaks', burst: 2.5 }])).toHaveLength(1);
  });

  it(`allows at most ${MAX_LAYERS} layers`, () => {
    expect(check(Array.from({ length: MAX_LAYERS + 1 }, () => ({ layer: 'field' })))).toHaveLength(1);
  });
});

describe('variety', () => {
  it('a load seed differs per load; day is shared within a day; fixed never changes', () => {
    const day = new Date(2026, 9, 6, 9);
    expect(sceneSeed('load', 'reef', day, 0.1)).not.toBe(sceneSeed('load', 'reef', day, 0.2));
    expect(sceneSeed('day', 'reef', day)).toBe(sceneSeed('day', 'reef', new Date(2026, 9, 6, 22)));
    expect(sceneSeed('day', 'reef', day)).not.toBe(sceneSeed('day', 'reef', new Date(2026, 9, 7, 9)));
    expect(sceneSeed('fixed', 'reef', day)).toBe(sceneSeed('fixed', 'reef', new Date(2030, 0, 1)));
  });

  it('the same seed gives the same scene', () => {
    const a = seededRandom(hashSeed('x'));
    const b = seededRandom(hashSeed('x'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('spreads items across the span without clumping', () => {
    const xs = spread(seededRandom(7), 8, [0, 100]);
    xs.forEach((x, i) => {
      expect(x).toBeGreaterThan(i * 12.5);
      expect(x).toBeLessThan((i + 1) * 12.5);
    });
  });

  it('draws inside a range, and weighted picks follow their weights', () => {
    const random = seededRandom(3);
    for (let i = 0; i < 100; i += 1) {
      const n = draw(random, [6, 9], { integer: true });
      expect(n >= 6 && n <= 9 && Number.isInteger(n)).toBe(true);
    }
    expect(draw(random, 5)).toBe(5);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i += 1) counts[pick(random, [{ color: 'a', weight: 9 }, { color: 'b', weight: 1 }])] += 1;
    expect(counts.a).toBeGreaterThan(counts.b * 5);
  });
});

describe('validateConfetti (through validateAmbience siblings)', () => {
  it('accepts colors, shapes, pictures and mix, and rejects the rest', async () => {
    const { validateConfetti } = await import('./schemas.js');
    const assets = ['assets/fish.svg'];
    expect(validateConfetti({ colors: ['#ff0000'], shapes: ['circle'], pictures: [{ src: 'assets/fish.svg', tint: ['#00ff00'] }], mix: 0.5 }, { assets, isColor })).toEqual([]);
    expect(validateConfetti({ shapes: ['triangle'] }, { assets, isColor })).toHaveLength(1);
    expect(validateConfetti({ mix: 2 }, { assets, isColor })).toHaveLength(1);
    expect(validateConfetti({ sparkle: true }, { assets, isColor })).toEqual(['confetti has no option sparkle']);
    expect(validateConfetti({ pictures: [{ src: 'assets/missing.svg' }] }, { assets, isColor })).toHaveLength(1);
    expect(validateConfetti([], { assets, isColor })).toEqual(['confetti must be an object']);
  });
});

describe('clumped placement', () => {
  it('gathers items into patches with open ground between, inside the span', async () => {
    const { clumped } = await import('./motion.js');
    const random = seededRandom(11);
    const xs = clumped(random, 40, 3, [6, 8], [0, 100]);
    expect(xs.every((x) => x >= 0 && x <= 100)).toBe(true);
    // Three patches at most 8% wide leave most of the span bare.
    const occupied = new Set(xs.map((x) => Math.floor(x / 5)));
    expect(occupied.size).toBeLessThanOrEqual(9);
    // Even spreading of the same count fills nearly every 5% band.
    expect(new Set(spread(seededRandom(11), 40, [0, 100]).map((x) => Math.floor(x / 5))).size).toBe(20);
  });

  it('accepts clumps and clumpWidth on sprites', () => {
    expect(check([{ layer: 'sprites', src: 'assets/kelp.svg', count: [4, 16], height: [30, 80], clumps: [1, 4], clumpWidth: [4, 12] }])).toEqual([]);
    expect(check([{ layer: 'sprites', src: 'assets/kelp.svg', count: 4, height: 30, clumps: 0 }])).toHaveLength(1);
  });
});
