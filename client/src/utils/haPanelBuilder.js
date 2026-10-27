// The Home Assistant panel builder's working parts (issue #252), apart from
// the screen so they can be tested: tiles from entities, a panel from an
// area, moving tiles, and recipes in and out as text. The server checks every
// recipe again (server/services/haPanels.js); this only shapes them.

// Columns by rows; 'f' is the panel's whole width (a long tile).
export const TILE_SIZES = ['1x1', '2x1', '1x2', '2x2', 'fx1', 'fx2'];
export const COLUMN_CHOICES = ['auto', 1, 2, 3, 4, 5, 6];
export const STYLE_CHOICES = ['classic', 'bold'];
export const MAX_TILES = 48;
export const EXPORT_FORMAT = 'homeglow-ha-panel';

// The preview's sizes stand in for the widget's own size on a dashboard, so
// the preview is drawn at that size in px, not stretched to its space.
export const PREVIEW_SIZES = { small: [300, 220], medium: [460, 340], large: [720, 480] };
// The narrowest the tile editors beside a preview may get.
export const EDITOR_MIN_WIDTH = 420;
export const PREVIEW_GAP = 16;

// The order a panel from an area lists things in: what people reach for most.
const DOMAIN_ORDER = [
  'light', 'switch', 'fan', 'cover', 'climate', 'media_player', 'scene', 'script', 'button', 'input_button',
  'input_boolean', 'lock', 'alarm_control_panel', 'vacuum', 'input_select', 'select', 'input_number', 'number',
  'camera', 'sensor', 'binary_sensor',
];

export const domainOf = (entityId) => String(entityId).split('.')[0];

/** A short id no tile in `taken` has. */
export function newTileId(taken = []) {
  const used = new Set(taken);
  for (let n = used.size + 1; ; n += 1) {
    const id = `t${n.toString(36)}`;
    if (!used.has(id)) return id;
  }
}

/** A tile for each entity, appended to `tiles`, skipping ones already alone on a tile. */
export function addTiles(tiles, entityIds) {
  const next = [...tiles];
  const single = new Set(tiles.filter((tile) => tile.entities.length === 1).map((tile) => tile.entities[0]));
  for (const entityId of entityIds) {
    if (single.has(entityId) || next.length >= MAX_TILES) continue;
    next.push({ id: newTileId(next.map((tile) => tile.id)), entities: [entityId], size: '1x1', showState: true });
    single.add(entityId);
  }
  return next;
}

// A panel's size on the dashboard is in grid squares, 12 columns across, as
// the dashboard stores it (utils/gridLayout.js). A row is 100px tall with a
// 16px gap (utils/gridMetrics.js); a column is about 106px on a screen 1440px
// wide, and wider on a wider screen.
export const WIDGET_MAX_W = 12;
export const WIDGET_MAX_H = 12;
export const GRID_COLUMN_PX = 106;
export const GRID_ROW_PX = 100;
export const GRID_GAP_PX = 16;

/**
 * About how big a panel of `size` grid squares is, in pixels: on a screen
 * `screenWidth` wide when given (the dashboard's 12 columns share its width,
 * less 16px each side), else on one 1440px wide. `metrics` is the theme's
 * { gap, rowHeight } (utils/gridMetrics.js), else the default 16px gap.
 */
export function widgetPixels(size, screenWidth, metrics = {}) {
  const gap = Number.isFinite(metrics.gap) ? metrics.gap : GRID_GAP_PX;
  const row = Number.isFinite(metrics.rowHeight) ? metrics.rowHeight : GRID_ROW_PX;
  const column = screenWidth >= 960
    ? (screenWidth - 32 - gap * (WIDGET_MAX_W - 1)) / WIDGET_MAX_W
    : GRID_COLUMN_PX;
  return {
    width: size.w * column + (size.w - 1) * gap,
    height: size.h * row + (size.h - 1) * gap,
  };
}

/**
 * The size that fits a panel's tiles best: about one grid square for each
 * tile's square (a wide or tall tile counts two, a big one four), laid out as
 * close to square as it goes. One tile is one square: a single button.
 */
export function suggestedWidgetSize(tiles) {
  const spots = Math.max(1, (tiles || []).reduce((sum, tile) => {
    const size = TILE_SIZES.includes(tile.size) ? tile.size : '1x1';
    // A long tile takes a whole row: about two squares wide.
    return sum + (size[0] === 'f' ? 2 : Number(size[0])) * Number(size[2]);
  }, 0));
  const w = Math.min(WIDGET_MAX_W, Math.ceil(Math.sqrt(spots)));
  const h = Math.min(WIDGET_MAX_H, Math.ceil(spots / w));
  return { w, h };
}

/** The size a panel has: the one picked, else the best fit for its tiles. */
export function widgetSizeOf(recipe) {
  const size = recipe?.widget;
  if (size && Number.isInteger(size.w) && Number.isInteger(size.h)) return { w: size.w, h: size.h };
  return suggestedWidgetSize(recipe?.tiles);
}

/** A new panel's recipe. */
export function blankRecipe(name = '') {
  return { name, layout: 'grid', columns: 'auto', style: 'classic', animate: true, tiles: [] };
}

/**
 * A panel of everything in one area, in a sensible order: lights first,
 * sensors last. Hidden entities never reach the builder's list.
 */
export function recipeFromArea(area, entities) {
  const inArea = entities
    .filter((entity) => entity.areaId === area.id)
    .sort((a, b) => {
      const da = DOMAIN_ORDER.indexOf(a.domain);
      const db = DOMAIN_ORDER.indexOf(b.domain);
      return (da === -1 ? 99 : da) - (db === -1 ? 99 : db) || a.name.localeCompare(b.name);
    });
  return { ...blankRecipe(area.name.slice(0, 40)), tiles: addTiles([], inArea.map((entity) => entity.entity_id)) };
}

/** Move the tile at `from` to `to`. */
export function moveTile(tiles, from, to) {
  if (from === to || from < 0 || to < 0 || from >= tiles.length || to >= tiles.length) return tiles;
  const next = [...tiles];
  const [tile] = next.splice(from, 1);
  next.splice(to, 0, tile);
  return next;
}

/** The text a panel is shared as. */
export function exportRecipe(recipe) {
  const { name, layout, columns, style, animate, widget, tiles } = recipe;
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, recipe: { name, layout, columns, style, animate, ...(widget ? { widget } : {}), tiles } }, null, 2);
}

/** A shared panel read back: { recipe } or { error } (a message key). */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'notJson' };
  }
  const recipe = data?.format === EXPORT_FORMAT ? data.recipe : data;
  if (!recipe || typeof recipe !== 'object' || !Array.isArray(recipe.tiles) || typeof recipe.name !== 'string') {
    return { error: 'notPanel' };
  }
  return { recipe };
}

/** Every entity a recipe names (tiles and conditions). */
export function recipeEntities(recipe) {
  const ids = new Set();
  for (const tile of recipe?.tiles || []) {
    (tile.entities || []).forEach((id) => ids.add(id));
    if (tile.when?.entity) ids.add(tile.when.entity);
  }
  return [...ids];
}

/** The entities a recipe names that this home doesn't have. */
export function unknownEntities(recipe, knownIds) {
  const known = new Set(knownIds);
  return recipeEntities(recipe).filter((id) => !known.has(id));
}

/** A tile's label for lists: its own, else the first entity's name. */
export function tileTitle(tile, entitiesById) {
  return tile.label || entitiesById.get(tile.entities[0])?.name || tile.entities[0];
}

/** The states a "show only when" condition can name for an entity, from its kind. */
export function suggestedStates(domain) {
  switch (domain) {
    case 'person': case 'device_tracker': return ['home', 'not_home'];
    case 'binary_sensor': case 'input_boolean': case 'switch': case 'light': case 'fan': return ['on', 'off'];
    case 'cover': return ['open', 'closed', 'opening', 'closing'];
    case 'lock': return ['locked', 'unlocked'];
    case 'alarm_control_panel': return ['disarmed', 'armed_home', 'armed_away', 'triggered'];
    case 'media_player': return ['playing', 'paused', 'idle', 'off'];
    case 'sun': return ['above_horizon', 'below_horizon'];
    default: return [];
  }
}

/**
 * Where the preview goes in a builder `width` px wide: beside the tile
 * editors when both fit, else above them. Above, it keeps its own size
 * unless the builder is narrower still (a phone), where it scales down to
 * fit rather than overflow. The editors never give up room to it.
 */
export function previewLayout(width, [previewWidth]) {
  if (!(width > 0)) return { beside: false, scale: 1 };
  if (width >= EDITOR_MIN_WIDTH + PREVIEW_GAP + previewWidth) return { beside: true, scale: 1 };
  return { beside: false, scale: Math.min(1, width / previewWidth) };
}
