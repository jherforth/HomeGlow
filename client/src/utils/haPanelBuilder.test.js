import { describe, it, expect } from 'vitest';
import {
  PREVIEW_SIZES, addTiles, blankRecipe, exportRecipe, moveTile, newTileId, parseImport, previewLayout, recipeEntities,
  recipeFromArea, suggestedWidgetSize, unknownEntities, widgetPixels, widgetSizeOf,
} from './haPanelBuilder.js';

const entity = (entity_id, areaId, name = entity_id) => ({ entity_id, areaId, name, domain: entity_id.split('.')[0] });

describe('tiles', () => {
  it('gives every tile its own short id', () => {
    expect(newTileId([])).toBe('t1');
    expect(newTileId(['t1', 't2'])).toBe('t3');
    expect(newTileId(['t3'])).toBe('t2');
    const ids = addTiles([], ['light.a', 'light.b', 'light.c']).map((tile) => tile.id);
    expect(new Set(ids).size).toBe(3);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]{1,16}$/));
  });

  it('adds one tile per entity, never the same entity alone twice', () => {
    const tiles = addTiles([], ['light.a', 'switch.b']);
    expect(tiles.map((tile) => tile.entities)).toEqual([['light.a'], ['switch.b']]);
    expect(addTiles(tiles, ['light.a', 'fan.c']).map((tile) => tile.entities[0])).toEqual(['light.a', 'switch.b', 'fan.c']);
  });

  it('stops at 48 tiles', () => {
    const many = Array.from({ length: 60 }, (_, i) => `light.l${i}`);
    expect(addTiles([], many)).toHaveLength(48);
  });

  it('moves a tile and ignores moves out of range', () => {
    const tiles = addTiles([], ['light.a', 'light.b', 'light.c']);
    expect(moveTile(tiles, 0, 2).map((t) => t.entities[0])).toEqual(['light.b', 'light.c', 'light.a']);
    expect(moveTile(tiles, 0, 5)).toBe(tiles);
  });
});

describe('a panel from an area', () => {
  it('takes that area\'s entities, lights first and sensors last', () => {
    const entities = [
      entity('sensor.temp', 'kitchen', 'Temperature'),
      entity('light.ceiling', 'kitchen', 'Ceiling'),
      entity('switch.kettle', 'kitchen', 'Kettle'),
      entity('light.porch', 'outside', 'Porch'),
    ];
    const recipe = recipeFromArea({ id: 'kitchen', name: 'Kitchen' }, entities);
    expect(recipe.name).toBe('Kitchen');
    expect(recipe.tiles.map((t) => t.entities[0])).toEqual(['light.ceiling', 'switch.kettle', 'sensor.temp']);
  });
});

describe('size on the dashboard', () => {
  const tiles = (...sizes) => sizes.map((size, i) => ({ id: `t${i}`, entities: [`light.l${i}`], size }));

  it('fits about one grid square per tile, as square as it goes', () => {
    expect(suggestedWidgetSize(tiles('1x1'))).toEqual({ w: 1, h: 1 });
    expect(suggestedWidgetSize(tiles('1x1', '1x1'))).toEqual({ w: 2, h: 1 });
    expect(suggestedWidgetSize(tiles('1x1', '1x1', '1x1', '1x1'))).toEqual({ w: 2, h: 2 });
    expect(suggestedWidgetSize(tiles('2x1', '1x1', '1x1'))).toEqual({ w: 2, h: 2 });
    expect(suggestedWidgetSize(tiles('2x2', '1x1'))).toEqual({ w: 3, h: 2 });
    expect(suggestedWidgetSize([])).toEqual({ w: 1, h: 1 });
    expect(suggestedWidgetSize(tiles('fx1', '1x1', '1x1'))).toEqual({ w: 2, h: 2 });
  });

  it('uses the picked size, else the best fit', () => {
    expect(widgetSizeOf({ widget: { w: 1, h: 4 }, tiles: tiles('1x1', '1x1') })).toEqual({ w: 1, h: 4 });
    expect(widgetSizeOf({ tiles: tiles('1x1', '1x1', '1x1') })).toEqual({ w: 2, h: 2 });
  });

  it('works out the pixels a size takes', () => {
    expect(widgetPixels({ w: 1, h: 1 })).toEqual({ width: 106, height: 100 });
    expect(widgetPixels({ w: 2, h: 3 })).toEqual({ width: 228, height: 332 });
  });

  it('shares the size with the panel', () => {
    const { recipe } = parseImport(exportRecipe({ ...blankRecipe('Hall'), widget: { w: 1, h: 1 }, tiles: tiles('1x1') }));
    expect(recipe.widget).toEqual({ w: 1, h: 1 });
  });
});

describe('sharing', () => {
  it('round-trips a recipe through its text', () => {
    const recipe = { ...blankRecipe('Hall'), tiles: addTiles([], ['light.hall']) };
    const { recipe: back } = parseImport(exportRecipe(recipe));
    expect(back.name).toBe('Hall');
    expect(back.tiles[0].entities).toEqual(['light.hall']);
  });

  it('keeps the look a panel was shared with', () => {
    const recipe = { ...blankRecipe('Hall'), style: 'bold', animate: false, tiles: addTiles([], ['light.hall']) };
    const { recipe: back } = parseImport(exportRecipe(recipe));
    expect(back.style).toBe('bold');
    expect(back.animate).toBe(false);
  });

  it('accepts a bare recipe and refuses anything else', () => {
    expect(parseImport('{"name":"X","tiles":[]}').recipe.name).toBe('X');
    expect(parseImport('not json').error).toBe('notJson');
    expect(parseImport('{"hello":1}').error).toBe('notPanel');
  });

  it('names the entities this home doesn\'t have, conditions included', () => {
    const recipe = { name: 'X', tiles: [{ id: 'a', entities: ['light.a'], when: { entity: 'person.kim', states: ['home'] } }, { id: 'b', entities: ['light.b'] }] };
    expect(recipeEntities(recipe)).toEqual(['light.a', 'person.kim', 'light.b']);
    expect(unknownEntities(recipe, ['light.a'])).toEqual(['person.kim', 'light.b']);
  });
});

describe('the preview', () => {
  it('sits beside the tile editors only when both fit', () => {
    // The Admin Panel's builder is about 745px wide on a display.
    expect(previewLayout(745, PREVIEW_SIZES.small)).toEqual({ beside: true, scale: 1 });
    expect(previewLayout(745, PREVIEW_SIZES.medium)).toEqual({ beside: false, scale: 1 });
    expect(previewLayout(745, PREVIEW_SIZES.large)).toEqual({ beside: false, scale: 1 });
    expect(previewLayout(1400, PREVIEW_SIZES.large)).toEqual({ beside: true, scale: 1 });
  });

  it('scales down above the editors only when the builder is narrower than it', () => {
    expect(previewLayout(360, PREVIEW_SIZES.large)).toEqual({ beside: false, scale: 0.5 });
    expect(previewLayout(360, PREVIEW_SIZES.small)).toEqual({ beside: false, scale: 1 });
  });

  it('waits for a width before scaling anything', () => {
    expect(previewLayout(0, PREVIEW_SIZES.large)).toEqual({ beside: false, scale: 1 });
  });
});
