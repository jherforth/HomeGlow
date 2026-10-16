import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Flexed, planFlex } from './flex.jsx';
import { validateAmbience, validateConfetti } from './schemas.js';
import { seededRandom } from './motion.js';
import { validateThemePackage } from '../../utils/themes.js';

const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(v);
const assets = ['assets/kelp.svg', 'assets/fish.webp'];

describe('planFlex', () => {
  it('is null without flex, and the same plan from the same seed', () => {
    expect(planFlex(seededRandom(1), undefined)).toBeNull();
    const flex = { kind: 'sway', amount: [4, 8], seconds: [6, 9] };
    expect(planFlex(seededRandom(5), flex)).toEqual(planFlex(seededRandom(5), flex));
  });

  it('cuts the bending part into slices that meet, from start to the tip', () => {
    const plan = planFlex(seededRandom(2), { kind: 'beat', start: 0.4, segments: 5 });
    expect(plan.from).toBe('right');
    expect(plan.still).toBe(0.4);
    expect(plan.slices).toHaveLength(5);
    expect(plan.slices[0].u0).toBeCloseTo(0.4);
    expect(plan.slices[4].u1).toBe(1);
    plan.slices.slice(1).forEach((s, i) => expect(s.u0).toBeCloseTo(plan.slices[i].u1));
  });

  it('gives a sway its total turn, more of it toward the tip', () => {
    const plan = planFlex(seededRandom(3), { kind: 'sway', amount: 10, segments: 4 });
    const shares = plan.slices.map((s) => s.share);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(10);
    shares.slice(1).forEach((share, i) => expect(share).toBeGreaterThan(shares[i]));
  });

  it('narrows a beat\'s tip by its amount, compounded down the chain', () => {
    const plan = planFlex(seededRandom(4), { kind: 'beat', amount: 0.3, segments: 6 });
    expect(plan.slices.reduce((p, s) => p * s.share, 1)).toBeCloseTo(0.7);
    plan.slices.forEach((s) => expect(s.share).toBeLessThan(1));
  });

  it('makes the tip lag the root, with every delay negative so nothing waits', () => {
    const plan = planFlex(seededRandom(6), { kind: 'sway', seconds: 8, wave: 0.5, segments: 4 });
    const delays = plan.slices.map((s) => s.delay);
    delays.slice(1).forEach((d, i) => expect(d - delays[i]).toBeCloseTo(1));
    expect(Math.max(...delays)).toBeLessThan(0);
  });
});

describe('Flexed', () => {
  it('draws the still part once and one nested slice per segment', () => {
    const plan = planFlex(seededRandom(7), { kind: 'beat', start: 0.5, segments: 3 });
    const html = renderToStaticMarkup(React.createElement(Flexed, { plan, picture: { backgroundImage: 'url("fish.webp")' } }));
    expect(html.match(/<div/g)).toHaveLength(1 + 3 * 2);
  });
});

describe('flex in a theme', () => {
  const kelp = { layer: 'sprites', count: 4, pictures: [{ src: 'assets/kelp.svg', height: 30 }] };
  const bending = (flex) => ({ ...kelp, pictures: [{ ...kelp.pictures[0], flex }] });
  const fish = { layer: 'flyby', pictures: [{ src: 'assets/fish.webp', flex: { kind: 'beat', start: 0.55, amount: 0.3, seconds: 3.3 } }] };

  it('is valid on sprite and flyby pictures, in a cast and on an image, not on a whole sprites layer', () => {
    expect(validateAmbience([bending({ kind: 'sway', amount: [4, 8] }), fish], { assets, isColor })).toEqual([]);
    expect(validateAmbience([bending({ kind: 'sway', from: 'top', start: 0.6 })], { assets, isColor })).toEqual([]);
    expect(validateAmbience([{ layer: 'sprites', src: 'assets/kelp.svg', count: 4, height: 30, flex: { kind: 'sway' } }], { assets, isColor })).toEqual(['ambience[0]: sprites has no option flex']);
    expect(validateAmbience([{ layer: 'image', src: 'assets/kelp.svg', anchor: 'fill', flex: { kind: 'sway', start: 0.5 } }], { assets, isColor })).toEqual([]);
    expect(validateConfetti({ cast: { pictures: fish.pictures } }, { assets, isColor })).toEqual([]);
  });

  it('refuses unknown options, a missing kind, an over-narrow beat, and confetti pieces', () => {
    const flexed = (flex) => validateAmbience([bending(flex)], { assets, isColor });
    expect(flexed({ kind: 'sway', wobble: 1 })).toEqual(['ambience[0].pictures [0].flex has no option wobble']);
    expect(flexed({ amount: 4 })).toEqual(['ambience[0].pictures [0].flex .kind is required']);
    expect(flexed({ kind: 'beat', amount: 0.9 })).toEqual(['ambience[0].pictures [0].flex .amount for a beat must be at most 0.8']);
    expect(flexed({ kind: 'beat', from: 'right' })).toEqual([]);
    expect(flexed({ kind: 'beat', from: 'top' })).toEqual(['ambience[0].pictures [0].flex .from for a beat can only be right']);
    expect(flexed({ kind: 'sway', from: 'right' })).toEqual(['ambience[0].pictures [0].flex .from for a sway can be bottom or top']);
    expect(flexed({ kind: 'sway', from: 'left' })).toHaveLength(1);
    expect(flexed({ kind: 'twist' })).toHaveLength(1);
    expect(validateConfetti({ pictures: fish.pictures }, { assets, isColor })).toEqual(['confetti.pictures do not bend; flex belongs on confetti.cast pictures']);
  });

  it('needs manifest version 7, and a theme without it is untouched', () => {
    const pkg = (version, extra) => ({ manifestVersion: version, id: 'tank', name: 'Tank', ...extra });
    expect(validateThemePackage(pkg(7, { ambience: [fish] }), { assets })).toEqual([]);
    expect(validateThemePackage(pkg(6, { ambience: [fish] }), { assets })).toContain('flex need manifestVersion 7');
    expect(validateThemePackage(pkg(6, { confetti: { cast: { pictures: fish.pictures } } }), { assets })).toContain('flex need manifestVersion 7');
    expect(validateThemePackage(pkg(6, { ambience: [bending({ kind: 'sway' })] }), { assets })).toContain('flex need manifestVersion 7');
    expect(validateThemePackage(pkg(6, { ambience: [{ layer: 'image', src: 'assets/kelp.svg', flex: { kind: 'sway' } }] }), { assets })).toContain('flex need manifestVersion 7');
    expect(validateThemePackage(pkg(6, { ambience: [kelp] }), { assets })).toEqual([]);
  });
});
