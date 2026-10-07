import { describe, it, expect } from 'vitest';
import { ornamentBoxes } from './ornaments.js';
import { validateOrnaments } from '../themes/engine/schemas.js';
import { NEEDS_NEWER_HOMEGLOW, validateThemePackage } from './themes.js';

const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(v);
const assets = { 'assets/ring.svg': '/r.svg', 'assets/bar.svg': '/b.svg', 'assets/day.svg': '/d.svg', 'assets/night.svg': '/n.svg' };
const files = Object.keys(assets);

describe('validateOrnaments', () => {
  it('accepts anchored, stretched, tinted and per-mode pictures', () => {
    expect(validateOrnaments([
      { src: 'assets/ring.svg', anchor: 'corners', size: '28px', tint: ['#7ff5c8'] },
      { src: 'assets/bar.svg', anchor: 'top', stretch: true, size: '6px' },
      { src: { light: 'assets/day.svg', dark: 'assets/night.svg' }, anchor: 'center', size: '40%', opacity: 0.2 },
    ], { assets: files, isColor })).toEqual([]);
  });

  it('refuses unknown anchors and options, missing files, stretch off an edge, and too many', () => {
    const check = (list) => validateOrnaments(list, { assets: files, isColor });
    expect(check([{ src: 'assets/ring.svg', anchor: 'middle' }])).toHaveLength(1);
    expect(check([{ src: 'assets/ring.svg', anchor: 'top', spin: 1 }])).toEqual(['ornaments[0] has no option spin']);
    expect(check([{ src: 'assets/missing.svg', anchor: 'top' }])).toHaveLength(1);
    expect(check([{ anchor: 'top' }])).toEqual(['ornaments[0].src is required']);
    expect(check([{ src: 'assets/ring.svg', anchor: 'corners', stretch: true }])).toHaveLength(1);
    expect(check(Array.from({ length: 9 }, () => ({ src: 'assets/ring.svg', anchor: 'top' })))).toHaveLength(1);
  });

  it('caps the frame inset at 24px a side', () => {
    const pkg = (inset) => ({ manifestVersion: 1, id: 'p', name: 'P', tokens: { all: { '--hg-frame-inset': inset } } });
    expect(validateThemePackage(pkg('10px 0 0 22px'))).toEqual([]);
    expect(validateThemePackage(pkg('24px'))).toEqual([]);
    expect(validateThemePackage(pkg('25px'))).toHaveLength(1);
    expect(validateThemePackage(pkg('2rem'))).toHaveLength(1);
  });
});

describe('ornamentBoxes', () => {
  it('puts a corners picture in all four corners, mirrored to fit', () => {
    const boxes = ornamentBoxes([{ src: 'assets/ring.svg', anchor: 'corners', size: '28px' }], assets, 'dark');
    expect(boxes.map((b) => [b.top ?? null, b.bottom ?? null, b.left ?? null, b.right ?? null, b.transform ?? ''])).toEqual([
      [0, null, 0, null, ''],
      [0, null, null, 0, 'scaleX(-1)'],
      [null, 0, null, 0, 'scale(-1, -1)'],
      [null, 0, 0, null, 'scaleY(-1)'],
    ]);
    expect(boxes[0]).toMatchObject({ width: 'calc(28px * 1)', height: '28px', backgroundImage: 'url("/r.svg")', pointerEvents: 'none' });
  });

  it('stretches an edge picture along the edge, and centers one that is not', () => {
    const [stretched] = ornamentBoxes([{ src: 'assets/bar.svg', anchor: 'left', stretch: true, size: '6px' }], assets, 'dark');
    expect(stretched).toMatchObject({ left: 0, top: 0, bottom: 0, width: '6px', backgroundSize: '100% 100%' });
    const [centered] = ornamentBoxes([{ src: 'assets/bar.svg', anchor: 'bottom', size: '10px', aspect: 3 }], assets, 'dark');
    expect(centered).toMatchObject({ bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 'calc(10px * 3)' });
  });

  it('picks the mode picture and tint, and draws a tint as a mask', () => {
    const [box] = ornamentBoxes([{
      src: { light: 'assets/day.svg', dark: 'assets/night.svg' }, anchor: 'center', tint: { light: ['#000000'], dark: ['#7ff5c8'] },
    }], assets, 'dark');
    expect(box).toMatchObject({ backgroundColor: '#7ff5c8', maskImage: 'url("/n.svg")' });
  });

  it('draws nothing without ornaments or a known file', () => {
    expect(ornamentBoxes(undefined, assets, 'dark')).toEqual([]);
    expect(ornamentBoxes([{ src: 'assets/gone.svg', anchor: 'top' }], assets, 'dark')).toEqual([]);
  });
});

describe('manifest version', () => {
  const base = { id: 'p', name: 'P' };
  it('needs version 2 for ornaments and meter tokens, and refuses versions it does not know', () => {
    const ornaments = [{ src: 'assets/ring.svg', anchor: 'corners' }];
    expect(validateThemePackage({ ...base, manifestVersion: 2, ornaments }, { assets: files })).toEqual([]);
    expect(validateThemePackage({ ...base, manifestVersion: 1, ornaments }, { assets: files })).toEqual(['ornaments need manifestVersion 2']);
    expect(validateThemePackage({ ...base, manifestVersion: 1, tokens: { dark: { '--hg-meter-fill': '#ff9900' } } })).toEqual(['--hg-meter-fill need manifestVersion 2']);
    expect(validateThemePackage({ ...base, manifestVersion: 1, tokens: { all: { '--accent': '#ff9900' } } })).toEqual([]);
    expect(validateThemePackage({ ...base, manifestVersion: 3 })).toEqual([NEEDS_NEWER_HOMEGLOW]);
    const clumpy = { ambience: [{ layer: 'dots', count: 10 }, { layer: 'sprites', src: 'assets/ring.svg', count: 4, height: 10, clumps: 2 }] };
    expect(validateThemePackage({ ...base, manifestVersion: 1, ...clumpy }, { assets: files })).toEqual(['clumps need manifestVersion 2']);
    expect(validateThemePackage({ ...base, manifestVersion: 2, ...clumpy }, { assets: files })).toEqual([]);
  });
});
