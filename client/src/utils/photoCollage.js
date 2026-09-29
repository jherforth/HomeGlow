// Layout rules for the collage screensaver.
//
// A single photo leaves bars wherever its shape differs from the screen's — a
// 4:3 photo on a 16:9 display gives up a quarter of the screen to black. The
// collage fills the screen instead, and it does that by matching photos to
// slots of a similar shape: a portrait squeezed into a wide slot loses its
// subject to the crop, which is worse than the bars it replaced.
//
// No React and no network here, so the matching can be tested directly.

export const MIN_COLLAGE_PHOTOS = 3;

// Height/width past which a photo stops being "roughly square".
const ORIENTATION_TOLERANCE = 1.1;

export function orientationOf(width, height) {
  if (!(width > 0) || !(height > 0)) return 'square';
  if (height / width > ORIENTATION_TOLERANCE) return 'portrait';
  if (width / height > ORIENTATION_TOLERANCE) return 'landscape';
  return 'square';
}

// Slots are fractions of the screen: x, y, w, h. `want` is the orientation the
// slot's shape suits on a 16:9 display. Squares may fill either kind.
//
//   hero-pair            quad                 portrait-trio
//   +--------+---+       +-----+-----+        +---+---+---+
//   |        |   |       |     |     |        |   |   |   |
//   |        +---+       +-----+-----+        |   |   |   |
//   |        |   |       |     |     |        |   |   |   |
//   +--------+---+       +-----+-----+        +---+---+---+
//
//   portrait-quad        two-and-two
//   +--+---+---+         +--+--+-----+
//   |  |   |   |         |  |  |     |
//   |  +---+---+         |  |  +-----+
//   |  |   |   |         |  |  |     |
//   +--+---+---+         +--+--+-----+
export const LANDSCAPE_TEMPLATES = Object.freeze([
  {
    id: 'hero-pair',
    slots: [
      { x: 0, y: 0, w: 0.64, h: 1, want: 'landscape' },
      { x: 0.64, y: 0, w: 0.36, h: 0.5, want: 'landscape' },
      { x: 0.64, y: 0.5, w: 0.36, h: 0.5, want: 'landscape' },
    ],
  },
  {
    id: 'quad',
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5, want: 'landscape' },
      { x: 0.5, y: 0, w: 0.5, h: 0.5, want: 'landscape' },
      { x: 0, y: 0.5, w: 0.5, h: 0.5, want: 'landscape' },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5, want: 'landscape' },
    ],
  },
  {
    id: 'portrait-trio',
    slots: [
      { x: 0, y: 0, w: 1 / 3, h: 1, want: 'portrait' },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1, want: 'portrait' },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1, want: 'portrait' },
    ],
  },
  {
    id: 'portrait-quad',
    slots: [
      { x: 0, y: 0, w: 0.3, h: 1, want: 'portrait' },
      { x: 0.3, y: 0, w: 0.35, h: 0.5, want: 'landscape' },
      { x: 0.65, y: 0, w: 0.35, h: 0.5, want: 'landscape' },
      { x: 0.3, y: 0.5, w: 0.35, h: 0.5, want: 'landscape' },
      { x: 0.65, y: 0.5, w: 0.35, h: 0.5, want: 'landscape' },
    ],
  },
  {
    id: 'two-and-two',
    slots: [
      { x: 0, y: 0, w: 0.3, h: 1, want: 'portrait' },
      { x: 0.3, y: 0, w: 0.3, h: 1, want: 'portrait' },
      { x: 0.6, y: 0, w: 0.4, h: 0.5, want: 'landscape' },
      { x: 0.6, y: 0.5, w: 0.4, h: 0.5, want: 'landscape' },
    ],
  },
]);

const flip = (want) => (want === 'portrait' ? 'landscape' : want === 'landscape' ? 'portrait' : want);

/**
 * The same template for a portrait-mounted screen: swap the axes, and with them
 * what each slot wants — a column on a wide screen is a row on a tall one.
 */
export function transposeTemplate(template) {
  return {
    id: `${template.id}-t`,
    slots: template.slots.map((s) => ({ x: s.y, y: s.x, w: s.h, h: s.w, want: flip(s.want) })),
  };
}

export function templatesForScreen(width, height) {
  return height > width
    ? LANDSCAPE_TEMPLATES.map(transposeTemplate)
    : LANDSCAPE_TEMPLATES.slice();
}

const countWants = (template) => template.slots.reduce((acc, slot) => {
  acc[slot.want] = (acc[slot.want] || 0) + 1;
  return acc;
}, {});

/**
 * Whether the photos on hand can fill a template without cropping a photo into
 * the wrong shape. Squares are shared between both kinds of slot.
 */
export function templateFits(template, counts) {
  const want = countWants(template);
  const p = counts.portrait || 0;
  const l = counts.landscape || 0;
  const s = counts.square || 0;
  const needP = want.portrait || 0;
  const needL = want.landscape || 0;
  const shortP = Math.max(0, needP - p);
  const shortL = Math.max(0, needL - l);
  return shortP + shortL <= s;
}

export function countOrientations(photos) {
  return photos.reduce((acc, photo) => {
    acc[photo.orientation] = (acc[photo.orientation] || 0) + 1;
    return acc;
  }, { portrait: 0, landscape: 0, square: 0 });
}

/**
 * Pick a template the upcoming photos can fill. Avoids repeating the previous
 * one when there is a choice, so the wall does not settle into one pattern.
 * `random` is injectable for tests.
 *
 * Returns null when nothing fits — too few photos, typically — and the caller
 * should show a single photo instead.
 */
export function chooseTemplate(templates, counts, previousId = null, random = Math.random) {
  const fitting = templates.filter((t) => templateFits(t, counts));
  if (!fitting.length) return null;
  const fresh = fitting.filter((t) => t.id !== previousId);
  const pool = fresh.length ? fresh : fitting;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/**
 * Assign photos to a template's slots from the front of `queue`.
 *
 * Exact matches first, then squares, then — only if the queue is otherwise
 * exhausted — anything, so a slot is never left empty while photos remain.
 * Returns the photo per slot (null if the queue ran out) and the unused rest of
 * the queue in its original order.
 */
export function fillTemplate(template, queue) {
  const remaining = queue.slice();
  const take = (predicate) => {
    const index = remaining.findIndex(predicate);
    return index === -1 ? null : remaining.splice(index, 1)[0];
  };

  const assigned = template.slots.map(() => null);
  template.slots.forEach((slot, i) => { assigned[i] = take((p) => p.orientation === slot.want); });
  template.slots.forEach((slot, i) => { if (!assigned[i]) assigned[i] = take((p) => p.orientation === 'square'); });
  template.slots.forEach((slot, i) => { if (!assigned[i]) assigned[i] = take(() => true); });

  return { assigned, rest: remaining };
}

/**
 * The next photo to swap into a slot: the first in `queue` of the slot's shape
 * that is not already on screen, falling back to a square. Returns its index in
 * `queue`, or -1.
 *
 * With `allowMismatch`, falls back further to anything not on screen. Off by
 * default: a landscape cropped into a portrait slot keeps well under half of
 * itself, and repeating a photo of the right shape looks better than that.
 */
export function pickReplacementIndex(want, queue, onScreenIds, { allowMismatch = false } = {}) {
  const visible = new Set(onScreenIds);
  const free = (p) => !visible.has(p.id);
  let index = queue.findIndex((p) => free(p) && p.orientation === want);
  if (index === -1) index = queue.findIndex((p) => free(p) && p.orientation === 'square');
  if (index === -1 && allowMismatch) index = queue.findIndex(free);
  return index;
}

/** Fisher–Yates on a copy. `random` is injectable for tests. */
export function shuffled(items, random = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
