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
  assert.deepEqual(rules.validateRecipe(recipe([tile('a', ['media_player.k'], { size: 'fx1' }), tile('b', ['climate.h'], { size: 'fx2' })])), [], 'long tiles take the whole width');
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

test('a panel keeps the size picked for it, down to one grid square', () => {
  const base = [tile('a', ['light.kitchen'])];
  assert.deepEqual(rules.validateRecipe({ ...recipe(base), widget: { w: 1, h: 1 } }), []);
  assert.deepEqual(rules.normalizeRecipe({ ...recipe(base), widget: { w: 3, h: 2 } }).widget, { w: 3, h: 2 });
  assert.equal(rules.normalizeRecipe(recipe(base)).widget, undefined, 'no size unless one was picked');
  for (const widget of [{ w: 0, h: 1 }, { w: 13, h: 1 }, { w: 1, h: 13 }, { w: 1.5, h: 2 }, { w: '2', h: 2 }, [2, 2]]) {
    assert.ok(rules.validateRecipe({ ...recipe(base), widget }).some((e) => /widget/.test(e)), JSON.stringify(widget));
  }
  const manifest = rules.panelManifest('ha-kitchen', rules.normalizeRecipe({ ...recipe(base), widget: { w: 2, h: 3 } }));
  assert.deepEqual(manifest.size, { minWidth: 1, minHeight: 1, width: 2, height: 3 });
  assert.deepEqual(rules.panelManifest('ha-kitchen', rules.normalizeRecipe(recipe(base))).size, { minWidth: 1, minHeight: 1 });
});

test('a panel may pick the bold look and turn its moving icons off', () => {
  const base = [tile('a', ['light.kitchen'])];
  assert.equal(rules.normalizeRecipe(recipe(base)).style, 'classic', 'classic unless asked');
  assert.equal(rules.normalizeRecipe(recipe(base)).animate, true, 'icons move unless turned off');
  const bold = { ...recipe(base), style: 'bold', animate: false };
  assert.deepEqual(rules.validateRecipe(bold), []);
  assert.equal(rules.normalizeRecipe(bold).style, 'bold');
  assert.equal(rules.normalizeRecipe(bold).animate, false);
  assert.ok(rules.validateRecipe({ ...recipe(base), style: 'neon' }).some((e) => /style/.test(e)));
  assert.ok(rules.validateRecipe({ ...recipe(base), animate: 'yes' }).some((e) => /animate/.test(e)));
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
  // The picture's address carries a token: only a tag that changes with it.
  assert.deepEqual(Object.keys(filtered.attributes).sort(), ['friendly_name', 'media_art', 'media_title', 'supported_features']);
  assert.ok(!JSON.stringify(filtered).includes('abc'), 'no token, no proxy address');
  assert.equal(filtered.sensitive, false);
  assert.equal(rules.filterState(null), null);
});

test('the default tile follows what the entity supports', () => {
  assert.equal(rules.defaultControl('light.kitchen', light).kind, 'dimmer');
  assert.equal(rules.defaultControl('light.porch', onOffLight).kind, 'toggle');
  const fan = (step) => st('fan.hall', 'on', { percentage: 33, supported_features: 1, ...(step ? { percentage_step: step } : {}) });
  assert.equal(rules.defaultControl('fan.hall', fan(100 / 3)).kind, 'fan', 'a fan with a few speeds steps through them');
  assert.equal(rules.defaultControl('fan.hall', fan(100 / 6)).kind, 'fan');
  assert.equal(rules.defaultControl('fan.hall', fan(100 / 8)).kind, 'dimmer', 'one with many speeds keeps the slider');
  assert.equal(rules.defaultControl('fan.hall', fan(1)).kind, 'dimmer');
  assert.equal(rules.defaultControl('fan.hall', fan()).kind, 'dimmer', 'and so does one that does not say');
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

const music = st('media_player.kitchen', 'paused', { supported_features: 16384 | 1 | 512 | 32768 | 2097152 });
const plainSpeaker = st('media_player.radio', 'paused', { supported_features: 16384 | 1 });
const musicAccess = { read: new Set(['media_player.kitchen', 'media_player.radio']), control: new Set(['media_player.kitchen', 'media_player.radio']) };
const playAction = (entityId, value, state) => rules.resolveAction({ access: musicAccess, entityId, action: 'play_media', value, state });

test('shuffle is on or off, for a player that can shuffle', () => {
  const call = rules.resolveAction({ access: musicAccess, entityId: 'media_player.kitchen', action: 'shuffle', value: true, state: music });
  assert.deepEqual([call.service, call.data], ['shuffle_set', { shuffle: true, entity_id: 'media_player.kitchen' }]);
  assert.throws(() => rules.resolveAction({ access: musicAccess, entityId: 'media_player.kitchen', action: 'shuffle', value: 'yes', state: music }), /true or false/);
  assert.throws(() => rules.resolveAction({ access: musicAccess, entityId: 'media_player.radio', action: 'shuffle', value: true, state: plainSpeaker }), /cannot shuffle/);
});

test('play_media plays only what came from the library, now rather than queued', () => {
  const item = { media_content_id: 'library://playlist/1', media_content_type: 'playlist', fromLibrary: true };
  const call = playAction('media_player.kitchen', item, music);
  assert.equal(call.service, 'play_media');
  assert.deepEqual(call.data, { media_content_id: 'library://playlist/1', media_content_type: 'playlist', enqueue: 'replace', entity_id: 'media_player.kitchen' });
  // A panel never names a content id itself: a stream address, or the same
  // object without the route's mark, is refused.
  assert.throws(() => playAction('media_player.kitchen', 'http://evil.example/stream.mp3', music), /library/);
  assert.throws(() => playAction('media_player.kitchen', { media_content_id: 'http://evil.example/a.mp3', media_content_type: 'music' }, music), /library/);
  assert.throws(() => playAction('media_player.kitchen', { ...item, fromLibrary: 'true' }, music), /library/);
  assert.throws(() => playAction('media_player.radio', item, plainSpeaker), /cannot play from its library/);
  const noEnqueue = st('media_player.kitchen', 'paused', { supported_features: 512 });
  assert.equal(playAction('media_player.kitchen', item, noEnqueue).data.enqueue, undefined, 'enqueue only where the player supports it');
});

test('seek jumps within the playing song, never past its end', () => {
  const seekable = st('media_player.kitchen', 'playing', { supported_features: 2 | 1, media_duration: 240 });
  const seek = (value, state = seekable) => rules.resolveAction({ access: musicAccess, entityId: 'media_player.kitchen', action: 'seek', value, state });
  assert.deepEqual([seek(61.26).service, seek(61.26).data], ['media_seek', { seek_position: 61.3, entity_id: 'media_player.kitchen' }]);
  assert.equal(seek(999).data.seek_position, 240);
  assert.equal(seek(-5).data.seek_position, 0);
  assert.throws(() => seek('soon'), /seconds/);
  assert.throws(() => seek(10, music), /cannot jump/);
});

test('play_pause pauses a playing player and plays any other, by what it reports', () => {
  const access = rules.accessFromRecipe({ tiles: [{ id: 't', entities: ['media_player.k'] }] });
  const press = (state, features) => rules.resolveAction({ access, entityId: 'media_player.k', action: 'play_pause', state: st('media_player.k', state, { supported_features: features }) }).service;
  assert.equal(press('playing', 1 | 16384), 'media_pause');
  assert.equal(press('paused', 1 | 16384), 'media_play');
  assert.equal(press('idle', 16384), 'media_play');
  assert.equal(press('playing', 4096 | 16384), 'media_stop');
  assert.throws(() => press('playing', 16384), /cannot pause/);
  assert.throws(() => press('paused', 1), /cannot play/);
});

test('join and unjoin group speakers that can be grouped, with a checked list', () => {
  const access = rules.accessFromRecipe({ tiles: [{ id: 't', entities: ['media_player.k'] }] });
  const act = (action, value, features = 524288) => rules.resolveAction({ access, entityId: 'media_player.k', action, value, state: st('media_player.k', 'playing', { supported_features: features }) });
  assert.deepEqual(act('join', { members: ['media_player.den'], checked: true }).data, { group_members: ['media_player.den'], entity_id: 'media_player.k' });
  assert.equal(act('unjoin').service, 'unjoin');
  assert.throws(() => act('join', ['media_player.den']), /speakers to group/);
  assert.throws(() => act('join', { members: [], checked: true }), /speakers to group/);
  assert.throws(() => act('join', { members: ['media_player.den'], checked: true }, 1), /cannot be grouped/);
  assert.throws(() => act('unjoin', undefined, 1), /cannot be grouped/);
  assert.deepEqual(rules.filterState(st('media_player.k', 'playing', { group_members: ['media_player.k', 'media_player.den'] })).attributes.group_members,
    ['media_player.k', 'media_player.den']);
});

test('a music player shows its album and shuffle, and a picture tag', () => {
  const filtered = rules.filterState(st('media_player.kitchen', 'playing', {
    media_title: 'Harvest Moon', media_artist: 'Neil Young', media_album_name: 'Harvest Moon', shuffle: true,
    entity_picture: '/api/media_player_proxy/media_player.kitchen?token=t&cache=1', media_content_id: 'library://track/9',
    media_duration: 312, media_position: 41.5, media_position_updated_at: '2026-10-11T12:00:00+00:00',
  }));
  assert.deepEqual([filtered.attributes.media_duration, filtered.attributes.media_position, filtered.attributes.media_position_updated_at],
    [312, 41.5, '2026-10-11T12:00:00+00:00']);
  assert.equal(filtered.attributes.media_album_name, 'Harvest Moon');
  assert.equal(filtered.attributes.shuffle, true);
  assert.match(filtered.attributes.media_art, /^[\w-]{12}$/);
  assert.equal(filtered.attributes.media_content_id, undefined);
  assert.equal(rules.filterState(st('media_player.kitchen', 'idle', {})).attributes.media_art, null);
});

test('a stream address given as the title loses its sign-in', () => {
  const title = (media_title) => rules.filterState(st('media_player.kitchen', 'playing', { media_title })).attributes.media_title;
  assert.equal(title('http://jelly.local:8096/Audio/t1/stream.mp3?audioCodec=mp3&api_key=secret#x'), 'http://jelly.local:8096/Audio/t1/stream.mp3');
  assert.equal(title('https://user:pw@radio.example/live'), 'https://radio.example/live');
  assert.equal(title('Harvest Moon? (Live)'), 'Harvest Moon? (Live)');
});

test('whole-domain grants: safe domains only, read and operated alike', () => {
  const manifest = { settings: [{ key: 'server', type: 'string' }, { key: 'local', type: 'string', scope: 'device' }] };
  assert.deepEqual(rules.validateManifestAccess({ domains: ['media_player'] }), []);
  assert.deepEqual(rules.validateManifestAccess({ domains: ['media_player'], playUrlsFrom: 'server' }, manifest), []);
  assert.ok(rules.validateManifestAccess({}).length, 'needs entities or domains');
  for (const domain of ['lock', 'alarm_control_panel', 'cover', 'camera', 'shell_command']) {
    assert.ok(rules.validateManifestAccess({ domains: [domain] }).length, domain);
  }
  assert.ok(rules.validateManifestAccess({ domains: ['media_player'], playUrlsFrom: 'missing' }, manifest).length);
  assert.ok(rules.validateManifestAccess({ domains: ['media_player'], playUrlsFrom: 'local' }, manifest).length, 'a device setting');

  const access = rules.accessFromManifest({ entities: ['light.desk'], domains: ['media_player'] });
  assert.equal(rules.canRead(access, 'media_player.anything'), true);
  assert.equal(rules.canControl(access, 'media_player.anything'), true);
  assert.equal(rules.canRead(access, 'light.desk'), true);
  assert.equal(rules.canRead(access, 'light.other'), false);
  const readOnly = rules.accessFromManifest({ domains: ['media_player'], control: false });
  assert.equal(rules.canControl(readOnly, 'media_player.anything'), false);
  // A panel's recipe grants no domains.
  assert.equal(rules.canRead(rules.accessFromRecipe({ tiles: [{ id: 'a', entities: ['light.a'] }] }), 'media_player.x'), false);
});

test('play_url takes only an address the route checked', () => {
  const speaker = st('media_player.speaker', 'idle', { supported_features: 512 | 2097152 });
  const access = rules.accessFromManifest({ domains: ['media_player'] });
  const call = (value) => rules.resolveAction({ access, entityId: 'media_player.speaker', action: 'play_url', value, state: speaker });
  assert.throws(() => call({ url: 'http://x/a.mp3' }), /media server/, 'not marked as checked');
  assert.deepEqual(call({ url: 'http://x/a.mp3', fromPluginServer: true }).data, { media_content_id: 'http://x/a.mp3', media_content_type: 'music', enqueue: 'replace', entity_id: 'media_player.speaker' });
  assert.equal(call({ url: 'http://x/a.mp3', fromPluginServer: true, enqueue: 'add' }).data.enqueue, 'add');
  assert.throws(() => call({ url: 'http://x/a.mp3', fromPluginServer: true, enqueue: 'shuffle' }), /enqueue/);
  const noQueue = st('media_player.speaker', 'idle', { supported_features: 512 });
  assert.throws(() => rules.resolveAction({ access, entityId: 'media_player.speaker', action: 'play_url', value: { url: 'http://x', fromPluginServer: true, enqueue: 'add' }, state: noQueue }), /cannot queue/);
});
