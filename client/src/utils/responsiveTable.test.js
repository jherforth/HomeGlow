import { describe, it, expect } from 'vitest';
import { stackableTableSx, compactStackedTableSx } from './responsiveTable.js';

// Kiosks render at 600px and up and must stay pixel-identical, so every rule in
// these styles has to live inside the mobile media query.
const MOBILE = '@media (max-width:599.95px)';

describe('responsive table styles', () => {
  it.each([
    ['stackableTableSx', stackableTableSx],
    ['compactStackedTableSx', compactStackedTableSx],
  ])('%s only styles phones', (_, sx) => {
    expect(Object.keys(sx)).toEqual([MOBILE]);
  });

  it('puts the title and the actions on one heading line, chips after them', () => {
    const rules = compactStackedTableSx[MOBILE];
    expect(rules['& td:first-of-type'].order).toBeLessThan(rules['& td:last-of-type'].order);
    expect(rules['& td:last-of-type'].order).toBeLessThan(rules['& td'].order);
  });

  it('keeps the empty-state row a plain full-width line', () => {
    // Declared after the first/last-of-type rules, so it wins for a lone
    // colSpan cell that is both first and last.
    const keys = Object.keys(compactStackedTableSx[MOBILE]);
    expect(keys.indexOf('& td[colspan]')).toBeGreaterThan(keys.indexOf('& td:last-of-type'));
    expect(compactStackedTableSx[MOBILE]['& td[colspan]'].flexBasis).toBe('100%');
  });

  it('drops empty cells and gives a description its own line', () => {
    const rules = compactStackedTableSx[MOBILE];
    expect(rules['& td.stack-empty'].display).toBe('none');
    expect(rules['& td.stack-full'].flexBasis).toBe('100%');
  });
});
