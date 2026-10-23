import { describe, expect, it } from 'vitest';
import { acceptGoogleOAuthMessage, GOOGLE_OAUTH_MESSAGE_TYPE, originOf } from './googleOAuth.js';

describe('Google OAuth popup message', () => {
  const popup = {};
  const origin = 'https://home.example';
  const message = (over = {}) => ({ source: popup, origin, data: { type: GOOGLE_OAUTH_MESSAGE_TYPE, ok: true }, ...over });

  it('counts only from the popup, on the callback origin', () => {
    expect(acceptGoogleOAuthMessage(message(), popup, origin)).toBe(true);
    expect(acceptGoogleOAuthMessage(message({ source: {} }), popup, origin)).toBe(false);
    expect(acceptGoogleOAuthMessage(message({ origin: 'https://evil.example' }), popup, origin)).toBe(false);
    expect(acceptGoogleOAuthMessage(message(), null, origin)).toBe(false);
    expect(acceptGoogleOAuthMessage(message(), popup, null)).toBe(false);
  });

  it('ignores other message types', () => {
    expect(acceptGoogleOAuthMessage(message({ data: { type: 'homeglow:celebrate' } }), popup, origin)).toBe(false);
    expect(acceptGoogleOAuthMessage(message({ data: GOOGLE_OAUTH_MESSAGE_TYPE }), popup, origin)).toBe(false);
  });

  it('takes the origin from the callback URL', () => {
    expect(originOf('https://home.example:8443/api/connections/google/callback')).toBe('https://home.example:8443');
    expect(originOf('not a url')).toBe(null);
  });
});
