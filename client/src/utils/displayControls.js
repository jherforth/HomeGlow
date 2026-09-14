import axios from 'axios';
import { isPinRemembered } from './adminPinDevice.js';

/**
 * Control Limits — which parent-facing controls a given display offers.
 *
 * Visibility, not access control: the API has no per-device auth, so every failure
 * path here resolves to hiding nothing.
 *
 *     { mode: 'showAll' | 'hideAll', except: ['core:addChore', ...] }
 *
 * `mode` governs every control NOT named in `except`, including ones that do not
 * exist yet — so a plugin installed next month is hidden on a wall display without
 * anyone revisiting it. `except` is the inverse under each mode (hidden ids under
 * showAll, visible ones under hideAll), so it is private to this module: ask
 * `isHiddenUnder`.
 *
 * Stored per display as the device key `controlLimits` (absent or null means
 * inherit; PATCH merges, so null is the only retraction) and per household as
 * `DISPLAY_CONTROL_LIMITS_DEFAULT`, a JSON string because settings values are TEXT.
 */

export const CONTROL_LIMITS_KEY = 'controlLimits';
export const CONTROL_LIMITS_DEFAULT_KEY = 'DISPLAY_CONTROL_LIMITS_DEFAULT';

/**
 * The fixed catalog of built-in controls. Plugins contribute their own ids from
 * their manifests, so this list is a floor, never the whole universe — which is
 * why no decision below is derived from its length.
 */
export const CORE_CONTROLS = [
  { id: 'core:addChore', labelKey: 'admin:controls.items.addChore' },
  { id: 'core:transferChore', labelKey: 'admin:controls.items.transferChore' },
  { id: 'core:snoozeChore', labelKey: 'admin:controls.items.snoozeChore' },
  { id: 'core:prizeApproval', labelKey: 'admin:controls.items.prizeApproval' },
  { id: 'core:quickSpend', labelKey: 'admin:controls.items.quickSpend' },
];

const CORE_CONTROL_IDS = CORE_CONTROLS.map((control) => control.id);

/**
 * The two configurations worth naming. Both ship with an empty `except`, so the
 * feature is inert until someone picks Wall display or hides an individual
 * control. Frozen because these are shared constants, and a caller that mutated
 * one would silently redefine "Full control" for the whole app.
 */
export const CONTROL_PRESETS = Object.freeze({
  fullControl: Object.freeze({ mode: 'showAll', except: Object.freeze([]) }),
  wallDisplay: Object.freeze({ mode: 'hideAll', except: Object.freeze([]) }),
});

const VALID_MODES = new Set(['showAll', 'hideAll']);

// Plugin slugs match the server's PLUGIN_ID_REGEX; control ids within a
// namespace are camelCase so they can be used as i18n key fragments.
const CORE_CONTROL_ID = /^core:[a-z][a-zA-Z0-9]*$/;
const PLUGIN_CONTROL_ID = /^plugin:[a-z0-9][a-z0-9-]{0,63}:[a-z][a-zA-Z0-9]*$/;

/**
 * Ids are stored and compared as opaque strings, so a malformed one would sit
 * in `except` forever, never matching anything and making two identical-looking
 * configurations compare unequal. Validating on the way in keeps that out.
 */
export function isValidControlId(id) {
  if (typeof id !== 'string') return false;
  return CORE_CONTROL_ID.test(id) || PLUGIN_CONTROL_ID.test(id);
}

/**
 * Sorted, not insertion-ordered. `except` is a set, and the UI compares a
 * configuration against the presets to decide whether to show "Custom" — two
 * configurations that hide the same controls must therefore produce the same
 * array, regardless of the order the user clicked them in.
 */
const sortIds = (ids) => [...ids].sort();

const isPlainObject = (value) => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const validUniqueIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  for (const id of ids) {
    if (isValidControlId(id)) seen.add(id);
  }
  return sortIds(seen);
};

/**
 * Parse whatever was stored into `{mode, except}`, or null for nothing valid.
 *
 * null is NOT `{mode:'showAll', except:[]}`: both hide nothing today, but the first
 * follows a household default that changes tomorrow and the second does not. A
 * missing `mode` yields null rather than a guess, since `mode` is what governs
 * controls nobody has enumerated.
 */
export function normalizeControlLimits(raw) {
  let value = raw;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // Hand-edited settings rows and half-written values land here. Treated as
      // "nothing stored" so the display falls back instead of breaking.
      return null;
    }
  }

  if (!isPlainObject(value)) return null;
  if (!VALID_MODES.has(value.mode)) return null;

  return { mode: value.mode, except: validUniqueIds(value.except) };
}

// Has this display its own configuration, rather than inheriting one? Only an
// inheriting display can be restricted by a change to what it inherits, which is
// the one thing this answers. Not exported: the admin form reads `inheriting` off
// editorState instead, so the switches and the label cannot disagree.
function hasOwnLimits(deviceSettings) {
  return normalizeControlLimits(deviceSettings?.[CONTROL_LIMITS_KEY]) !== null;
}

/** The household default, or null when none is configured. */
export function householdDefaultLimits(householdSettings) {
  return normalizeControlLimits(householdSettings?.[CONTROL_LIMITS_DEFAULT_KEY]);
}

/**
 * An "unlocked" display remembers the admin PIN, so it is exempt entirely —
 * hiding parent controls on a display a parent administers from is unhelpful.
 *
 * `pinExists !== false` matters: removing the household PIN leaves
 * adminPinRemembered behind on every device, and honoring a stale flag would exempt
 * every display at once. `undefined` means not yet known and exempts on purpose,
 * because controls that render, vanish and return read as a broken display — so the
 * caller is obliged to resolve it, and one that never does leaves every remembered
 * display exempt with nothing here able to detect it.
 */
export function isDisplayUnlocked({ deviceSettings, pinExists } = {}) {
  return isPinRemembered(deviceSettings) && pinExists !== false;
}

/**
 * Does this configuration hide that control? The single place the mode/except
 * inversion is written down, and the only supported way to ask.
 *
 * Everything goes through here rather than reading `except`, so the inversion has
 * one expression that cannot drift from another.
 *
 * An unconfigured (null) configuration hides nothing. Neither does an invalid
 * control id, even under hideAll: it cannot name a real control, so reporting it
 * hidden would only mislead the caller.
 */
export function isHiddenUnder(limits, controlId) {
  const normalized = normalizeControlLimits(limits);
  if (normalized === null) return false;
  if (!isValidControlId(controlId)) return false;

  const excepted = normalized.except.includes(controlId);
  return normalized.mode === 'hideAll' ? !excepted : excepted;
}

/**
 * Candidates are the core catalog, whatever the caller knows about, and whatever the
 * configuration names. `knownControlIds` only adds candidates and never filters, so a
 * stored entry for a plugin whose manifest has not loaded still applies.
 */
const hiddenIdsFor = (limits, knownControlIds) => {
  const candidates = validUniqueIds([
    ...CORE_CONTROL_IDS,
    ...(knownControlIds ?? []),
    ...limits.except,
  ]);
  return candidates.filter((id) => isHiddenUnder(limits, id));
};

/**
 * The in-force answer: which control ids this display must not render.
 */
export function resolveHiddenControls({
  deviceSettings,
  householdSettings,
  pinExists,
  knownControlIds,
} = {}) {
  if (isDisplayUnlocked({ deviceSettings, pinExists })) return [];

  const limits = normalizeControlLimits(deviceSettings?.[CONTROL_LIMITS_KEY])
    ?? householdDefaultLimits(householdSettings);

  // Nothing configured anywhere, or nothing readable: hide nothing.
  if (limits === null) return [];

  return hiddenIdsFor(limits, knownControlIds);
}

/** Membership test, tolerant of a caller that has not resolved anything yet. */
export function isControlHidden(hiddenIds, controlId) {
  if (!Array.isArray(hiddenIds) || typeof controlId !== 'string') return false;
  return hiddenIds.includes(controlId);
}

/**
 * Which named preset a configuration is, for the editor's radio group.
 *
 * Decided from `mode` and whether `except` is empty, never from `except.length`:
 * a count cannot distinguish a set from its size, so any configuration naming as
 * many controls as the catalog holds would read as Wall display.
 *
 * Unreadable or absent input reports fullControl — identical in force (hide
 * nothing), and the editor needs a selected radio. The inherit-vs-configured
 * distinction is carried by editorState's `inheriting` flag.
 */
export function presetNameFor(limits) {
  const normalized = normalizeControlLimits(limits);
  if (normalized === null) return 'fullControl';
  if (normalized.except.length > 0) return 'custom';
  return normalized.mode === 'hideAll' ? 'wallDisplay' : 'fullControl';
}

/**
 * Set one control's hidden state, returning a new configuration. Never mutates its
 * input, and sorts, so two equivalent configurations compare equal rather than one
 * rendering as "Custom". Only a literal `true` hides.
 */
export function toggleControl(limits, controlId, hidden) {
  const base = normalizeControlLimits(limits) ?? CONTROL_PRESETS.fullControl;
  const except = new Set(base.except);

  // Only a literal true hides. The id belongs in `except` whenever the mode
  // alone would give the wrong answer — asked of the accessor rather than
  // re-derived, so the inversion still lives in exactly one place.
  if (isValidControlId(controlId)) {
    const wantHidden = hidden === true;
    if (isHiddenUnder({ mode: base.mode, except: [] }, controlId) !== wantHidden) {
      except.add(controlId);
    } else {
      except.delete(controlId);
    }
  }

  return { mode: base.mode, except: sortIds(except) };
}

/**
 * What the admin form should draw — the CONFIGURED state, never the in-force
 * one.
 *
 * It cannot see the device blob or the PIN status, by design: an exempt display
 * hides nothing in force, and drawing that in an editable switch would contradict
 * what is saved for it.
 *
 * `knownControlIds` is admissible because a catalog is not in-force state — it
 * cannot make this describe anything but the configuration. Without it
 * `hiddenIds` could not name a plugin control, pushing the mode inversion back out
 * to every caller.
 *
 * `own === null` means the display inherits: the form shows what it would
 * inherit and `inheriting: true` tells the caller to render it read-only.
 */
export function editorState({ own, inherited, knownControlIds } = {}) {
  const ownLimits = normalizeControlLimits(own);
  const effective = ownLimits
    ?? normalizeControlLimits(inherited)
    ?? CONTROL_PRESETS.fullControl;

  return {
    inheriting: ownLimits === null,
    mode: effective.mode,
    hiddenIds: hiddenIdsFor(effective, knownControlIds),
    preset: presetNameFor(effective),
  };
}

/**
 * Would this household default take controls away from a display that inherits it?
 * hideAll always counts, even with everything excepted, because it covers controls
 * that do not exist yet.
 */
export function defaultWouldRestrict({ deviceSettings, nextDefault, pinExists } = {}) {
  if (hasOwnLimits(deviceSettings)) return false;
  if (isDisplayUnlocked({ deviceSettings, pinExists })) return false;

  const limits = normalizeControlLimits(nextDefault);
  if (limits === null) return false;

  return limits.mode === 'hideAll' || limits.except.length > 0;
}

/**
 * Write one display's configuration; null retracts it back to inheriting, since PATCH
 * merges and there is no delete route.
 *
 * `limits` is sent as given rather than normalized, so a caller's typo cannot become a
 * silent retraction. Returns the merged blob the route echoes back, `{}` if it carries
 * none, so a caller that just saved need not re-read.
 */
export async function saveDisplayLimits(apiBaseUrl, deviceName, limits) {
  const { data } = await axios.patch(
    `${apiBaseUrl}/api/devices/${encodeURIComponent(deviceName)}/settings`,
    { [CONTROL_LIMITS_KEY]: limits === undefined ? null : limits },
  );
  return isPlainObject(data) ? data : {};
}

/**
 * Write the household default, stringified because settings values are TEXT and
 * better-sqlite3 cannot bind an object.
 *
 * Returns the normalized value written, not the server's word for it: POST
 * /api/settings echoes only `{success, message}`, and the read path applies the same
 * normalization.
 */
export async function saveHouseholdDefaultLimits(apiBaseUrl, limits) {
  const value = JSON.stringify(limits === undefined ? null : limits);

  await axios.post(`${apiBaseUrl}/api/settings`, {
    key: CONTROL_LIMITS_DEFAULT_KEY,
    value,
  });

  return normalizeControlLimits(value);
}

/**
 * Read every display's state for the admin overview, keyed by device name.
 *
 * Settled rather than raced: one display we cannot read must not cost the admin the
 * whole table. `settings` is the whole blob because the caller needs it for
 * `isDisplayUnlocked`, and fetching it separately would be a request per display.
 *
 * A failed read is `{limits: null, settingsRead: false, settings: null}` — null, not
 * `{}`, because an empty blob reads as unlocked-by-omission rather than unknown.
 *
 * `settings` is the whole device blob, not just the controlLimits key, because
 * the blob is what isDisplayUnlocked needs: a remote display that remembers the
 * admin PIN is exempt, so its saved configuration is not in effect, and the form
 * has to be able to say so. Returning only `limits` would leave the caller able
 * to check that for the display the admin is sitting at and nothing else — or
 * force a second GET per display, which is the 2N request pattern this function
 * exists to avoid. The response already carries it; discarding it was the bug.
 *
 * `settings: null` on a failed read, never `{}` — "reached, and stores nothing"
 * and "could not read" are the same pair of facts `settingsRead` distinguishes, and
 * an empty blob would make a display look unlocked-by-omission rather than
 * unknown.
 */
export async function fetchAllDisplayLimits(apiBaseUrl, deviceNames) {
  const names = Array.isArray(deviceNames) ? deviceNames : [];

  const results = await Promise.allSettled(names.map((name) => axios.get(
    `${apiBaseUrl}/api/devices/${encodeURIComponent(name)}/settings`,
  )));

  const stateByDevice = {};
  names.forEach((name, index) => {
    const result = results[index];
    if (result.status !== 'fulfilled') {
      stateByDevice[name] = { limits: null, settingsRead: false, settings: null };
      return;
    }

    // `{}` rather than the raw body when the response carries no object, so
    // callers that spread `settings` are not handed a string or an array.
    const settings = isPlainObject(result.value?.data) ? result.value.data : {};
    stateByDevice[name] = {
      limits: normalizeControlLimits(settings[CONTROL_LIMITS_KEY]),
      settingsRead: true,
      settings,
    };
  });
  return stateByDevice;
}
