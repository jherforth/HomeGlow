// What each confetti piece looks like, for the active theme. Classic (a theme
// without `confetti`) gets exactly the pieces it always had: the colors and
// shapes in turn. A theme's `confetti` (engine/schemas.js) sets its colors,
// which shapes, and pictures from its own folder mixed in, tinted or not.

export const DEFAULT_CONFETTI_COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#b5179e'];
export const DEFAULT_CONFETTI_SHAPES = ['square', 'circle', 'streamer'];

const forMode = (value, mode) => (value && typeof value === 'object' && !Array.isArray(value) && 'light' in value && 'dark' in value ? value[mode] : value);

function weighted(random, list, valueOf = (entry) => entry) {
  const total = list.reduce((sum, entry) => sum + ((typeof entry === 'object' && entry.weight) || 1), 0);
  let r = random() * total;
  for (const entry of list) {
    r -= (typeof entry === 'object' && entry.weight) || 1;
    if (r <= 0) return valueOf(entry);
  }
  return valueOf(list[list.length - 1]);
}

const colorOf = (entry) => (typeof entry === 'string' ? entry : entry.color);
const drawn = (random, value, fallback) => {
  const v = value ?? fallback;
  return Array.isArray(v) ? v[0] + random() * (v[1] - v[0]) : v;
};

/**
 * Piece `i` of a burst: { shape, color, size } for a standard piece, or
 * { url, tint, width, height } for a picture.
 */
export function confettiPiece(theme, mode, i, random = Math.random) {
  const confetti = theme?.confetti;
  const size = 7 + random() * 9;
  if (!confetti) {
    return { shape: DEFAULT_CONFETTI_SHAPES[i % DEFAULT_CONFETTI_SHAPES.length], color: DEFAULT_CONFETTI_COLORS[i % DEFAULT_CONFETTI_COLORS.length], size };
  }
  const colors = forMode(confetti.colors, mode) || DEFAULT_CONFETTI_COLORS;
  const pictures = confetti.pictures;
  if (pictures?.length && random() < (confetti.mix ?? 0.5)) {
    const picture = weighted(random, pictures);
    const url = theme.confettiAssets?.[forMode(picture.src, mode)];
    if (url) {
      const height = drawn(random, picture.height, [14, 22]);
      const tint = forMode(picture.tint, mode);
      return { url, tint: tint ? weighted(random, tint, colorOf) : null, width: height * (picture.aspect ?? 1), height };
    }
  }
  const shapes = confetti.shapes || DEFAULT_CONFETTI_SHAPES;
  return { shape: shapes[i % shapes.length], color: weighted(random, colors, colorOf), size };
}

/** The style that draws a piece, at the size it was given. */
export function confettiPieceSx(piece) {
  if (piece.url) {
    const box = { width: piece.width, height: piece.height };
    return piece.tint
      ? {
        ...box,
        backgroundColor: piece.tint,
        maskImage: `url("${piece.url}")`,
        WebkitMaskImage: `url("${piece.url}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }
      : { ...box, backgroundImage: `url("${piece.url}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
  }
  const { shape, size, color } = piece;
  if (shape === 'circle') return { width: size, height: size, borderRadius: '50%', backgroundColor: color };
  if (shape === 'streamer') return { width: Math.max(2, size * 0.3), height: size * 2, borderRadius: 'var(--hg-radius-xs)', backgroundColor: color };
  return { width: size, height: size * 0.6, borderRadius: 'var(--hg-radius-xs)', backgroundColor: color };
}
