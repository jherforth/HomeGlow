import { describe, it, expect } from 'vitest';
import {
  MIN_COLLAGE_PHOTOS,
  LANDSCAPE_TEMPLATES,
  orientationOf,
  transposeTemplate,
  templatesForScreen,
  templateFits,
  countOrientations,
  chooseTemplate,
  fillTemplate,
  pickReplacementIndex,
  shuffled,
} from './photoCollage.js';

const photo = (id, orientation) => ({ id, orientation });
const byId = (id) => LANDSCAPE_TEMPLATES.find((t) => t.id === id);

describe('orientationOf', () => {
  it('classifies by shape, with a band for roughly-square photos', () => {
    expect(orientationOf(4000, 3000)).toBe('landscape');
    expect(orientationOf(3000, 4000)).toBe('portrait');
    expect(orientationOf(1000, 1000)).toBe('square');
    expect(orientationOf(1050, 1000)).toBe('square');
  });

  it('treats an unmeasurable image as square rather than guessing', () => {
    expect(orientationOf(0, 0)).toBe('square');
    expect(orientationOf(undefined, 300)).toBe('square');
  });
});

describe('templates', () => {
  it('cover the whole screen with no overlaps', () => {
    // Sample a grid of points; each must fall in exactly one slot. Integer
    // steps keep the samples off slot edges, where float drift would decide.
    const samples = Array.from({ length: 20 }, (_, i) => (i + 0.5) / 20);
    for (const template of LANDSCAPE_TEMPLATES) {
      for (const gx of samples) {
        for (const gy of samples) {
          const hits = template.slots.filter((s) => gx >= s.x && gx < s.x + s.w && gy >= s.y && gy < s.y + s.h);
          expect(hits.length, `${template.id} at (${gx.toFixed(2)}, ${gy.toFixed(2)})`).toBe(1);
        }
      }
    }
  });

  it('give each slot a shape that suits what it asks for on a 16:9 screen', () => {
    // The whole point of matching: a "portrait" slot that is actually wide
    // would crop the subject out of the photo it was given.
    const screen = 16 / 9;
    for (const template of LANDSCAPE_TEMPLATES) {
      for (const slot of template.slots) {
        const aspect = (slot.w * screen) / slot.h;
        if (slot.want === 'portrait') expect(aspect, template.id).toBeLessThan(1);
        if (slot.want === 'landscape') expect(aspect, template.id).toBeGreaterThan(1);
      }
    }
  });

  it('need at least the minimum number of photos', () => {
    for (const template of LANDSCAPE_TEMPLATES) {
      expect(template.slots.length).toBeGreaterThanOrEqual(MIN_COLLAGE_PHOTOS);
    }
  });

  it('turn on their side for a portrait-mounted screen', () => {
    const trio = transposeTemplate(byId('portrait-trio'));
    // Three columns of portraits become three rows of landscapes.
    expect(trio.slots.every((s) => s.want === 'landscape' && s.w === 1)).toBe(true);
    expect(templatesForScreen(800, 1280)[0].id).toMatch(/-t$/);
    expect(templatesForScreen(1920, 1080)[0].id).not.toMatch(/-t$/);
  });
});

describe('templateFits / chooseTemplate', () => {
  it('only offers templates the photos on hand can fill', () => {
    const allLandscape = { portrait: 0, landscape: 6, square: 0 };
    expect(templateFits(byId('quad'), allLandscape)).toBe(true);
    expect(templateFits(byId('portrait-trio'), allLandscape)).toBe(false);
  });

  it('lets squares stand in for either shape', () => {
    expect(templateFits(byId('two-and-two'), { portrait: 1, landscape: 2, square: 1 })).toBe(true);
    expect(templateFits(byId('two-and-two'), { portrait: 1, landscape: 2, square: 0 })).toBe(false);
  });

  it('avoids repeating the previous template when another fits', () => {
    const counts = { portrait: 5, landscape: 5, square: 0 };
    for (let r = 0; r < 1; r += 0.1) {
      expect(chooseTemplate(LANDSCAPE_TEMPLATES, counts, 'quad', () => r).id).not.toBe('quad');
    }
  });

  it('returns null when nothing fits, so the caller shows a single photo', () => {
    expect(chooseTemplate(LANDSCAPE_TEMPLATES, { portrait: 1, landscape: 1, square: 0 })).toBeNull();
  });

  it('counts orientations', () => {
    expect(countOrientations([photo('a', 'portrait'), photo('b', 'square'), photo('c', 'portrait')]))
      .toEqual({ portrait: 2, landscape: 0, square: 1 });
  });
});

describe('fillTemplate', () => {
  it('puts each photo in a slot of its own shape', () => {
    const queue = [photo('L1', 'landscape'), photo('P1', 'portrait'), photo('L2', 'landscape'),
      photo('L3', 'landscape'), photo('L4', 'landscape'), photo('P2', 'portrait')];
    const { assigned, rest } = fillTemplate(byId('portrait-quad'), queue);
    expect(assigned[0].id).toBe('P1');
    expect(assigned.slice(1).map((p) => p.orientation)).toEqual(['landscape', 'landscape', 'landscape', 'landscape']);
    expect(rest.map((p) => p.id)).toEqual(['P2']);
  });

  it('prefers an exact match over a square, even when the square comes first', () => {
    const { assigned } = fillTemplate(byId('portrait-trio'), [
      photo('S1', 'square'), photo('P1', 'portrait'), photo('P2', 'portrait'), photo('P3', 'portrait'),
    ]);
    expect(assigned.map((p) => p.id)).toEqual(['P1', 'P2', 'P3']);
  });

  it('never leaves a slot empty while photos remain, even of the wrong shape', () => {
    const { assigned } = fillTemplate(byId('portrait-trio'), [
      photo('L1', 'landscape'), photo('L2', 'landscape'), photo('P1', 'portrait'),
    ]);
    expect(assigned.every(Boolean)).toBe(true);
    expect(new Set(assigned.map((p) => p.id)).size).toBe(3);
  });

  it('leaves slots null only when the queue runs out', () => {
    const { assigned } = fillTemplate(byId('quad'), [photo('L1', 'landscape')]);
    expect(assigned.filter(Boolean)).toHaveLength(1);
    expect(assigned.filter((p) => p === null)).toHaveLength(3);
  });
});

describe('pickReplacementIndex', () => {
  const queue = [photo('A', 'landscape'), photo('B', 'portrait'), photo('C', 'square'), photo('D', 'portrait')];

  it('takes the next photo of the right shape that is not already showing', () => {
    expect(pickReplacementIndex('portrait', queue, ['B'])).toBe(3);
  });

  it('falls back to a square', () => {
    expect(pickReplacementIndex('portrait', queue, ['B', 'D'])).toBe(2);
  });

  it('will not crop a photo into the wrong shape unless asked to', () => {
    // Only a landscape is free. A 3:2 landscape in a portrait column keeps
    // about 40% of itself, so by default the slot waits instead.
    expect(pickReplacementIndex('portrait', queue, ['B', 'C', 'D'])).toBe(-1);
    expect(pickReplacementIndex('portrait', queue, ['B', 'C', 'D'], { allowMismatch: true })).toBe(0);
  });

  it('returns -1 when everything is already on screen', () => {
    expect(pickReplacementIndex('landscape', queue, ['A', 'B', 'C', 'D'], { allowMismatch: true })).toBe(-1);
  });
});

describe('shuffled', () => {
  it('keeps every item exactly once and does not touch the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffled(input);
    expect(out.slice().sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
