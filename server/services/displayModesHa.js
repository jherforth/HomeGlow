// Display modes and Home Assistant (client/src/utils/displayModes.js).
//
// A display's modes live in its device settings under `displayModes`. With
// Home Assistant connected, a display can have:
//   - a mode helper: an input_select whose options are "Automatic", "Normal"
//     and the display's mode names. Home Assistant automations set it to pick
//     a mode; the wall sets it when someone pins one.
//   - a current-mode sensor HomeGlow posts (sensor.homeglow_<name>_mode), so
//     automations know which mode is showing.
//   - per-mode triggers and conditions on entities (a phone's next alarm, an
//     entity in a state, people at home), and people whose arrival wakes the
//     screen.
//
// Only the entities a display's modes name are ever read here, and only the
// display's own helper and sensor are ever written.

const HELPER_AUTOMATIC = 'Automatic';
const HELPER_NORMAL = 'Normal';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const { isEntityId, trimState, listEntities } = require('./haEntities');

/** A Home Assistant-style slug: lower case, runs of anything else one _. */
function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'homeglow_display';
}

/** The helper's options for these modes: Automatic, Normal, then each name. */
function helperOptions(displayModes) {
  const names = (Array.isArray(displayModes?.modes) ? displayModes.modes : [])
    .map((mode) => (typeof mode?.name === 'string' ? mode.name.trim() : ''))
    .filter((name) => name && name !== HELPER_AUTOMATIC && name !== HELPER_NORMAL);
  return [HELPER_AUTOMATIC, HELPER_NORMAL, ...new Set(names)];
}

/** The display's Home Assistant settings, cleaned. */
function haSettings(displayModes) {
  const ha = isObject(displayModes?.ha) ? displayModes.ha : {};
  return {
    helper: isEntityId(ha.helper) && ha.helper.startsWith('input_select.') ? ha.helper : null,
    helperId: typeof ha.helperId === 'string' ? ha.helperId : null,
    title: typeof ha.title === 'string' && ha.title.trim() ? ha.title.trim().slice(0, 60) : null,
    report: ha.report !== false,
    wake: Array.isArray(ha.wake) ? ha.wake.filter(isEntityId).slice(0, 20) : [],
  };
}

// Which helper a display writes to is chosen only through POST
// /modes/ha/helper, which needs the admin PIN. Any other write of a display's
// settings keeps the link it has, or a settings save could point /sync and
// /select at any input_select in Home Assistant.
const HELPER_LINK_FIELDS = ['helper', 'helperId', 'title'];

/** `next` settings with `displayModes.ha`'s helper link taken from `existing`. */
function keepHelperLink(next, existing) {
  if (!isObject(next) || !isObject(next.displayModes)) return next;
  const before = isObject(existing?.displayModes?.ha) ? existing.displayModes.ha : {};
  const linked = HELPER_LINK_FIELDS.filter((field) => before[field] !== undefined);
  if (!isObject(next.displayModes.ha) && linked.length === 0) return next;
  const ha = isObject(next.displayModes.ha) ? { ...next.displayModes.ha } : {};
  HELPER_LINK_FIELDS.forEach((field) => {
    if (before[field] !== undefined) ha[field] = before[field];
    else delete ha[field];
  });
  return { ...next, displayModes: { ...next.displayModes, ha } };
}

/** The sensor HomeGlow posts the showing mode to, named after the helper. */
function sensorIdFor(ha) {
  if (!ha.helper) return null;
  const base = ha.helper.split('.')[1].replace(/_mode$/, '');
  return `sensor.${base.startsWith('homeglow') ? base : `homeglow_${base}`}_showing`.slice(0, 80);
}

/**
 * Every entity a display reads from Home Assistant: its modes' helper,
 * triggers, conditions and wake list, and its takeovers.
 */
function entityRefs(displayModes) {
  const ids = new Set();
  const ha = haSettings(displayModes);
  if (ha.helper) ids.add(ha.helper);
  ha.wake.forEach((id) => ids.add(id));
  for (const mode of Array.isArray(displayModes?.modes) ? displayModes.modes : []) {
    if (isEntityId(mode?.alarm?.entity)) ids.add(mode.alarm.entity);
    if (isEntityId(mode?.when?.entity)) ids.add(mode.when.entity);
    (Array.isArray(mode?.onlyHome) ? mode.onlyHome : []).filter(isEntityId).forEach((id) => ids.add(id));
  }
  // Takeovers (client/src/utils/takeovers.js): what starts each one.
  for (const rule of Array.isArray(displayModes?.takeovers) ? displayModes.takeovers : []) {
    if (rule?.enabled !== false && isEntityId(rule?.entity)) ids.add(rule.entity);
  }
  return [...ids].slice(0, 64);
}

// The entity lists for the Admin pickers.
const KINDS = {
  helper: (id) => id.startsWith('input_select.'),
  alarm: (id, state) => id.startsWith('sensor.') && (state?.attributes?.device_class === 'timestamp' || /alarm/.test(id)),
  people: (id) => /^(person|device_tracker|zone)\./.test(id),
  any: () => true,
};

function listModeEntities(states, kind) {
  return listEntities(states, {
    match: KINDS[kind] || KINDS.any,
    // Phones' next-alarm sensors first in the alarm list.
    rank: (e) => (kind === 'alarm' && !/next_alarm/.test(e.entity_id) ? 1 : 0),
  });
}

module.exports = {
  HELPER_AUTOMATIC,
  HELPER_NORMAL,
  slugify,
  helperOptions,
  haSettings,
  keepHelperLink,
  sensorIdFor,
  entityRefs,
  trimState,
  listEntities: listModeEntities,
  isEntityId,
};
