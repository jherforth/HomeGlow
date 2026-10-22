import React from 'react';

// A gravitational lens for a flyby picture (manifest version 9): the scene
// behind the picture bends toward its middle, most near the center and not at
// all at its edge, as light bends around a black hole. It is a backdrop-filter
// with an SVG displacement filter that HomeGlow builds itself; a theme only
// says how strong (`lens`, 0 to 1). Browsers that can't filter a backdrop with
// an SVG filter (Safari) show the picture without the bend.
//
// Measured on a Raspberry Pi wall display: one lens up to half the screen's
// height held 62 fps with no slow frames, the same as no lens. So a layer with
// a lens keeps one picture in flight, at most 50vh tall (schemas.js).

const MAP_SIZE = 256;

/**
 * How far the pixel at (x, y) of a size×size map samples from, toward the
 * center, as the map's red (x) and green (y) channels: 128 is no shift. The
 * pull is strongest just outside the middle and fades to nothing at the edge.
 */
export function lensDisplacement(x, y, size = MAP_SIZE) {
  const half = (size - 1) / 2;
  const dx = (x - half) / half;
  const dy = (y - half) / half;
  const r = Math.hypot(dx, dy) || 1e-6;
  const pull = r >= 1 ? 0 : Math.min(1, 0.22 / r) * (1 - r) * 1.6;
  const channel = (d) => Math.round(128 - Math.max(-127, Math.min(127, (d / r) * pull * 127)));
  return [channel(dx), channel(dy)];
}

// The map, drawn once per page; empty where there is no canvas (tests, old
// browsers), and the lens is then left out.
let mapUrl = null;
export function lensMapUrl() {
  if (mapUrl !== null) return mapUrl;
  mapUrl = '';
  if (typeof document === 'undefined') return mapUrl;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const context = canvas.getContext?.('2d');
  if (!context) return mapUrl;
  const image = context.createImageData(MAP_SIZE, MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const [red, green] = lensDisplacement(x, y);
      const i = (y * MAP_SIZE + x) * 4;
      image.data[i] = red;
      image.data[i + 1] = green;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  mapUrl = canvas.toDataURL();
  return mapUrl;
}

/**
 * The SVG filter a lens names in its backdrop-filter, sized to the picture
 * in pixels. At `strength` 1 a pixel samples up to three eighths of the
 * picture's height nearer the middle.
 *
 * Anywhere the map doesn't reach reads as zero, the strongest pull, and shows
 * the scene from well inside the picture. A moving picture is drawn snapped
 * to whole device pixels, so its box can outgrow the map by a pixel at the
 * right and bottom: the map takes the picture's exact size, and a neutral
 * fill (no shift) lies under it.
 */
export function LensFilter({ id, width, height, strength }) {
  const map = lensMapUrl();
  if (!map) return null;
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feFlood floodColor="rgb(128,128,0)" result="still" />
        <feImage href={map} x="0" y="0" width={width} height={height} preserveAspectRatio="none" result="pull" />
        <feMerge result="map">
          <feMergeNode in="still" />
          <feMergeNode in="pull" />
        </feMerge>
        <feDisplacementMap in="SourceGraphic" in2="map" scale={Math.round(Math.min(width, height) * 0.75 * strength)} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
