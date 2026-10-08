import { describe, it, expect } from 'vitest';
import { GOOGLE_EVENT_COLORS, eventColorToSend } from './googleEventColors.js';

describe('GOOGLE_EVENT_COLORS', () => {
  it('has each of Google\'s eleven colorIds once', () => {
    const ids = GOOGLE_EVENT_COLORS.map((c) => Number(c.id)).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(GOOGLE_EVENT_COLORS.map((c) => c.key)).size).toBe(11);
  });
});

describe('eventColorToSend', () => {
  it('sends a picked color for a new event, and nothing otherwise', () => {
    expect(eventColorToSend('create', '11', null)).toBe('11');
    expect(eventColorToSend('create', '', null)).toBeUndefined();
  });

  it('leaves an unchanged color out of an edit', () => {
    expect(eventColorToSend('edit', '', null)).toBeUndefined();
    expect(eventColorToSend('edit', '', undefined)).toBeUndefined();
    expect(eventColorToSend('edit', '7', '7')).toBeUndefined();
  });

  it('sends a changed color, or null to go back to the calendar color', () => {
    expect(eventColorToSend('edit', '7', null)).toBe('7');
    expect(eventColorToSend('edit', '7', '11')).toBe('7');
    expect(eventColorToSend('edit', '', '11')).toBeNull();
  });
});
