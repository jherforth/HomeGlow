import { describe, it, expect } from 'vitest';
import { editWholeNumber, savedWholeNumber } from './wholeNumberField.js';

describe('editWholeNumber', () => {
  it('keeps a cleared field empty instead of snapping it back to 0', () => {
    expect(editWholeNumber('')).toBe('');
  });

  it('reads what was typed as a whole number', () => {
    expect(editWholeNumber('5')).toBe(5);
    expect(editWholeNumber('05')).toBe(5);
    expect(editWholeNumber('12.7')).toBe(12);
    expect(editWholeNumber('abc')).toBe(0);
  });
});

describe('savedWholeNumber', () => {
  it('saves an empty or invalid field as 0, as before', () => {
    expect(savedWholeNumber('')).toBe(0);
    expect(savedWholeNumber(undefined)).toBe(0);
    expect(savedWholeNumber('abc')).toBe(0);
    expect(savedWholeNumber(7)).toBe(7);
    expect(savedWholeNumber('7')).toBe(7);
  });
});
