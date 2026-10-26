// Layout rules for the Coffee Table screensaver: prints dropped one at a time
// onto a table, piling up until the whole screen is covered and then keeping
// it covered at random.
//
// Where a print lands decides whether the table fills evenly. Pure random
// spots leave corners bare for minutes while the middle piles up, so the
// screen is divided into a grid that remembers when each cell was last
// covered, and each print goes to the stalest of a few random spots. It still
// looks random, and every part of the table is covered again before long.
//
// No React and no DOM here, so the rules can be tested directly.

export const GRID_COLS = 8;
export const GRID_ROWS = 5;
// Prints on the table at once. Enough to cover the screen about twice over
// at the sizes below, so it stays full; the oldest fade away underneath.
export const MAX_PRINTS = 22;
const CANDIDATES = 14;
// A print's longest side, as a share of the screen's shorter side.
const LONG_SIDE = 0.55;
// Tilt either way, in degrees.
const MAX_TILT = 10;

/** A fresh table: no cell covered yet. */
export const emptyCoverage = () => new Array(GRID_COLS * GRID_ROWS).fill(-1);

/** The print's size in pixels for a photo of `aspect` (width / height). */
export function printSize(viewW, viewH, aspect) {
  const longSide = Math.min(viewW, viewH) * LONG_SIDE;
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  return ratio >= 1
    ? { width: longSide, height: longSide / ratio }
    : { width: longSide * ratio, height: longSide };
}

/** Indices of the grid cells whose centres a box centred at (x, y) covers. */
export function cellsUnder(x, y, width, height, viewW, viewH) {
  const cells = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cx = ((col + 0.5) / GRID_COLS) * viewW;
      const cy = ((row + 0.5) / GRID_ROWS) * viewH;
      if (Math.abs(cx - x) <= width / 2 && Math.abs(cy - y) <= height / 2) cells.push(row * GRID_COLS + col);
    }
  }
  return cells;
}

/**
 * Where the next print lands: the centre, out of a few random ones, whose
 * cells were covered longest ago. A print may hang a little off the edge,
 * as one tossed onto a table would.
 */
export function chooseSpot({ viewW, viewH, width, height, coverage, random = Math.random }) {
  const minX = width * 0.3;
  const maxX = viewW - width * 0.3;
  const minY = height * 0.3;
  const maxY = viewH - height * 0.3;
  let best = null;
  for (let i = 0; i < CANDIDATES; i += 1) {
    const x = minX + random() * Math.max(0, maxX - minX);
    const y = minY + random() * Math.max(0, maxY - minY);
    const cells = cellsUnder(x, y, width, height, viewW, viewH);
    // The mean of when each cell was last covered: lower is staler.
    const score = cells.length ? cells.reduce((sum, cell) => sum + coverage[cell], 0) / cells.length : Infinity;
    if (!best || score < best.score) best = { x, y, cells, score };
  }
  return best;
}

/** Marks `cells` as covered by print number `seq`. Returns a new array. */
export function markCovered(coverage, cells, seq) {
  const next = coverage.slice();
  for (const cell of cells) next[cell] = seq;
  return next;
}

/** A tilt for a print, in degrees. */
export const tiltFor = (random = Math.random) => (random() * 2 - 1) * MAX_TILT;

/** The prints to fade out so at most MAX_PRINTS stay: the oldest first. */
export function printsToRetire(prints, max = MAX_PRINTS) {
  const staying = prints.filter((print) => !print.leaving);
  return staying.length > max ? staying.slice(0, staying.length - max).map((print) => print.key) : [];
}
