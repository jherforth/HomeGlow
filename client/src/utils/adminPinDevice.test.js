import { describe, it, expect } from 'vitest';
import {
  ADMIN_PIN_REMEMBERED_KEY,
  isPinRemembered,
  shouldPromptForPin,
} from './adminPinDevice.js';

describe('isPinRemembered', () => {
  it('is true only for a literal true', () => {
    expect(isPinRemembered({ [ADMIN_PIN_REMEMBERED_KEY]: true })).toBe(true);
  });

  it('does not accept truthy stand-ins', () => {
    // A device settings blob is JSON written by a client; a stray string must
    // not silently disable the PIN everywhere on that device.
    for (const value of ['true', 1, 'yes', {}, []]) {
      expect(isPinRemembered({ [ADMIN_PIN_REMEMBERED_KEY]: value })).toBe(false);
    }
  });

  it('handles absent, empty and malformed settings', () => {
    expect(isPinRemembered(undefined)).toBe(false);
    expect(isPinRemembered(null)).toBe(false);
    expect(isPinRemembered({})).toBe(false);
    expect(isPinRemembered({ someOtherKey: true })).toBe(false);
  });

  it('is unaffected by the other keys a device already stores', () => {
    expect(isPinRemembered({
      choreWidgetSettings: { soundEnabled: true, hiddenUserIds: [1, 2] },
      [ADMIN_PIN_REMEMBERED_KEY]: true,
    })).toBe(true);
  });
});

describe('shouldPromptForPin', () => {
  it('prompts when a PIN exists and this device has not remembered it', () => {
    expect(shouldPromptForPin({ pinExists: true, remembered: false })).toBe(true);
  });

  it('does not prompt on a remembered device', () => {
    expect(shouldPromptForPin({ pinExists: true, remembered: true })).toBe(false);
  });

  it('never prompts when no PIN is configured', () => {
    // The spec: a remembered device behaves exactly as a household with no PIN.
    expect(shouldPromptForPin({ pinExists: false, remembered: false })).toBe(false);
    expect(shouldPromptForPin({ pinExists: false, remembered: true })).toBe(false);
  });

  it('fails closed when the PIN state is unknown but truthy-ish', () => {
    // Only a literal true for pinExists means "a PIN is configured"; anything
    // else means we could not establish one, and we must not invent a prompt.
    expect(shouldPromptForPin({ pinExists: undefined, remembered: false })).toBe(false);
    expect(shouldPromptForPin({ pinExists: 'yes', remembered: false })).toBe(false);
  });

  it('prompts when remembered is unknown', () => {
    // fetchPinRemembered returns false on any read failure; belt and braces.
    expect(shouldPromptForPin({ pinExists: true, remembered: undefined })).toBe(true);
    expect(shouldPromptForPin({ pinExists: true, remembered: 'true' })).toBe(true);
  });
});
