// Permissions a plugin asks for in its manifest and an admin grants (issue
// #402). A plugin declares what it wants, e.g. "permissions": ["microphone"];
// installing or updating it never grants anything. What it gets is what it
// asks for AND an admin switched on AND this version of HomeGlow knows:
// a permission an update adds starts switched off, because it was never
// granted, and a grant the manifest no longer asks for does nothing.
//
// This list is the one place a permission is defined. `frame` permissions are
// browser features delegated to the plugin's iframe through its `allow`
// attribute (client/src/components/PluginWidgetWrapper.jsx); the browser's own
// prompt on each display still applies. Later kinds (a server ability checked
// in utils/pluginRequestPolicy.js, say) go here too.

const PLUGIN_PERMISSIONS = Object.freeze({
  // Speech recognition. In HomeGlow's sealed (opaque-origin) frames Chromium
  // refuses getUserMedia whatever the iframe allows, so a plugin hears only
  // through the browser's SpeechRecognition, which this gates.
  microphone: Object.freeze({ kind: 'frame', allow: 'microphone' }),
});

const PERMISSION_NAMES = Object.freeze(Object.keys(PLUGIN_PERMISSIONS));

const isKnownPermission = (name) => typeof name === 'string'
  && Object.prototype.hasOwnProperty.call(PLUGIN_PERMISSIONS, name);

/** Problems with a manifest's `permissions` field, as messages. */
function validateManifestPermissions(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((name) => typeof name !== 'string')) {
    return ['permissions must be an array of strings.'];
  }
  const errors = [];
  for (const name of value) {
    if (!isKnownPermission(name)) {
      errors.push(`permissions: "${name}" is not a known permission (known: ${PERMISSION_NAMES.join(', ')}).`);
    }
  }
  if (new Set(value).size !== value.length) errors.push('permissions must not list a permission twice.');
  return errors;
}

/** What a manifest asks for: known names only, in the list's order. */
function requestedPermissions(manifest) {
  const asked = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  return PERMISSION_NAMES.filter((name) => asked.includes(name));
}

/** The stored grants column as a list of known names. */
function parseGrants(stored) {
  if (stored === null || stored === undefined || stored === '') return [];
  let list = stored;
  if (typeof stored === 'string') {
    try { list = JSON.parse(stored); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return PERMISSION_NAMES.filter((name) => list.includes(name));
}

/** What a plugin actually has: asked for and granted. */
function grantedPermissions(manifest, storedGrants) {
  const grants = parseGrants(storedGrants);
  return requestedPermissions(manifest).filter((name) => grants.includes(name));
}

/**
 * A request's `granted` list, checked against what the manifest asks for.
 * -> { value } (the JSON to store) | { error }
 */
function normalizeGrantRequest(raw, manifest) {
  if (!Array.isArray(raw) || raw.some((name) => typeof name !== 'string')) {
    return { error: 'granted must be an array of permission names.' };
  }
  const requested = requestedPermissions(manifest);
  for (const name of raw) {
    if (!isKnownPermission(name)) return { error: `"${name}" is not a known permission.` };
    if (!requested.includes(name)) return { error: `This plugin doesn't ask for "${name}".` };
  }
  return { value: JSON.stringify(PERMISSION_NAMES.filter((name) => raw.includes(name))) };
}

/** The iframe `allow` tokens the granted permissions add. */
function frameAllowTokens(granted) {
  return granted
    .map((name) => PLUGIN_PERMISSIONS[name])
    .filter((permission) => permission && permission.kind === 'frame')
    .map((permission) => permission.allow);
}

module.exports = {
  PLUGIN_PERMISSIONS,
  PERMISSION_NAMES,
  isKnownPermission,
  validateManifestPermissions,
  requestedPermissions,
  parseGrants,
  grantedPermissions,
  normalizeGrantRequest,
  frameAllowTokens,
};
