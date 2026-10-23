import { describe, expect, it } from 'vitest';
import { lastSend } from './notificationChannels.js';

describe('lastSend', () => {
  it('is nothing before the first send', () => {
    expect(lastSend({})).toBe(null);
  });

  it('is the later of the last success and the last failure', () => {
    expect(lastSend({ lastSuccessAt: '2026-10-23 10:00:00' })).toBe('delivered');
    expect(lastSend({ lastFailureAt: '2026-10-23 10:00:00', lastFailure: 'refused' })).toBe('failed');
    expect(lastSend({ lastSuccessAt: '2026-10-23 11:00:00', lastFailureAt: '2026-10-23 10:00:00', lastFailure: 'refused' })).toBe('delivered');
    expect(lastSend({ lastSuccessAt: '2026-10-23 10:00:00', lastFailureAt: '2026-10-23 11:00:00', lastFailure: 'refused' })).toBe('failed');
  });
});
