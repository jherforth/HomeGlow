// Where a theme's ornaments sit on a widget frame (themes/engine/schemas.js,
// ORNAMENT_SCHEMA), as absolutely positioned boxes over the frame's own box.
// Pure, so the placement is tested without a DOM.

const forMode = (value, mode) => (value && typeof value === 'object' && !Array.isArray(value) && 'light' in value && 'dark' in value ? value[mode] : value);
const firstColor = (tints) => {
  if (!Array.isArray(tints) || tints.length === 0) return null;
  const first = tints[0];
  return typeof first === 'string' ? first : first?.color || null;
};

// Each corner, and how a picture drawn for the top-left is mirrored to fit it.
const CORNERS = {
  'top-left': { place: { top: 0, left: 0 }, flip: '' },
  'top-right': { place: { top: 0, right: 0 }, flip: 'scaleX(-1)' },
  'bottom-right': { place: { bottom: 0, right: 0 }, flip: 'scale(-1, -1)' },
  'bottom-left': { place: { bottom: 0, left: 0 }, flip: 'scaleY(-1)' },
};

const EDGES = {
  top: { place: { top: 0, left: '50%' }, shift: 'translateX(-50%)', stretch: { top: 0, left: 0, right: 0 } },
  bottom: { place: { bottom: 0, left: '50%' }, shift: 'translateX(-50%)', stretch: { bottom: 0, left: 0, right: 0 } },
  left: { place: { left: 0, top: '50%' }, shift: 'translateY(-50%)', stretch: { left: 0, top: 0, bottom: 0 } },
  right: { place: { right: 0, top: '50%' }, shift: 'translateY(-50%)', stretch: { right: 0, top: 0, bottom: 0 } },
};

function picture(url, tint, stretched) {
  const size = stretched ? '100% 100%' : 'contain';
  return tint
    ? {
      backgroundColor: tint,
      maskImage: `url("${url}")`,
      WebkitMaskImage: `url("${url}")`,
      maskSize: size,
      WebkitMaskSize: size,
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
    }
    : { backgroundImage: `url("${url}")`, backgroundSize: size, backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
}

/** The boxes to draw for a theme's ornaments, in the mode on screen. */
export function ornamentBoxes(ornaments, assets, mode) {
  if (!Array.isArray(ornaments) || !assets) return [];
  const boxes = [];
  ornaments.forEach((ornament) => {
    const url = assets[forMode(ornament.src, mode)];
    if (!url) return;
    const size = ornament.size || '24px';
    const width = `calc(${size} * ${ornament.aspect ?? 1})`;
    const tint = firstColor(forMode(ornament.tint, mode));
    const base = { position: 'absolute', opacity: ornament.opacity ?? 1, pointerEvents: 'none' };
    const anchors = ornament.anchor === 'corners' ? Object.keys(CORNERS) : [ornament.anchor];
    anchors.forEach((anchor) => {
      if (CORNERS[anchor]) {
        // A `corners` picture is drawn for the top-left and mirrored; a single
        // corner is used as drawn.
        const flip = ornament.anchor === 'corners' ? CORNERS[anchor].flip : '';
        boxes.push({ ...base, ...CORNERS[anchor].place, width, height: size, ...(flip ? { transform: flip } : {}), ...picture(url, tint, false) });
      } else if (EDGES[anchor]) {
        const edge = EDGES[anchor];
        const across = anchor === 'top' || anchor === 'bottom' ? { height: size } : { width: size };
        boxes.push(ornament.stretch
          ? { ...base, ...edge.stretch, ...across, ...picture(url, tint, true) }
          : { ...base, ...edge.place, width, height: size, transform: edge.shift, ...picture(url, tint, false) });
      } else if (anchor === 'center') {
        boxes.push({ ...base, top: '50%', left: '50%', width, height: size, transform: 'translate(-50%, -50%)', ...picture(url, tint, false) });
      }
    });
  });
  return boxes;
}
