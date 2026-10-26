import { describe, it, expect } from 'vitest';
import { edgeFadeMask } from './edgeFade.js';

describe('edgeFadeMask', () => {
  it('leaves a row that fits alone', () => {
    expect(edgeFadeMask({ scrollLeft: 0, scrollWidth: 600, clientWidth: 600 })).toBe('none');
  });

  it('fades only the right edge at the start of a row that scrolls', () => {
    expect(edgeFadeMask({ scrollLeft: 0, scrollWidth: 800, clientWidth: 600 }))
      .toBe('linear-gradient(to right, #000, #000 calc(100% - 24px), transparent)');
  });

  it('fades both edges in the middle', () => {
    expect(edgeFadeMask({ scrollLeft: 100, scrollWidth: 800, clientWidth: 600 }))
      .toBe('linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent)');
  });

  it('fades only the left edge at the end', () => {
    expect(edgeFadeMask({ scrollLeft: 200, scrollWidth: 800, clientWidth: 600 }))
      .toBe('linear-gradient(to right, transparent, #000 24px, #000)');
  });

  it('treats a fractional pixel at either end as the end', () => {
    expect(edgeFadeMask({ scrollLeft: 0.5, scrollWidth: 800.5, clientWidth: 800 })).toBe('none');
  });
});
