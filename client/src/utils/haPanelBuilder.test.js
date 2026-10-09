import { describe, it, expect } from 'vitest';
import {
  addTiles, blankRecipe, exportRecipe, moveTile, newTileId, parseImport, recipeEntities, recipeFromArea, unknownEntities,
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

describe('sharing', () => {
  it('round-trips a recipe through its text', () => {
    const recipe = { ...blankRecipe('Hall'), tiles: addTiles([], ['light.hall']) };
    const { recipe: back } = parseImport(exportRecipe(recipe));
    expect(back.name).toBe('Hall');
    expect(back.tiles[0].entities).toEqual(['light.hall']);
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
