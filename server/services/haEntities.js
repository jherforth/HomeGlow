// What a display reads from Home Assistant, and the entity lists for the
// Admin pickers. Shared by Stacks (services/widgetStacksHa.js) and display
// modes (services/displayModesHa.js).

const ENTITY_ID = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
const isEntityId = (value) => typeof value === 'string' && ENTITY_ID.test(value);

/** Only what a display needs from a state: no other attributes leave here. */
function trimState(state) {
  if (!state) return null;
  const a = state.attributes || {};
  return {
    state: state.state,
    last_changed: state.last_changed || null,
    attributes: {
      friendly_name: a.friendly_name || null,
      ...(Array.isArray(a.options) ? { options: a.options } : {}),
      ...(a.device_class ? { device_class: a.device_class } : {}),
    },
  };
}

/**
 * Entities for a picker, by name. `match(id, state)` narrows the list;
 * `rank(entity)` (lower first) puts some ahead of the rest.
 */
function listEntities(states, { match = () => true, rank = () => 0 } = {}) {
  return (Array.isArray(states) ? states : [])
    .filter((state) => isEntityId(state?.entity_id) && match(state.entity_id, state))
    .map((state) => ({
      entity_id: state.entity_id,
      name: state.attributes?.friendly_name || state.entity_id,
      state: state.state,
      device_class: state.attributes?.device_class || null,
      options: Array.isArray(state.attributes?.options) ? state.attributes.options : undefined,
    }))
    .sort((a, b) => (rank(a) - rank(b)) || a.name.localeCompare(b.name));
}

/**
 * The states a display asked for, and whether Home Assistant answered:
 * { connected, live, reachable, error, states }. `live` is the one
 * WebSocket (services/haLive.js); `ha` the connection settings.
 */
async function readStates({ db, live, ha, demoMode }, ids) {
  if (demoMode || !ha.isConfigured(db)) return { connected: false, states: {} };
  if (ids.length === 0) return { connected: true, live: live.describe().live, states: {} };
  const { states, live: isLive, error } = await live.getStates(ids);
  return {
    connected: true,
    live: isLive,
    reachable: !error,
    error: error ? (error.message || 'Home Assistant could not be reached.') : null,
    states: Object.fromEntries(ids.map((id) => [id, trimState(states[id])])),
  };
}

module.exports = { isEntityId, trimState, listEntities, readStates };
