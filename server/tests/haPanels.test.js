// Home Assistant panels (issue #252): the rules a panel is held to. Every
// refusal here is something the server enforces, whatever a panel asks.
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../services/haPanels');

const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });
const light = st('light.kitchen', 'on', { brightness: 128, supported_color_modes: ['brightness'] });
const onOffLight = st('light.porch', 'off', { supported_color_modes: ['onoff'] });
const shade = st('cover.shade', 'open', { current_position: 100, supported_features: 15 });
const garage = st('cover.garage', 'closed', { device_class: 'garage', supported_features: 3 });
const lock = st('lock.front', 'locked');
const thermostat = st('climate.hall', 'heat', { temperature: 70, min_temp: 45, max_temp: 90, hvac_modes: ['off', 'heat'], supported_features: 1 });

const recipe = (tiles) => ({ name: 'Kitchen', tiles });
const tile = (id, entities, extra = {}) => ({ id, entities, ...extra });

test('a well-formed recipe passes and is normalized', () => {
  const r = recipe([
    tile('a', ['light.kitchen'], { label: ' Lights ', icon: 'bulb', size: '2x1', hold: true }),
    tile('b', ['sensor.temp'], { showState: false, when: { entity: 'person.sam', states: ['home'] } }),
    tile('c', ['switch.coffee'], { icon: '☕' }),
  ]);
  assert.deepEqual(rules.validateRecipe(r), []);
  const n = rules.normalizeRecipe(r);
  assert.equal(n.layout, 'grid');
  assert.equal(n.columns, 'auto');
  assert.equal(n.tiles[0].label, 'Lights');
  assert.equal(n.tiles[1].showState, false);
  assert.equal(n.tiles[2].size, '1x1');
});

test('recipes that could do harm or break the template are refused', () => {
  const errorsFor = (r) => rules.validateRecipe(r);
  assert.ok(errorsFor(null).length);
  assert.ok(errorsFor({ tiles: [tile('a', ['light.kitchen'])] }).some((e) => /name/.test(e)));
  assert.ok(errorsFor(recipe([])).some((e) => /at least one tile/.test(e)));
  assert.ok(errorsFor(recipe([tile('a', ['notify.everyone'])])).some((e) => /not an entity a panel can show/.test(e)));
  assert.ok(errorsFor(recipe([tile('a', ['light.Kitchen'])])).length, 'entity ids are lowercase');
  assert.ok(errorsFor(recipe([tile('a', ['light.kitchen', 'switch.coffee'])])).some((e) => /one kind/.test(e)));
  assert.ok(errorsFor(recipe([tile('a', ['light.a']), tile('a', ['light.b'])])).some((e) => /used twice/.test(e)));
  assert.ok(errorsFor(recipe([tile('a', ['light.a'], { icon: '<img src=x onerror=alert(1)>' })])).some((e) => /icon/.test(e)));
  assert.ok(errorsFor(recipe([tile('a', ['light.a'], { size: '3x3' })])).length);
  assert.ok(errorsFor(recipe([tile('a', ['light.a'], { when: { entity: 'person.sam', states: [] } })])).length);
  assert.ok(errorsFor(recipe(Array.from({ length: 49 }, (_, i) => tile(`t${i}`, ['light.a'])))).some((e) => /at most 48/.test(e)));
});

test('access follows the recipe: view-only tiles and conditions are read, not operated', () => {
  const access = rules.accessFromRecipe(recipe([
    tile('a', ['light.kitchen']),
    tile('b', ['lock.front'], { view: true }),
    tile('c', ['switch.coffee'], { when: { entity: 'person.sam', states: ['home'] } }),
  ]));
  assert.deepEqual([...access.read].sort(), ['light.kitchen', 'lock.front', 'person.sam', 'switch.coffee']);
  assert.deepEqual([...access.control].sort(), ['light.kitchen', 'switch.coffee']);
});

test('an action is turned into exactly one service call, values clamped', () => {
  const access = { read: new Set(['light.kitchen', 'cover.shade', 'climate.hall']), control: new Set(['light.kitchen', 'cover.shade', 'climate.hall']) };
  assert.deepEqual(rules.resolveAction({ access, entityId: 'light.kitchen', action: 'brightness', value: 140, state: light }),
    { domain: 'light', service: 'turn_on', data: { brightness_pct: 100, entity_id: 'light.kitchen' }, opens: false });
  assert.equal(rules.resolveAction({ access, entityId: 'light.kitchen', action: 'brightness', value: 0, state: light }).service, 'turn_off');
  assert.deepEqual(rules.resolveAction({ access, entityId: 'cover.shade', action: 'position', value: -5, state: shade }).data, { position: 0, entity_id: 'cover.shade' });
  assert.equal(rules.resolveAction({ access, entityId: 'climate.hall', action: 'temperature', value: 200, state: thermostat }).data.temperature, 90);
  assert.equal(rules.resolveAction({ access, entityId: 'climate.hall', action: 'hvac_mode', value: 'heat', state: thermostat }).service, 'set_hvac_mode');
});

test('a panel cannot reach past its recipe or past what an entity can do', () => {
  const access = { read: new Set(['light.kitchen', 'lock.front', 'light.porch']), control: new Set(['light.kitchen', 'light.porch']) };
  const refusal = (args) => {
    try {
      rules.resolveAction({ access, ...args });
      return null;
    } catch (error) {
      return error.status;
    }
  };
  assert.equal(refusal({ entityId: 'switch.garage_heater', action: 'turn_on', state: st('switch.garage_heater', 'off') }), 403, 'not on the panel');
  assert.equal(refusal({ entityId: 'lock.front', action: 'unlock', state: lock }), 403, 'view only');
  assert.equal(refusal({ entityId: 'light.kitchen', action: 'delete', state: light }), 400, 'not an action');
  assert.equal(refusal({ entityId: 'light.kitchen', action: 'constructor', state: light }), 400, 'no prototype lookups');
  assert.equal(refusal({ entityId: 'light.porch', action: 'brightness', value: 50, state: onOffLight }), 400, 'cannot dim');
  assert.equal(refusal({ entityId: 'light.kitchen', action: 'toggle', state: null }), 404, 'gone from Home Assistant');
  assert.equal(refusal({ entityId: 'light.kitchen', action: 'brightness', value: 'bright', state: light }), 400);
  const thermostatAccess = { read: new Set(['climate.hall']), control: new Set(['climate.hall']) };
  assert.throws(() => rules.resolveAction({ access: thermostatAccess, entityId: 'climate.hall', action: 'hvac_mode', value: 'dry', state: thermostat }), /hvac_mode must be one of/);
});

test('unlocking, disarming and opening a garage are the actions that open up the home', () => {
  const all = (id) => ({ read: new Set([id]), control: new Set([id]) });
  const opens = (id, action, state, value) => rules.resolveAction({ access: all(id), entityId: id, action, state, value }).opens;
  assert.equal(opens('lock.front', 'unlock', lock), true);
  assert.equal(opens('lock.front', 'lock', lock), false);
  assert.equal(opens('cover.garage', 'open', garage), true);
  assert.equal(opens('cover.garage', 'close', garage), false);
  assert.equal(opens('cover.shade', 'open', shade), false, 'a shade is not a door');
  const alarm = st('alarm_control_panel.home', 'armed_away', { supported_features: 3 });
  assert.equal(opens('alarm_control_panel.home', 'disarm', alarm), true);
  assert.equal(opens('alarm_control_panel.home', 'arm_home', st('alarm_control_panel.home', 'disarmed', { supported_features: 3 })), false);
  assert.equal(rules.isSensitive('cover.garage', garage), true);
  assert.equal(rules.isSensitive('cover.shade', shade), false);
});

test('a panel reads only the attributes its tiles use', () => {
  const filtered = rules.filterState(st('media_player.tv', 'playing', {
    friendly_name: 'TV', media_title: 'News', entity_picture: '/api/media_player_proxy/tv?token=abc', access_token: 'abc', supported_features: 1,
  }));
  assert.deepEqual(Object.keys(filtered.attributes).sort(), ['friendly_name', 'media_title', 'supported_features']);
  assert.equal(filtered.sensitive, false);
  assert.equal(rules.filterState(null), null);
});

test('the default tile follows what the entity supports', () => {
  assert.equal(rules.defaultControl('light.kitchen', light).kind, 'dimmer');
  assert.equal(rules.defaultControl('light.porch', onOffLight).kind, 'toggle');
  assert.equal(rules.defaultControl('cover.shade', shade).kind, 'cover-slider');
  assert.equal(rules.defaultControl('cover.garage', garage).kind, 'cover');
  assert.equal(rules.defaultControl('sensor.temp', st('sensor.temp', '20')).kind, 'sensor');
});

test('hand-written plugins declare their entities in the manifest', () => {
  assert.deepEqual(rules.validateManifestAccess({ entities: ['light.kitchen', 'sensor.temp'] }), []);
  assert.ok(rules.validateManifestAccess({ entities: [] }).length);
  assert.ok(rules.validateManifestAccess({ entities: ['shell_command.reboot'] }).length);
  assert.ok(rules.validateManifestAccess({ entities: ['light.a'], control: 'yes' }).length);
  const readOnly = rules.accessFromManifest({ entities: ['light.a'], control: false });
  assert.equal(readOnly.read.has('light.a'), true);
  assert.equal(readOnly.control.size, 0);
});

test('panel plugin ids are slugs, unique against those taken', () => {
  assert.equal(rules.panelPluginId('Kitchen & Living Room'), 'ha-kitchen-living-room');
  assert.equal(rules.panelPluginId('Kitchen', new Set(['ha-kitchen'])), 'ha-kitchen-2');
  assert.equal(rules.panelPluginId('!!!'), 'ha-panel');
  const manifest = rules.panelManifest('ha-kitchen', { name: 'Kitchen' });
  assert.deepEqual(manifest.events, ['ha.state']);
  assert.equal(manifest.hideableControls[0].id, 'operate');
});
