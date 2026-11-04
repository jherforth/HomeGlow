// One-time reload command for mirror exit (remote refresh). When a mirror
// session exits, the exiting client POSTs a timestamp to the TARGET's
// reload-request record; the target's dashboard, on seeing a pending
// command for its OWN device row, clears it and reloads. Clearing before
// reloading is what makes the command one-time: a reloaded page finds
// nothing pending, and only a new exit writes a new command. Every check
// here reads only the caller's own device row, so a mirror controller
// never reloads itself and a non-target never fires — the scoping is in
// which row is read, not in who sent the command.
//
// `fetchImpl` is injected (the browser `fetch` in app.jsx, a recording
// fake in tests) so the ordering — GET, then DELETE, then the caller's
// reload — is pinnable without a browser.
export const MIRROR_RELOAD_FIELD = 'mirrorReloadRequestedAt';

export function mirrorReloadRequestUrl(apiBaseUrl, deviceName) {
  return `${apiBaseUrl}/api/devices/${encodeURIComponent(deviceName)}/reload-request`;
}

export function isMirrorReloadRequestValue(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Ask the target device to reload once, when a mirror session exits.
// Fire-and-forget from the caller: a failed request must never block the
// exit, and the server-side record is what the target acts on. Returns the
// stored timestamp, or null when the request did not land.
export async function requestMirrorReload(fetchImpl, apiBaseUrl, targetName) {
  try {
    const response = await fetchImpl(mirrorReloadRequestUrl(apiBaseUrl, targetName), { method: 'POST' });
    if (!response || !response.ok) return null;
    const data = await response.json();
    const value = data ? data[MIRROR_RELOAD_FIELD] : null;
    return isMirrorReloadRequestValue(value) ? value : null;
  } catch {
    return null;
  }
}

// Check this browser's own device for a pending reload command. Returns
// 'reload' when a command was found and cleared (the caller reloads),
// 'adopted' when a command was found and cleared on a fresh page load
// (the page already has current state, so no reload), and 'none'
// otherwise. A failed clear means no reload: the command stays pending
// and a later check retries, which is the safe direction — it can delay
// a reload, never loop one.
export async function checkMirrorReload(fetchImpl, apiBaseUrl, localName, { adopt = false } = {}) {
  let value;
  try {
    const response = await fetchImpl(mirrorReloadRequestUrl(apiBaseUrl, localName));
    if (!response || !response.ok) return 'none';
    const data = await response.json();
    value = data ? data[MIRROR_RELOAD_FIELD] : null;
  } catch {
    return 'none';
  }
  if (!isMirrorReloadRequestValue(value)) return 'none';
  try {
    const cleared = await fetchImpl(mirrorReloadRequestUrl(apiBaseUrl, localName), { method: 'DELETE' });
    if (!cleared || !cleared.ok) return 'none';
  } catch {
    return 'none';
  }
  return adopt ? 'adopted' : 'reload';
}
