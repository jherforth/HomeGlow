import { describe, it, expect } from 'vitest';
import { validateThemePackage } from './themes.js';

// A theme's `confetti.cast` (manifest version 6): its own pictures crossing
// once with the confetti.
const assets = ['assets/ship.svg', 'assets/fish.svg'];
const theme = (confetti, extra = {}) => ({ manifestVersion: 6, id: 'starlight', name: 'Starlight', confetti, ...extra });
const cast = { pictures: [{ src: 'assets/ship.svg', aspect: 2 }], count: [3, 5], path: 'arc', seconds: [5, 8] };

describe('confetti cast', () => {
  it('is valid on a version 6 theme', () => {
    expect(validateThemePackage(theme({ cast }), { assets })).toEqual([]);
  });

  it('needs manifest version 6, also inside a weather scene', () => {
    expect(validateThemePackage(theme({ cast }, { manifestVersion: 5 }), { assets })).toContain('confetti cast need manifestVersion 6');
    const weather = { scenes: { rainy: { confetti: { cast } } } };
    expect(validateThemePackage(theme(undefined, { manifestVersion: 5, weather }), { assets })).toContain('confetti cast need manifestVersion 6');
  });

  it('a version 5 theme without a cast is untouched', () => {
    expect(validateThemePackage(theme({ mix: 0.5 }, { manifestVersion: 5 }), { assets })).toEqual([]);
  });

  it('takes a flyby\'s options, but not waiting or orbits', () => {
    expect(validateThemePackage(theme({ cast: { ...cast, every: [5, 10] } }), { assets })).toEqual(['confetti.cast has no option every']);
    expect(validateThemePackage(theme({ cast: { ...cast, path: 'orbit' } }), { assets })[0]).toMatch(/^confetti\.cast \.path must be one of line, arc, wander/);
    expect(validateThemePackage(theme({ cast: { ...cast, seconds: 60 } }), { assets })[0]).toMatch(/^confetti\.cast \.seconds/);
  });

  it('needs pictures, from the theme folder', () => {
    expect(validateThemePackage(theme({ cast: { count: 3 } }), { assets })).toEqual(['confetti.cast needs pictures']);
    expect(validateThemePackage(theme({ cast: { pictures: [{ src: 'assets/whale.svg' }] } }), { assets })[0]).toMatch(/not in the theme folder/);
  });
});
