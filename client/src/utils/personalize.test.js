import { describe, it, expect } from 'vitest';
import { GRADIENT_PRESETS, normalizeCardOpacity, parseColor, personalizationTokens } from './personalize.js';

describe('personalizationTokens', () => {
  it('sets nothing at the defaults, so the theme shows through', () => {
    expect(personalizationTokens({ background: { kind: 'none' }, cardOpacity: 1 }, '#2a2a2a')).toEqual({});
  });

  it('turns each background kind into page tokens', () => {
    expect(personalizationTokens({ background: { kind: 'color', color: '#123456' } }, '')).toEqual({
      '--background': '#123456', '--hg-page-image': 'none',
    });
    expect(personalizationTokens({ background: { kind: 'gradient', preset: 'dusk' } }, '')['--hg-page-image']).toBe(GRADIENT_PRESETS.dusk);
    const image = personalizationTokens({ background: { kind: 'image', file: `${'a'.repeat(24)}.webp` } }, '');
    expect(image['--hg-page-image']).toMatch(/^url\(".*\/api\/appearance\/backgrounds\/a{24}\.webp"\)$/);
    expect(image['--hg-page-image-size']).toBe('cover');
  });

  it('scales the frame background the theme resolved to', () => {
    expect(personalizationTokens({ cardOpacity: 0.5 }, '#2a2a2a')['--hg-frame-bg']).toBe('rgba(42, 42, 42, 0.5)');
    expect(personalizationTokens({ cardOpacity: 0.5 }, 'rgba(250, 255, 255, 0.72)')['--hg-frame-bg']).toBe('rgba(250, 255, 255, 0.36)');
    expect(personalizationTokens({ cardOpacity: 0.5 }, 'not a color')).toEqual({});
  });
});

describe('helpers', () => {
  it('parses hex and rgb colors', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('var(--x)')).toBeNull();
  });

  it('clamps card opacity to the allowed range', () => {
    expect(normalizeCardOpacity(0.1)).toBe(0.4);
    expect(normalizeCardOpacity(2)).toBe(1);
    expect(normalizeCardOpacity('x')).toBeUndefined();
  });
});
