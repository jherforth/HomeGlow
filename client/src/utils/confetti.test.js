import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFETTI_COLORS, DEFAULT_CONFETTI_SHAPES, confettiPiece, confettiPieceSx } from './confetti.js';
import { BUILT_IN_THEMES, resolveTheme } from './themes.js';

// Stand-ins for installed themes with confetti of their own.
const starlight = {
  manifestVersion: 1, id: 'starlight', name: 'Starlight', extends: 'classic',
  confetti: {
    colors: [{ color: '#ff9900', weight: 3 }, { color: '#99ccff', weight: 1 }],
    shapes: ['streamer', 'square'],
    pictures: [{ src: 'assets/sparkle.svg', tint: ['#ffffff'], weight: 3 }, { src: 'assets/ship.svg', aspect: 2 }],
    mix: 0.55,
  },
};
const lagoon = {
  manifestVersion: 1, id: 'lagoon', name: 'Lagoon', extends: 'classic',
  confetti: {
    colors: { light: ['#ff7f6e', '#ffe066'], dark: ['#4fe3d6', '#b48cff'] },
    pictures: [{ src: 'assets/fish.svg', tint: { light: ['#ff7f2a'], dark: ['#7cf5c6'] } }],
  },
};
const assets = {
  starlight: { 'assets/sparkle.svg': '/s.svg', 'assets/ship.svg': '/ship.svg' },
  lagoon: { 'assets/fish.svg': '/fish.svg' },
};
const themed = (id) => resolveTheme(id, [...BUILT_IN_THEMES, starlight, lagoon], assets);
import { seededRandom } from '../themes/engine/motion.js';

describe('confetti', () => {
  it("Classic's pieces are the colors and shapes in turn, as before", () => {
    const classic = resolveTheme('classic');
    for (let i = 0; i < 20; i += 1) {
      const piece = confettiPiece(classic, 'light', i);
      expect(piece.color).toBe(DEFAULT_CONFETTI_COLORS[i % DEFAULT_CONFETTI_COLORS.length]);
      expect(piece.shape).toBe(DEFAULT_CONFETTI_SHAPES[i % DEFAULT_CONFETTI_SHAPES.length]);
    }
  });

  it("a theme's confetti uses its colors, shapes and pictures", () => {
    const starship = themed('starlight');
    const random = seededRandom(5);
    const pieces = Array.from({ length: 400 }, (_, i) => confettiPiece(starship, 'dark', i, random));
    const shapes = pieces.filter((p) => !p.url);
    const pictures = pieces.filter((p) => p.url);
    const palette = starship.confetti.colors.map((c) => c.color);
    expect(shapes.every((p) => palette.includes(p.color) && ['streamer', 'square'].includes(p.shape))).toBe(true);
    expect(pictures.length / pieces.length).toBeGreaterThan(0.45);
    expect(pictures.length / pieces.length).toBeLessThan(0.65);
    expect(pictures.some((p) => p.tint)).toBe(true);
    expect(pictures.some((p) => !p.tint)).toBe(true);
  });

  it("picks the mode's colors and tints", () => {
    const reef = themed('lagoon');
    const random = seededRandom(9);
    const dark = Array.from({ length: 300 }, (_, i) => confettiPiece(reef, 'dark', i, random));
    const allowed = new Set([...reef.confetti.colors.dark, ...reef.confetti.pictures.flatMap((p) => p.tint?.dark || [])]);
    dark.forEach((p) => {
      const color = p.url ? p.tint : p.color;
      if (color) expect(allowed.has(color)).toBe(true);
    });
  });

  it('draws a tinted picture as a mask and a plain one as an image', () => {
    expect(confettiPieceSx({ url: 'x.svg', tint: '#fff', width: 20, height: 10 }).maskImage).toBe('url("x.svg")');
    expect(confettiPieceSx({ url: 'x.svg', tint: null, width: 20, height: 10 }).backgroundImage).toBe('url("x.svg")');
    expect(confettiPieceSx({ shape: 'circle', size: 8, color: '#f00' }).borderRadius).toBe('50%');
  });
});
