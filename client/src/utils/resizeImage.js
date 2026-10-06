// Shrinks a photo before it is uploaded as a background: a wall display gains
// nothing from a 24-megapixel original, and decoding one costs a small device
// real time and memory. The server only checks type and size.

export const BACKGROUND_MAX_EDGE = 2560;

/** The size to draw at: the long edge capped, the aspect kept, never enlarged. */
export function fitWithin(width, height, maxEdge = BACKGROUND_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** A resized copy of an image File, as WebP (or JPEG where WebP is unsupported). */
export async function resizeForBackground(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const webp = await toBlob(canvas, 'image/webp', 0.86);
  if (webp && webp.type === 'image/webp') return webp;
  return toBlob(canvas, 'image/jpeg', 0.88);
}
