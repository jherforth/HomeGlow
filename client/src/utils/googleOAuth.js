export const GOOGLE_OAUTH_MESSAGE_TYPE = 'homeglow:google-oauth';

// The callback page posts its result to window.opener. Only the popup this
// page opened, once it is back on the callback URL's origin, may report it;
// any other window could otherwise fake a "connected" or "failed" toast.
export function acceptGoogleOAuthMessage(event, popup, callbackOrigin) {
  if (!event || !popup || !callbackOrigin) return false;
  if (event.source !== popup || event.origin !== callbackOrigin) return false;
  return !!event.data && typeof event.data === 'object' && event.data.type === GOOGLE_OAUTH_MESSAGE_TYPE;
}

export function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
