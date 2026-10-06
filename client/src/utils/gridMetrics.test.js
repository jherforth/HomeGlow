import { describe, it, expect, vi, afterEach } from 'vitest';
import { GRID_PITCH, gridMetricsFromGap, readGridMetrics } from './gridMetrics.js';

describe('gridMetricsFromGap', () => {
  it('keeps the Classic grid: 16px gap, 100px rows', () => {
    expect(gridMetricsFromGap('16px')).toEqual({ gap: 16, rowHeight: 100 });
  });

  it('holds the row pitch fixed for every allowed gap', () => {
    for (const gap of ['0', '8px', '16px', '24px']) {
      const metrics = gridMetricsFromGap(gap);
      expect(metrics.rowHeight + metrics.gap).toBe(GRID_PITCH);
    }
  });

  it('falls back to 16px for a missing or unsupported gap', () => {
    for (const raw of [undefined, '', ' ', '12px', '-8px', 'auto', '1e3']) {
      expect(gridMetricsFromGap(raw)).toEqual({ gap: 16, rowHeight: 100 });
    }
  });
});

describe('readGridMetrics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads --hg-grid-gap from the root element', () => {
    const root = {};
    vi.stubGlobal('getComputedStyle', (el) => ({
      getPropertyValue: (name) => (el === root && name === '--hg-grid-gap' ? ' 8px' : ''),
    }));
    expect(readGridMetrics(root)).toEqual({ gap: 8, rowHeight: 108 });
  });

  it('falls back without a DOM', () => {
    expect(readGridMetrics(null)).toEqual({ gap: 16, rowHeight: 100 });
  });
});
