import { describe, it, expect } from 'vitest';
import {
  GRID_COLS,
  GRID_ROWS,
  MAX_PRINTS,
  cellsUnder,
  chooseSpot,
  emptyCoverage,
  markCovered,
  printSize,
  printsToRetire,
  tiltFor,
} from './coffeeTable.js';

// A repeatable stand-in for Math.random.
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe('printSize', () => {
  it('keeps the photo\'s shape, with its longest side a share of the screen', () => {
    const wide = printSize(1920, 1080, 1.5);
    expect(Math.round(wide.width)).toBe(594);
    expect(Math.round(wide.height)).toBe(396);
    const tall = printSize(1920, 1080, 0.75);
    expect(Math.round(tall.height)).toBe(594);
    expect(Math.round(tall.width)).toBe(446);
    expect(printSize(1920, 1080, NaN).width).toBe(printSize(1920, 1080, 1).width);
  });
});

describe('cellsUnder', () => {
  it('names the grid cells whose centres the print covers', () => {
    // The whole screen covers every cell.
    expect(cellsUnder(960, 540, 1920, 1080, 1920, 1080)).toHaveLength(GRID_COLS * GRID_ROWS);
    // A small print in the top-left corner covers the first cell only.
    expect(cellsUnder(120, 108, 60, 60, 1920, 1080)).toEqual([0]);
  });
});

describe('chooseSpot', () => {
  it('prefers the part of the table covered longest ago', () => {
    // Everything was just covered except the right-hand column.
    let coverage = emptyCoverage().map(() => 100);
    for (let row = 0; row < GRID_ROWS; row += 1) coverage[row * GRID_COLS + GRID_COLS - 1] = 0;
    const spot = chooseSpot({ viewW: 1920, viewH: 1080, width: 400, height: 300, coverage, random: seeded(7) });
    expect(spot.x).toBeGreaterThan(1920 / 2);
    coverage = markCovered(coverage, spot.cells, 101);
    expect(spot.cells.every((cell) => coverage[cell] === 101)).toBe(true);
  });

  it('fills the whole table before long, from empty', () => {
    const random = seeded(3);
    let coverage = emptyCoverage();
    for (let seq = 0; seq < 20; seq += 1) {
      const { width, height } = printSize(1920, 1080, 1.5);
      const spot = chooseSpot({ viewW: 1920, viewH: 1080, width, height, coverage, random });
      coverage = markCovered(coverage, spot.cells, seq);
    }
    expect(coverage.every((cell) => cell >= 0)).toBe(true);
  });

  it('keeps a print mostly on screen', () => {
    const random = seeded(11);
    for (let i = 0; i < 50; i += 1) {
      const spot = chooseSpot({ viewW: 1920, viewH: 1080, width: 600, height: 400, coverage: emptyCoverage(), random });
      expect(spot.x).toBeGreaterThanOrEqual(180);
      expect(spot.x).toBeLessThanOrEqual(1920 - 180);
      expect(spot.y).toBeGreaterThanOrEqual(120);
      expect(spot.y).toBeLessThanOrEqual(1080 - 120);
    }
  });
});

describe('tiltFor and printsToRetire', () => {
  it('tilts within ten degrees either way', () => {
    const random = seeded(5);
    for (let i = 0; i < 100; i += 1) expect(Math.abs(tiltFor(random))).toBeLessThanOrEqual(10);
  });

  it('retires the oldest prints past the limit, not ones already leaving', () => {
    const prints = Array.from({ length: MAX_PRINTS + 3 }, (_, key) => ({ key, leaving: key === 0 }));
    expect(printsToRetire(prints)).toEqual([1, 2]);
    expect(printsToRetire(prints.slice(0, 5))).toEqual([]);
  });
});
