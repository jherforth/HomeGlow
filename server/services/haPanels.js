// Home Assistant panels (issue #252): the rules.
//
// A panel is a recipe (which entities, which tiles, in what order) that one
// built-in template draws. Everything here is pure: what a recipe may hold,
// which actions each kind of entity allows and with what values, which
// attributes a panel may read, and which actions are sensitive. The server
// enforces all of it, so a panel (or anything else on the network) can only
// do what its recipe offers: there is no "call any service".
//
// Hand-written plugins get the same access by declaring their entities in
// their manifest (`homeAssistant.entities`); the same rules apply.

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;
const TILE_ID = /^[a-z0-9]{1,16}$/;
const MAX_TILES = 48;
const MAX_TILE_ENTITIES = 8;
const MAX_MANIFEST_ENTITIES = 64;
const MAX_LABEL = 40;
const TILE_SIZES = ['1x1', '2x1', '1x2', '2x2'];
const LAYOUTS = ['grid', 'list'];
const COLUMNS = ['auto', 1, 2, 3, 4, 5, 6];

// The icons the template draws (server/ha-panels/template.html, ICONS).
const ICON_NAMES = [
  'bulb', 'lamp', 'ceiling', 'strip', 'plug', 'power', 'fan', 'tv', 'speaker', 'music',
  'shade', 'blinds', 'curtain', 'garage', 'gate', 'door', 'window', 'lock', 'shield', 'thermometer',
  'snowflake', 'fire', 'droplet', 'sun', 'moon', 'sparkles', 'home', 'coffee', 'bed', 'sofa',
  'kitchen', 'washer', 'car', 'tree', 'pool', 'camera', 'bell', 'robot', 'gauge', 'battery',
];
// An icon is one of the names above, or a short emoji or symbol (no markup:
// it is drawn as text, but there is no reason to accept anything else).
const EMOJI_ICON = /^[^\s<>&"'`=;{}\\a-zA-Z0-9]{1,8}$/u;

// Supported-feature bits, from Home Assistant's constants.
const COVER = { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8 };
const FAN = { SET_SPEED: 1 };
const CLIMATE = { TARGET_TEMPERATURE: 1 };
const MEDIA = { PAUSE: 1, VOLUME_SET: 4, PREVIOUS_TRACK: 16, NEXT_TRACK: 32, PLAY: 16384 };
const VACUUM = { PAUSE: 4, RETURN_HOME: 16, START: 8192 };
const ALARM = { ARM_HOME: 1, ARM_AWAY: 2 };

const has = (state, bit) => (Number(state?.attributes?.supported_features) & bit) === bit;
const domainOf = (entityId) => String(entityId).split('.')[0];

const DIMMABLE_MODES = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white'];
const lightCanDim = (state) => {
  const modes = state?.attributes?.supported_color_modes;
  return Array.isArray(modes) && modes.some((mode) => DIMMABLE_MODES.includes(mode));
};
const lightHasColorTemp = (state) => {
  const modes = state?.attributes?.supported_color_modes;
  return Array.isArray(modes) && modes.includes('color_temp');
};

const isGarage = (state) => ['garage', 'gate'].includes(state?.attributes?.device_class);

/** Locks, alarms, and garage doors and gates. */
function isSensitive(entityId, state) {
  const domain = domainOf(entityId);
  return domain === 'lock' || domain === 'alarm_control_panel' || (domain === 'cover' && isGarage(state));
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const numberIn = (value, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return clamp(n, min, max);
};

class ActionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const turnOnOff = (domain) => ({
  toggle: () => ({ domain, service: 'toggle' }),
  turn_on: () => ({ domain, service: 'turn_on' }),
  turn_off: () => ({ domain, service: 'turn_off' }),
});

/**
 * What each domain allows. Each action is (state, value) -> { domain,
 * service, data }, refusing a value it cannot accept and clamping the rest
 * into the entity's own range. `opens` marks the actions that open up the
 * home (unlock, disarm, open a garage door), which PIN protection covers.
 */
const DOMAINS = {
  light: {
    actions: {
      ...turnOnOff('light'),
      brightness: (state, value) => {
        const pct = numberIn(value, 0, 100);
        if (pct === null) throw new ActionError('brightness needs a number from 0 to 100');
        if (!lightCanDim(state)) throw new ActionError('This light cannot dim');
        return pct === 0
          ? { domain: 'light', service: 'turn_off' }
          : { domain: 'light', service: 'turn_on', data: { brightness_pct: Math.round(pct) } };
      },
      color_temp: (state, value) => {
        if (!lightHasColorTemp(state)) throw new ActionError('This light has no color temperature');
        const min = Number(state.attributes.min_color_temp_kelvin) || 2000;
        const max = Number(state.attributes.max_color_temp_kelvin) || 6500;
        const kelvin = numberIn(value, min, max);
        if (kelvin === null) throw new ActionError('color_temp needs a number of kelvin');
        return { domain: 'light', service: 'turn_on', data: { color_temp_kelvin: Math.round(kelvin) } };
      },
    },
    attributes: ['brightness', 'color_mode', 'supported_color_modes', 'color_temp_kelvin', 'min_color_temp_kelvin', 'max_color_temp_kelvin'],
  },
  switch: { actions: turnOnOff('switch'), attributes: [] },
  input_boolean: { actions: turnOnOff('input_boolean'), attributes: [] },
  fan: {
    actions: {
      ...turnOnOff('fan'),
      percentage: (state, value) => {
        if (!has(state, FAN.SET_SPEED)) throw new ActionError('This fan has no speed');
        const pct = numberIn(value, 0, 100);
        if (pct === null) throw new ActionError('percentage needs a number from 0 to 100');
        return { domain: 'fan', service: 'set_percentage', data: { percentage: Math.round(pct) } };
      },
    },
    attributes: ['percentage', 'percentage_step'],
  },
  cover: {
    actions: {
      open: () => ({ domain: 'cover', service: 'open_cover' }),
      close: () => ({ domain: 'cover', service: 'close_cover' }),
      stop: (state) => {
        if (!has(state, COVER.STOP)) throw new ActionError('This cover cannot stop');
        return { domain: 'cover', service: 'stop_cover' };
      },
      toggle: () => ({ domain: 'cover', service: 'toggle' }),
      position: (state, value) => {
        if (!has(state, COVER.SET_POSITION)) throw new ActionError('This cover has no position');
        const pct = numberIn(value, 0, 100);
        if (pct === null) throw new ActionError('position needs a number from 0 to 100');
        return { domain: 'cover', service: 'set_cover_position', data: { position: Math.round(pct) } };
      },
    },
    // Opening a garage door or gate opens up the home; opening a shade doesn't.
    opens: (action, state, value) => isGarage(state) && (action === 'open' || action === 'toggle' || (action === 'position' && Number(value) > 0)),
    attributes: ['current_position'],
  },
  scene: { actions: { run: () => ({ domain: 'scene', service: 'turn_on' }) }, attributes: [] },
  script: { actions: { run: () => ({ domain: 'script', service: 'turn_on' }) }, attributes: [] },
  button: { actions: { run: () => ({ domain: 'button', service: 'press' }) }, attributes: [] },
  input_button: { actions: { run: () => ({ domain: 'input_button', service: 'press' }) }, attributes: [] },
  climate: {
    actions: {
      temperature: (state, value) => {
        if (!has(state, CLIMATE.TARGET_TEMPERATURE)) throw new ActionError('This thermostat has no single target temperature');
        const min = Number(state.attributes.min_temp);
        const max = Number(state.attributes.max_temp);
        const temp = numberIn(value, Number.isFinite(min) ? min : 5, Number.isFinite(max) ? max : 35);
        if (temp === null) throw new ActionError('temperature needs a number');
        return { domain: 'climate', service: 'set_temperature', data: { temperature: Math.round(temp * 10) / 10 } };
      },
      hvac_mode: (state, value) => {
        const modes = Array.isArray(state?.attributes?.hvac_modes) ? state.attributes.hvac_modes : [];
        if (!modes.includes(value)) throw new ActionError(`hvac_mode must be one of: ${modes.join(', ')}`);
        return { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: value } };
      },
    },
    attributes: ['current_temperature', 'temperature', 'target_temp_low', 'target_temp_high', 'hvac_modes', 'hvac_action', 'min_temp', 'max_temp', 'target_temp_step'],
  },
  media_player: {
    actions: {
      play_pause: (state) => {
        if (!has(state, MEDIA.PAUSE) && !has(state, MEDIA.PLAY)) throw new ActionError('This player cannot play or pause');
        return { domain: 'media_player', service: 'media_play_pause' };
      },
      next: (state) => {
        if (!has(state, MEDIA.NEXT_TRACK)) throw new ActionError('This player cannot skip');
        return { domain: 'media_player', service: 'media_next_track' };
      },
      previous: (state) => {
        if (!has(state, MEDIA.PREVIOUS_TRACK)) throw new ActionError('This player cannot go back');
        return { domain: 'media_player', service: 'media_previous_track' };
      },
      volume: (state, value) => {
        if (!has(state, MEDIA.VOLUME_SET)) throw new ActionError('This player has no volume');
        const pct = numberIn(value, 0, 100);
        if (pct === null) throw new ActionError('volume needs a number from 0 to 100');
        return { domain: 'media_player', service: 'volume_set', data: { volume_level: Math.round(pct) / 100 } };
      },
    },
    attributes: ['media_title', 'media_artist', 'volume_level', 'is_volume_muted'],
  },
  lock: {
    actions: {
      lock: () => ({ domain: 'lock', service: 'lock' }),
      unlock: () => ({ domain: 'lock', service: 'unlock' }),
    },
    opens: (action) => action === 'unlock',
    attributes: [],
  },
  alarm_control_panel: {
    actions: {
      arm_home: (state) => {
        if (!has(state, ALARM.ARM_HOME)) throw new ActionError('This alarm has no home mode');
        return { domain: 'alarm_control_panel', service: 'alarm_arm_home' };
      },
      arm_away: (state) => {
        if (!has(state, ALARM.ARM_AWAY)) throw new ActionError('This alarm has no away mode');
        return { domain: 'alarm_control_panel', service: 'alarm_arm_away' };
      },
      disarm: () => ({ domain: 'alarm_control_panel', service: 'alarm_disarm' }),
    },
    opens: (action) => action === 'disarm',
    attributes: ['code_arm_required', 'code_format'],
  },
  vacuum: {
    actions: {
      start: (state) => {
        if (!has(state, VACUUM.START)) throw new ActionError('This vacuum cannot start');
        return { domain: 'vacuum', service: 'start' };
      },
      pause: (state) => {
        if (!has(state, VACUUM.PAUSE)) throw new ActionError('This vacuum cannot pause');
        return { domain: 'vacuum', service: 'pause' };
      },
      dock: (state) => {
        if (!has(state, VACUUM.RETURN_HOME)) throw new ActionError('This vacuum cannot go home');
        return { domain: 'vacuum', service: 'return_to_base' };
      },
    },
    attributes: ['battery_level', 'status'],
  },
  input_select: { actions: { select: selectOption('input_select') }, attributes: ['options'] },
  select: { actions: { select: selectOption('select') }, attributes: ['options'] },
  input_number: { actions: { set: setNumber('input_number') }, attributes: ['min', 'max', 'step', 'mode', 'unit_of_measurement'] },
  number: { actions: { set: setNumber('number') }, attributes: ['min', 'max', 'step', 'mode', 'unit_of_measurement'] },
  // Shown, never operated.
  sensor: { actions: {}, attributes: ['unit_of_measurement', 'state_class'] },
  binary_sensor: { actions: {}, attributes: [] },
  camera: { actions: {}, attributes: [] },
  person: { actions: {}, attributes: [] },
  device_tracker: { actions: {}, attributes: [] },
  sun: { actions: {}, attributes: ['next_rising', 'next_setting'] },
  weather: { actions: {}, attributes: ['temperature', 'temperature_unit', 'humidity'] },
};

function selectOption(domain) {
  return (state, value) => {
    const options = Array.isArray(state?.attributes?.options) ? state.attributes.options : [];
    if (!options.includes(value)) throw new ActionError(`select needs one of: ${options.join(', ')}`);
    return { domain, service: 'select_option', data: { option: value } };
  };
}

function setNumber(domain) {
  return (state, value) => {
    const min = Number(state?.attributes?.min);
    const max = Number(state?.attributes?.max);
    const n = numberIn(value, Number.isFinite(min) ? min : -Infinity, Number.isFinite(max) ? max : Infinity);
    if (n === null) throw new ActionError('set needs a number');
    return { domain, service: 'set_value', data: { value: n } };
  };
}

// Every panel may read these, whatever the domain.
const COMMON_ATTRIBUTES = ['friendly_name', 'supported_features', 'device_class'];

const SUPPORTED_DOMAINS = Object.keys(DOMAINS);

/** Can a panel show this entity at all? */
const isSupportedEntity = (entityId) => typeof entityId === 'string' && ENTITY_ID.test(entityId) && SUPPORTED_DOMAINS.includes(domainOf(entityId));

/**
 * The tile a builder starts from for an entity, from its domain and what it
 * supports: { kind, actions } where kind is what the template draws.
 */
function defaultControl(entityId, state) {
  const domain = domainOf(entityId);
  switch (domain) {
    case 'light':
      return { kind: lightCanDim(state) ? 'dimmer' : 'toggle' };
    case 'switch':
    case 'input_boolean':
      return { kind: 'toggle' };
    case 'fan':
      return { kind: has(state, FAN.SET_SPEED) ? 'dimmer' : 'toggle' };
    case 'cover':
      return { kind: has(state, COVER.SET_POSITION) ? 'cover-slider' : 'cover' };
    case 'scene':
    case 'script':
    case 'button':
    case 'input_button':
      return { kind: 'run' };
    case 'climate':
      return { kind: 'climate' };
    case 'media_player':
      return { kind: 'media' };
    case 'lock':
      return { kind: 'lock' };
    case 'alarm_control_panel':
      return { kind: 'alarm' };
    case 'vacuum':
      return { kind: 'vacuum' };
    case 'input_select':
    case 'select':
      return { kind: 'select' };
    case 'input_number':
    case 'number':
      return { kind: 'number' };
    case 'camera':
      return { kind: 'camera' };
    default:
      return { kind: 'sensor' };
  }
}

/** Only the attributes a panel needs, for one entity's state. */
function filterState(state) {
  if (!state || typeof state !== 'object') return null;
  const domain = domainOf(state.entity_id);
  const allowed = [...COMMON_ATTRIBUTES, ...(DOMAINS[domain]?.attributes || [])];
  const attributes = {};
  for (const key of allowed) {
    if (state.attributes && state.attributes[key] !== undefined) attributes[key] = state.attributes[key];
  }
  return {
    state: state.state,
    attributes,
    last_changed: state.last_changed || null,
    sensitive: isSensitive(state.entity_id, state),
  };
}

// --- Recipes ----------------------------------------------------------------

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value) => (typeof value === 'string' ? value.trim() : value);

/**
 * Problems with a recipe, as readable strings; empty when it is valid.
 * {
 *   name, layout: 'grid'|'list', columns: 'auto'|1..6, transparent,
 *   tiles: [{ id, entities: [entity_id, ...], label, icon, size, view, hold,
 *             showState, when: { entity, states: [...], not } }]
 * }
 */
function validateRecipe(recipe) {
  const errors = [];
  if (!isObject(recipe)) return ['A panel must be an object.'];
  const name = cleanText(recipe.name);
  if (typeof name !== 'string' || !name || name.length > MAX_LABEL) errors.push(`name is required, ${MAX_LABEL} characters at most.`);
  if (recipe.layout !== undefined && !LAYOUTS.includes(recipe.layout)) errors.push('layout must be grid or list.');
  if (recipe.columns !== undefined && !COLUMNS.includes(recipe.columns)) errors.push('columns must be auto or 1 to 6.');
  if (recipe.transparent !== undefined && typeof recipe.transparent !== 'boolean') errors.push('transparent must be true or false.');
  if (!Array.isArray(recipe.tiles)) return [...errors, 'tiles must be a list.'];
  if (recipe.tiles.length === 0) errors.push('A panel needs at least one tile.');
  if (recipe.tiles.length > MAX_TILES) errors.push(`A panel may have at most ${MAX_TILES} tiles.`);
  const ids = new Set();
  recipe.tiles.forEach((tile, index) => {
    const where = `tiles[${index}]`;
    if (!isObject(tile)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    if (typeof tile.id !== 'string' || !TILE_ID.test(tile.id)) errors.push(`${where}.id must be a short lowercase id.`);
    else if (ids.has(tile.id)) errors.push(`${where}.id ${tile.id} is used twice.`);
    else ids.add(tile.id);
    if (!Array.isArray(tile.entities) || tile.entities.length === 0 || tile.entities.length > MAX_TILE_ENTITIES) {
      errors.push(`${where}.entities must list 1 to ${MAX_TILE_ENTITIES} entities.`);
    } else {
      tile.entities.forEach((entityId) => {
        if (!isSupportedEntity(entityId)) errors.push(`${where}: ${JSON.stringify(entityId)} is not an entity a panel can show.`);
      });
      // One tile drives several entities together, so they must be alike.
      const domains = new Set(tile.entities.map(domainOf));
      if (domains.size > 1) errors.push(`${where}: the entities on one tile must be of one kind (${[...domains].join(', ')}).`);
    }
    const label = cleanText(tile.label);
    if (label !== undefined && (typeof label !== 'string' || label.length > MAX_LABEL)) errors.push(`${where}.label must be ${MAX_LABEL} characters at most.`);
    if (tile.icon !== undefined && tile.icon !== '' && !(ICON_NAMES.includes(tile.icon) || (typeof tile.icon === 'string' && EMOJI_ICON.test(tile.icon)))) {
      errors.push(`${where}.icon must be one of the panel icons or an emoji.`);
    }
    if (tile.size !== undefined && !TILE_SIZES.includes(tile.size)) errors.push(`${where}.size must be one of ${TILE_SIZES.join(', ')}.`);
    ['view', 'hold', 'showState'].forEach((key) => {
      if (tile[key] !== undefined && typeof tile[key] !== 'boolean') errors.push(`${where}.${key} must be true or false.`);
    });
    if (tile.when !== undefined) {
      const when = tile.when;
      if (!isObject(when) || !isSupportedEntity(when.entity)) errors.push(`${where}.when.entity must be an entity.`);
      else if (!Array.isArray(when.states) || when.states.length === 0 || when.states.length > 8 || when.states.some((s) => typeof s !== 'string' || s.length > 64)) {
        errors.push(`${where}.when.states must list 1 to 8 states.`);
      } else if (when.not !== undefined && typeof when.not !== 'boolean') errors.push(`${where}.when.not must be true or false.`);
    }
  });
  return errors;
}

/** A recipe with its text trimmed and defaults filled in, ready to store. */
function normalizeRecipe(recipe) {
  return {
    name: cleanText(recipe.name),
    layout: recipe.layout || 'grid',
    columns: recipe.columns ?? 'auto',
    transparent: recipe.transparent === true,
    tiles: recipe.tiles.map((tile) => ({
      id: tile.id,
      entities: [...new Set(tile.entities)],
      ...(cleanText(tile.label) ? { label: cleanText(tile.label) } : {}),
      ...(tile.icon ? { icon: tile.icon } : {}),
      size: tile.size || '1x1',
      ...(tile.view ? { view: true } : {}),
      ...(tile.hold ? { hold: true } : {}),
      showState: tile.showState !== false,
      ...(tile.when ? { when: { entity: tile.when.entity, states: [...tile.when.states], ...(tile.when.not ? { not: true } : {}) } } : {}),
    })),
  };
}

/**
 * What a recipe lets a panel touch: every entity it may read (tiles and
 * their conditions) and the ones it may operate (tiles not set to view only).
 */
function accessFromRecipe(recipe) {
  const read = new Set();
  const control = new Set();
  for (const tile of recipe?.tiles || []) {
    for (const entityId of tile.entities || []) {
      read.add(entityId);
      if (!tile.view) control.add(entityId);
    }
    if (tile.when?.entity) read.add(tile.when.entity);
  }
  return { read, control };
}

/** Problems with a hand-written plugin's `homeAssistant` manifest block. */
function validateManifestAccess(block) {
  if (!isObject(block)) return ['homeAssistant must be an object.'];
  const errors = [];
  if (!Array.isArray(block.entities) || block.entities.length === 0 || block.entities.length > MAX_MANIFEST_ENTITIES) {
    errors.push(`homeAssistant.entities must list 1 to ${MAX_MANIFEST_ENTITIES} entities.`);
  } else {
    block.entities.forEach((entityId) => {
      if (!isSupportedEntity(entityId)) errors.push(`homeAssistant.entities: ${JSON.stringify(entityId)} is not a supported entity.`);
    });
  }
  if (block.control !== undefined && typeof block.control !== 'boolean') errors.push('homeAssistant.control must be true or false.');
  return errors;
}

/** What a hand-written plugin's manifest lets it touch. */
function accessFromManifest(block) {
  const read = new Set(Array.isArray(block?.entities) ? block.entities : []);
  return { read, control: block?.control === false ? new Set() : new Set(read) };
}

/**
 * Check one action against the access a panel has, and turn it into the
 * Home Assistant service call. Throws ActionError (403 for what the panel may
 * not do, 400 for what no entity can do, 404 for an entity Home Assistant no
 * longer has). Returns { domain, service, data, opens }.
 */
function resolveAction({ access, entityId, action, value, state }) {
  if (!access.read.has(entityId)) throw new ActionError(`${entityId} is not on this panel.`, 403);
  if (!access.control.has(entityId)) throw new ActionError(`${entityId} is view only on this panel.`, 403);
  if (!state) throw new ActionError(`Home Assistant has no ${entityId}.`, 404);
  const domain = domainOf(entityId);
  const rules = DOMAINS[domain];
  // Own actions only: `constructor` and the like must not reach a prototype.
  const build = rules && Object.prototype.hasOwnProperty.call(rules.actions, action) ? rules.actions[action] : null;
  if (typeof build !== 'function') throw new ActionError(`${String(action).slice(0, 40)} is not something a ${domain} can do here.`, 400);
  const call = build(state, value);
  return {
    domain: call.domain,
    service: call.service,
    data: { ...(call.data || {}), entity_id: entityId },
    opens: !!(rules.opens && rules.opens(action, state, value)),
  };
}

/** A slug for a panel's plugin id: ha-<name>, unique against `taken`. */
function panelPluginId(name, taken = new Set()) {
  const base = `ha-${String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'panel'}`;
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** The manifest a panel's plugin row carries. */
function panelManifest(pluginId, recipe) {
  return {
    manifestVersion: 1,
    id: pluginId,
    name: recipe.name,
    description: 'A Home Assistant panel made in Admin → Dashboard → Home Assistant.',
    author: 'HomeGlow',
    category: 'household',
    apiVersion: 'v1',
    events: ['ha.state'],
    // A display can show a panel without operating it (Control Limits).
    hideableControls: [{ id: 'operate', label: 'Operate Home Assistant devices' }],
  };
}

module.exports = {
  ICON_NAMES,
  accessFromManifest,
  accessFromRecipe,
  defaultControl,
  domainOf,
  filterState,
  isSensitive,
  isSupportedEntity,
  normalizeRecipe,
  panelManifest,
  panelPluginId,
  resolveAction,
  validateManifestAccess,
  validateRecipe,
};
