// What the weather widget may do with a tab's saved settings.
//
// The widget shows a default place until a place is saved. Two rules keep
// that default from ever replacing a saved place:
//   - nothing happens until the tabs have loaded: before then the widget
//     cannot tell "no place saved" from "not loaded yet";
//   - only a place someone chose is written back. The widget saves a place's
//     coordinates once it has looked them up, and doing that for the default
//     used to overwrite a saved place whenever the tabs loaded slowly.

/** The tab's layout map from its config_json, or {} when there is none to read. */
export function parseTabConfigJson(configJson) {
  if (!configJson) return {};
  if (typeof configJson === 'object' && !Array.isArray(configJson)) return configJson;
  if (typeof configJson !== 'string') return {};
  try {
    const parsed = JSON.parse(configJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Whether the tabs have loaded, so settings can be read and acted on. The
 * active tab's config is there once they have; a widget given every tab's
 * config (the background prefetch) can also tell from that list.
 */
export function tabSettingsReady(activeTabConfigJson, allTabConfigs = []) {
  return activeTabConfigJson != null || (Array.isArray(allTabConfigs) && allTabConfigs.length > 0);
}

/** Whether a saved weather entry names a place, rather than leaving the default. */
export function hasChosenLocation(entry) {
  return !!entry && String(entry.locationQuery || entry.zipCode || '').trim() !== '';
}

/**
 * The settings to save after looking up a place's coordinates, or null when
 * nothing may be saved: the place was not chosen, or it already has them.
 */
export function coordinateBackfill(target, payload) {
  if (!target?.chosen || target.coordinates) return null;
  const lat = payload?.coordinates?.lat;
  const lon = payload?.coordinates?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    locationQuery: target.locationQuery,
    tempUnit: target.tempUnit,
    layoutMode: target.layoutMode || 'auto',
    lat,
    lon,
    ...(payload.resolvedName ? { resolvedName: payload.resolvedName } : {}),
  };
}
