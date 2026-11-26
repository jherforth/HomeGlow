// Permissions a plugin asks for in its manifest and an admin grants (issue
// #402). The server decides what each plugin has (server/utils/
// pluginPermissions.js) and sends it with the plugin list as
// `permissions: { requested, granted }`; this file only turns that into the
// frame's `allow` attribute and the Admin Panel's wording.

// Every plugin frame may ask for the location (Sunrise & Sunset finds where
// it is that way); the browser still asks the household first.
const BASE_FRAME_ALLOW = ['geolocation'];

// Permissions that are browser features delegated to the frame, and the
// `allow` token each one adds. Mirrors the server's list.
export const FRAME_PERMISSIONS = Object.freeze({ microphone: 'microphone' });

/** The iframe `allow` attribute for a plugin granted `granted`. */
export function pluginFrameAllow(granted = []) {
  const extra = (Array.isArray(granted) ? granted : [])
    .map((name) => FRAME_PERMISSIONS[name])
    .filter(Boolean);
  return [...BASE_FRAME_ALLOW, ...new Set(extra)].join('; ');
}

/** What a listed plugin asks for, and what it has. */
export function permissionsOf(plugin) {
  const permissions = plugin?.permissions || {};
  return {
    requested: Array.isArray(permissions.requested) ? permissions.requested : [],
    granted: Array.isArray(permissions.granted) ? permissions.granted : [],
  };
}

/** What a plugin asks for that nobody has switched on yet. */
export function pendingPermissions(plugin) {
  const { requested, granted } = permissionsOf(plugin);
  return requested.filter((name) => !granted.includes(name));
}

/** `granted` with `name` switched on or off, for PUT .../permissions. */
export function withPermission(granted, name, on) {
  const rest = (Array.isArray(granted) ? granted : []).filter((other) => other !== name);
  return on ? [...rest, name] : rest;
}
