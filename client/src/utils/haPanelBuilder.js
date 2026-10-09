// The Home Assistant panel builder's working parts (issue #252), apart from
// the screen so they can be tested: tiles from entities, a panel from an
// area, moving tiles, and recipes in and out as text. The server checks every
// recipe again (server/services/haPanels.js); this only shapes them.

export const TILE_SIZES = ['1x1', '2x1', '1x2', '2x2'];
export const COLUMN_CHOICES = ['auto', 1, 2, 3, 4, 5, 6];
export const MAX_TILES = 48;
export const EXPORT_FORMAT = 'homeglow-ha-panel';

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

/** A new panel's recipe. */
export function blankRecipe(name = '') {
  return { name, layout: 'grid', columns: 'auto', tiles: [] };
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
  const { name, layout, columns, tiles } = recipe;
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, recipe: { name, layout, columns, tiles } }, null, 2);
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
