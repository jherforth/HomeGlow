import { describe, it, expect } from 'vitest';
import { pinErrorText } from './pinErrors.js';

const t = (key, values) => `${key}:${values?.seconds}`;

describe('pinErrorText', () => {
  it('says how long to wait after too many wrong PINs', () => {
    const error = { response: { status: 429, data: { retryAfterSeconds: 60 }, headers: {} } };
    expect(pinErrorText(error, t, 'fallback')).toBe('common:pin.tooManyTries:60');
  });

  it('falls back to Retry-After, then to 30 seconds', () => {
    expect(pinErrorText({ response: { status: 429, data: {}, headers: { 'retry-after': '120' } } }, t, 'x'))
      .toBe('common:pin.tooManyTries:120');
    expect(pinErrorText({ response: { status: 429 } }, t, 'x')).toBe('common:pin.tooManyTries:30');
  });

  it("passes the server's own message through, or the fallback", () => {
    expect(pinErrorText({ response: { status: 404, data: { error: 'No PIN configured' } } }, t, 'x')).toBe('No PIN configured');
    expect(pinErrorText(new Error('Network Error'), t, 'Incorrect PIN')).toBe('Incorrect PIN');
  });
});
