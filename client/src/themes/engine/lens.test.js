import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LensFilter, lensDisplacement } from './lens.jsx';

describe('lensDisplacement', () => {
  it('leaves the edge and beyond unshifted', () => {
    expect(lensDisplacement(0, 0)).toEqual([128, 128]);
    expect(lensDisplacement(255, 127.5)).toEqual([128, 128]);
    expect(lensDisplacement(127.5, 0)).toEqual([128, 128]);
  });

  it('samples from nearer the middle: right of center reads leftward, below reads upward', () => {
    const [rightX, rightY] = lensDisplacement(180, 127.5);
    expect(rightX).toBeLessThan(128);
    expect(rightY).toBe(128);
    const [belowX, belowY] = lensDisplacement(127.5, 180);
    expect(belowX).toBe(128);
    expect(belowY).toBeLessThan(128);
    const [leftX] = lensDisplacement(60, 127.5);
    expect(leftX).toBeGreaterThan(128);
  });

  it('pulls hardest near the middle, fading toward the edge', () => {
    const shift = (x) => 128 - lensDisplacement(x, 127.5)[0];
    expect(shift(150)).toBeGreaterThan(shift(200));
    expect(shift(200)).toBeGreaterThan(shift(240));
    expect(shift(240)).toBeGreaterThan(0);
  });
});

describe('LensFilter', () => {
  it('covers the whole picture: the map at its exact size, over a no-shift fill', () => {
    // A canvas, so the map is drawn (the tests otherwise run without a document).
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} }),
        toDataURL: () => 'data:image/png;base64,AAAA',
      }),
    });
    try {
      const html = renderToStaticMarkup(React.createElement(LensFilter, { id: 'hg-lens-1', width: 238.4375, height: 238.4375, strength: 0.85 }));
      // Anything the map missed would read as zero, the strongest pull: on a
      // moving picture, a line at its right and bottom edges.
      expect(html).toMatch(/<feFlood[^>]*flood-color="rgb\(128,128,0\)"[^>]*result="still"/);
      expect(html).toMatch(/<feImage[^>]*width="238.4375"[^>]*height="238.4375"/);
      expect(html.indexOf('<feMergeNode in="still"')).toBeLessThan(html.indexOf('<feMergeNode in="pull"'));
      expect(html).toMatch(/<feDisplacementMap in="SourceGraphic" in2="map"/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
