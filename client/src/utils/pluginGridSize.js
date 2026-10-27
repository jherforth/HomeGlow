// A plugin widget's size on the dashboard, in grid squares (12 columns
// across): the size it starts at and the smallest it may be resized to.
// A plugin may set both in its manifest's `size` (checked on upload, see
// extractPluginManifest in server/index.js); otherwise 6 by 4, at least 2 by 2.
// A Home Assistant panel may always go down to one square, even one saved
// before panels said so in their manifest.

const DEFAULT = { width: 6, height: 4, minWidth: 2, minHeight: 2 };

const square = (value, max) => (Number.isInteger(value) && value >= 1 && value <= max ? value : null);

export function pluginGridSize(plugin) {
  const size = plugin?.manifest?.size && typeof plugin.manifest.size === 'object' ? plugin.manifest.size : {};
  const panel = plugin?.source === 'builder';
  const minWidth = square(size.minWidth, 12) ?? (panel ? 1 : DEFAULT.minWidth);
  const minHeight = square(size.minHeight, 24) ?? (panel ? 1 : DEFAULT.minHeight);
  const width = Math.max(minWidth, square(size.width, 12) ?? DEFAULT.width);
  const height = Math.max(minHeight, square(size.height, 24) ?? DEFAULT.height);
  return { defaultSize: { width, height }, minWidth, minHeight };
}
