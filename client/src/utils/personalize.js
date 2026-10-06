// Personalization: an accent, a background and card opacity, set for the
// household, a display or a tab, over whatever theme is showing. Unlike a
// theme's tokens these are the app's own values, so a background image can be
// a url() to the household's own uploads (see server/services/appearanceAssets).

import { API_BASE_URL } from './apiConfig.js';
import { hexToRgbTriplet } from './interfaceSettings.js';

export const OPACITY_MIN = 0.4;
export const OPACITY_MAX = 1;

/** Gradient backgrounds to pick from, by id. */
export const GRADIENT_PRESETS = {
  dawn: 'linear-gradient(160deg, #ffd6a5 0%, #fdacac 45%, #b9a7e8 100%)',
  ocean: 'linear-gradient(180deg, #a8e6f7 0%, #3a9cc8 55%, #0b4f7c 100%)',
  forest: 'linear-gradient(160deg, #cfe8c4 0%, #6fa77a 50%, #24543c 100%)',
  dusk: 'linear-gradient(170deg, #3b2c5e 0%, #7a3e6f 50%, #e07a5f 100%)',
  slate: 'linear-gradient(180deg, #5b6574 0%, #2f3640 60%, #1b1f26 100%)',
  midnight: 'linear-gradient(180deg, #141e30 0%, #243b55 100%)',
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const BACKGROUND_FILE = /^[0-9a-f]{24}\.(jpg|png|webp)$/;

export const normalizeAccent = (value) => (value === 'theme' || HEX.test(value) ? value : undefined);

export function normalizeBackground(value) {
  if (!value || typeof value !== 'object') return undefined;
  if (value.kind === 'none') return { kind: 'none' };
  if (value.kind === 'color' && HEX.test(value.color)) return { kind: 'color', color: value.color };
  if (value.kind === 'gradient' && Object.prototype.hasOwnProperty.call(GRADIENT_PRESETS, value.preset)) {
    return { kind: 'gradient', preset: value.preset };
  }
  if (value.kind === 'image' && BACKGROUND_FILE.test(value.file)) return { kind: 'image', file: value.file };
  return undefined;
}

export function normalizeCardOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, n)) * 100) / 100;
}

export const backgroundImageUrl = (file) => `${API_BASE_URL}/api/appearance/backgrounds/${file}`;

// "#rrggbb", "rgb(...)" or "rgba(...)" as [r, g, b, a], or null.
export function parseColor(value) {
  const text = String(value || '').trim();
  if (HEX.test(text) || /^#[0-9a-f]{8}$/i.test(text)) {
    const h = text.length === 4 ? text.replace(/[0-9a-f]/gi, (c) => c + c).slice(1) : text.slice(1);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
  }
  const m = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

/**
 * The custom properties a personalization sets, given the frame background
 * the theme resolved to (needed to scale its opacity). Fields at their
 * defaults set nothing, so the theme shows through untouched.
 */
export function personalizationTokens({ accent, background, cardOpacity }, frameBg) {
  const tokens = {};
  if (accent && accent !== 'theme') {
    tokens['--accent'] = accent;
    const rgb = hexToRgbTriplet(accent);
    if (rgb) tokens['--accent-rgb'] = rgb;
  }
  if (background?.kind === 'color') {
    tokens['--background'] = background.color;
    tokens['--hg-page-image'] = 'none';
  } else if (background?.kind === 'gradient') {
    tokens['--hg-page-image'] = GRADIENT_PRESETS[background.preset];
  } else if (background?.kind === 'image') {
    tokens['--hg-page-image'] = `url("${backgroundImageUrl(background.file)}")`;
    tokens['--hg-page-image-size'] = 'cover';
    tokens['--hg-page-image-position'] = 'center';
  }
  if (typeof cardOpacity === 'number' && cardOpacity < 1) {
    const rgba = parseColor(frameBg);
    if (rgba) {
      const [r, g, b, a] = rgba;
      const alpha = Math.round(a * cardOpacity * 1000) / 1000;
      tokens['--hg-frame-bg'] = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return tokens;
}
