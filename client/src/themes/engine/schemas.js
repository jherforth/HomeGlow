// What each ambience layer accepts, as data. Validation reads these without
// loading the engine (which the app loads only when a theme animates);
// engine.test.js keeps them in step with the layers in layers/.
//
// Option types:
//   enum      one of `values`
//   num       a number from min to max
//   range     a number, or [low, high], within min to max; the engine draws
//             a value from the range for each item, so scenes vary
//   bool      true or false
//   color     a color the token validator accepts
//   colors    a list of colors, or of { color, weight } for a weighted pick
//   length    a CSS length in vh, vmin, % or px
//   span      [from, to] percent across the screen
//   asset     a file in the theme's own assets/ folder (svg, png, webp, jpg)
//   picture   an asset, or { light, dark } assets, one per mode
//   choice    a picture, or a list of pictures the engine picks one from
//   tints     colors, or { light, dark } color lists, one per mode
//   pictures  a list of { src (picture), aspect, height, tint (tints), weight };
//             each sprite picks one, weighted, so a layer can mix kinds
//
// Every layer also takes `modes` (light and/or dark) and `chance` (0 to 1,
// default 1): how likely the layer is to be in a scene at all, so some scenes
// have a planet or a galaxy and some don't.

export const MAX_LAYERS = 12;

const range = (min, max, extra = {}) => ({ type: 'range', min, max, ...extra });
const num = (min, max) => ({ type: 'num', min, max });
const seconds = range(1, 120);

export const LAYER_SCHEMAS = {
  image: {
    src: { type: 'choice', required: true },
    anchor: { type: 'enum', values: ['bottom', 'top', 'center', 'fill'] },
    height: { type: 'length' },
    angle: range(-180, 180),
    flip: { type: 'bool' },
    opacity: num(0, 1),
  },
  sprites: {
    src: { type: 'picture' },
    pictures: { type: 'pictures' },
    motion: { type: 'enum', values: ['sway', 'bob', 'pulse', 'none'] },
    count: range(1, 16, { integer: true, required: true }),
    span: { type: 'span' },
    height: range(1, 80),
    flip: { type: 'bool' },
    aspect: num(0.05, 4),
    angle: range(0, 30),
    distance: range(0, 200),
    seconds,
    tint: { type: 'tints' },
    current: { type: 'bool' },
    base: { type: 'length' },
    lift: range(0, 100),
    hue: range(0, 360),
    clumps: range(1, 8, { integer: true }),
    clumpWidth: range(1, 50),
    opacity: num(0, 1),
  },
  particles: {
    src: { type: 'picture' },
    motion: { type: 'enum', values: ['rise', 'fall', 'twinkle'] },
    count: range(1, 40, { integer: true, required: true }),
    size: range(1, 120),
    seconds,
    drift: range(0, 400),
    colors: { type: 'colors' },
    span: { type: 'span' },
    opacity: num(0, 1),
  },
  dots: {
    count: range(1, 400, { integer: true, required: true }),
    colors: { type: 'colors' },
    size: range(0.2, 6),
    opacity: range(0, 1),
  },
  field: {
    strength: { type: 'enum', values: ['soft', 'bright'] },
    spacing: range(40, 400),
    seconds,
  },
  streaks: {
    color: { type: 'color' },
    length: range(20, 400),
    every: range(1, 1800),
    seconds: range(0.5, 10),
    burst: range(1, 40, { integer: true }),
  },
  flyby: {
    pictures: { type: 'pictures', required: true },
    height: range(1, 80),
    every: range(5, 3600),
    seconds: range(2, 300),
    span: { type: 'span' },
    tilt: range(0, 30),
    spin: range(0, 1440),
    opacity: num(0, 1),
    // Curved crossings (manifest version 3); see paths.js.
    path: { type: 'enum', values: ['line', 'arc', 'wander', 'orbit'] },
    bend: range(0, 60),
    wander: range(0, 30),
    facing: { type: 'enum', values: ['path', 'fixed'] },
    pitch: range(0, 45),
    glide: range(0, 0.8),
    turn: num(0, 1),
    count: range(1, 8, { integer: true }),
    begin: { type: 'enum', values: ['waiting', 'underway'] },
    hue: range(0, 360),
    angle: range(0, 90),
    // Orbits (manifest version 5): the shared focus, how oval, which way round.
    focusX: range(-300, 400),
    focusY: range(-300, 400),
    eccentricity: range(0, 0.9),
    direction: { type: 'enum', values: ['either', 'clockwise', 'counterclockwise'] },
  },
  blobs: {
    colors: { type: 'colors', required: true },
    count: range(1, 8, { integer: true }),
    size: range(10, 90),
    seconds: range(10, 120),
    opacity: num(0, 1),
  },
  // Lightning (manifest version 4). Gentle by design: at most half strength
  // and at least four seconds between strikes (see layers/flash.jsx).
  flash: {
    color: { type: 'color' },
    every: range(4, 600),
    strength: num(0.05, 0.5),
    double: { type: 'bool' },
  },
};

export const LAYER_NAMES = Object.keys(LAYER_SCHEMAS);

/** The flyby options manifest version 3 added: curved crossings, several at once. */
export const FLYBY_CURVE_OPTIONS = ['path', 'bend', 'wander', 'facing', 'pitch', 'glide', 'turn', 'count', 'begin', 'hue', 'angle'];

/** The flyby options manifest version 5 added: orbits around a shared focus. */
export const FLYBY_ORBIT_OPTIONS = ['focusX', 'focusY', 'eccentricity', 'direction'];

// A theme's own confetti (chore and prize celebrations): its colors, which of
// the standard shapes, and pictures from its folder mixed in. `pictures`
// heights are in px; `mix` is the share of pieces that are pictures.
export const CONFETTI_SHAPES = ['square', 'circle', 'streamer'];
export const CONFETTI_SCHEMA = {
  colors: { type: 'tints' },
  shapes: { type: 'shapes' },
  pictures: { type: 'pictures' },
  mix: num(0, 1),
};

const ASSET_PATH = /^assets\/[A-Za-z0-9._-]+\.(svg|png|webp|jpg)$/;
const LENGTH = /^\d+(\.\d+)?(vh|vmin|%|px)$/;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isModeMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join() === 'dark,light';

function checkOption(spec, value, { assets, isColor }) {
  switch (spec.type) {
    case 'enum':
      return spec.values.includes(value) || `must be one of ${spec.values.join(', ')}`;
    case 'num':
      return (isNumber(value) && value >= spec.min && value <= spec.max) || `must be a number from ${spec.min} to ${spec.max}`;
    case 'range': {
      const ok = (n) => isNumber(n) && n >= spec.min && n <= spec.max && (!spec.integer || Number.isInteger(n));
      const valid = Array.isArray(value)
        ? value.length === 2 && ok(value[0]) && ok(value[1]) && value[0] <= value[1]
        : ok(value);
      return valid || `must be a ${spec.integer ? 'whole ' : ''}number, or [low, high], from ${spec.min} to ${spec.max}`;
    }
    case 'bool':
      return typeof value === 'boolean' || 'must be true or false';
    case 'color':
      return (typeof value === 'string' && isColor(value)) || 'must be a color';
    case 'colors': {
      const one = (c) => (typeof c === 'string' ? isColor(c) : c && typeof c === 'object' && typeof c.color === 'string'
        && isColor(c.color) && (c.weight === undefined || (isNumber(c.weight) && c.weight > 0)));
      return (Array.isArray(value) && value.length > 0 && value.length <= 32 && value.every(one))
        || 'must list up to 32 colors, or { color, weight }';
    }
    case 'length':
      return (typeof value === 'string' && LENGTH.test(value)) || 'must be a length in vh, vmin, % or px';
    case 'span':
      return (Array.isArray(value) && value.length === 2 && value.every((n) => isNumber(n) && n >= 0 && n <= 100) && value[0] < value[1])
        || 'must be [from, to] percent';
    case 'asset':
      if (typeof value !== 'string' || !ASSET_PATH.test(value)) return "must be an svg, png, webp or jpg in the theme's assets folder";
      return !assets || assets.includes(value) || `${value} is not in the theme folder`;
    case 'picture':
      if (isModeMap(value)) {
        for (const mode of ['light', 'dark']) {
          const result = checkOption({ type: 'asset' }, value[mode], { assets, isColor });
          if (result !== true) return `.${mode} ${result}`;
        }
        return true;
      }
      return checkOption({ type: 'asset' }, value, { assets, isColor });
    case 'tints':
      if (isModeMap(value)) {
        for (const mode of ['light', 'dark']) {
          const result = checkOption({ type: 'colors' }, value[mode], { assets, isColor });
          if (result !== true) return `.${mode} ${result}`;
        }
        return true;
      }
      return checkOption({ type: 'colors' }, value, { assets, isColor });
    case 'choice':
      if (Array.isArray(value)) {
        if (value.length === 0 || value.length > 16) return 'must list 1 to 16 pictures';
        for (let i = 0; i < value.length; i += 1) {
          const result = checkOption({ type: 'picture' }, value[i], { assets, isColor });
          if (result !== true) return `[${i}] ${result}`;
        }
        return true;
      }
      return checkOption({ type: 'picture' }, value, { assets, isColor });
    case 'shapes':
      return (Array.isArray(value) && value.length > 0 && value.every((v) => CONFETTI_SHAPES.includes(v)))
        || `must list some of ${CONFETTI_SHAPES.join(', ')}`;
    case 'pictures': {
      if (!Array.isArray(value) || value.length === 0 || value.length > 16) return 'must list 1 to 16 pictures';
      const parts = { src: { type: 'picture' }, aspect: num(0.05, 4), height: range(1, 80), tint: { type: 'tints' }, weight: num(0.01, 100) };
      for (let i = 0; i < value.length; i += 1) {
        const picture = value[i];
        if (!picture || typeof picture !== 'object' || picture.src === undefined) return `[${i}] needs src`;
        for (const [key, part] of Object.entries(picture)) {
          if (!parts[key]) return `[${i}] has no option ${key}`;
          const result = checkOption(parts[key], part, { assets, isColor });
          if (result !== true) return `[${i}].${key} ${result}`;
        }
      }
      return true;
    }
    default:
      return 'has an unknown type';
  }
}

/** Problems with a theme's `ambience` list, as readable strings. */
export function validateAmbience(ambience, { assets, isColor }) {
  if (!Array.isArray(ambience)) return ['ambience must be a list'];
  if (ambience.length > MAX_LAYERS) return [`ambience may have at most ${MAX_LAYERS} layers`];
  const errors = [];
  ambience.forEach((entry, i) => {
    const where = `ambience[${i}]`;
    const schema = entry && typeof entry === 'object' ? LAYER_SCHEMAS[entry.layer] : null;
    if (!schema) {
      errors.push(`${where}: unknown layer ${JSON.stringify(entry?.layer)} (layers: ${LAYER_NAMES.join(', ')})`);
      return;
    }
    if (entry.modes !== undefined && (!Array.isArray(entry.modes) || !entry.modes.every((m) => m === 'light' || m === 'dark'))) {
      errors.push(`${where}.modes must list light and/or dark`);
    }
    if (entry.chance !== undefined && !(isNumber(entry.chance) && entry.chance >= 0 && entry.chance <= 1)) {
      errors.push(`${where}.chance must be a number from 0 to 1`);
    }
    Object.entries(entry).forEach(([key, value]) => {
      if (key === 'layer' || key === 'modes' || key === 'chance') return;
      const spec = schema[key];
      if (!spec) {
        errors.push(`${where}: ${entry.layer} has no option ${key}`);
        return;
      }
      const result = checkOption(spec, value, { assets, isColor });
      if (result !== true) errors.push(`${where}.${key} ${result}`);
    });
    Object.entries(schema).forEach(([key, spec]) => {
      if (spec.required && entry[key] === undefined) errors.push(`${where}.${key} is required`);
    });
    if (entry.layer === 'particles' && entry.src === undefined && entry.colors === undefined) {
      errors.push(`${where} needs src or colors`);
    }
    if (entry.layer === 'sprites' && (entry.src === undefined) === (entry.pictures === undefined)) {
      errors.push(`${where} needs src or pictures (one, not both)`);
    }
    if (entry.layer === 'sprites' && entry.src !== undefined && entry.height === undefined) {
      errors.push(`${where}.height is required`);
    }
  });
  return errors;
}

/** Problems with a theme's `confetti`, as readable strings. */
export function validateConfetti(confetti, { assets, isColor }) {
  if (!confetti || typeof confetti !== 'object' || Array.isArray(confetti)) return ['confetti must be an object'];
  const errors = [];
  Object.entries(confetti).forEach(([key, value]) => {
    const spec = CONFETTI_SCHEMA[key];
    if (!spec) {
      errors.push(`confetti has no option ${key}`);
      return;
    }
    const result = checkOption(spec, value, { assets, isColor });
    if (result !== true) errors.push(`confetti.${key} ${result}`);
  });
  return errors;
}

// A theme's ornaments: pictures from its folder drawn on every widget frame,
// native or plugin, anchored to a corner, an edge or the center. `corners`
// puts one picture in all four, mirrored to fit, so a bezel is one quarter.
// `stretch` runs an edge picture along the whole edge. They take no space:
// a theme makes room for them with --hg-frame-inset (at most 24px a side).
export const MAX_ORNAMENTS = 8;
export const ORNAMENT_ANCHORS = ['corners', 'top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'center'];
export const ORNAMENT_SCHEMA = {
  src: { type: 'picture', required: true },
  anchor: { type: 'enum', values: ORNAMENT_ANCHORS, required: true },
  size: { type: 'length' },
  aspect: num(0.05, 4),
  stretch: { type: 'bool' },
  tint: { type: 'tints' },
  opacity: num(0, 1),
};

/** Problems with a theme's `ornaments`, as readable strings. */
export function validateOrnaments(ornaments, { assets, isColor }) {
  if (!Array.isArray(ornaments)) return ['ornaments must be a list'];
  if (ornaments.length > MAX_ORNAMENTS) return [`ornaments may have at most ${MAX_ORNAMENTS} entries`];
  const errors = [];
  ornaments.forEach((entry, i) => {
    const where = `ornaments[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${where} must be an object`);
      return;
    }
    Object.entries(entry).forEach(([key, value]) => {
      const spec = ORNAMENT_SCHEMA[key];
      if (!spec) {
        errors.push(`${where} has no option ${key}`);
        return;
      }
      const result = checkOption(spec, value, { assets, isColor });
      if (result !== true) errors.push(`${where}.${key} ${result}`);
    });
    Object.entries(ORNAMENT_SCHEMA).forEach(([key, spec]) => {
      if (spec.required && entry[key] === undefined) errors.push(`${where}.${key} is required`);
    });
    if (entry.stretch && !['top', 'right', 'bottom', 'left'].includes(entry.anchor)) {
      errors.push(`${where}.stretch only applies to an edge (top, right, bottom or left)`);
    }
  });
  return errors;
}
