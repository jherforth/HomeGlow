// A stand-in Home Assistant for the panel tests (issue #252): the REST API
// HomeGlow calls, and the WebSocket API's auth, subscribe_entities (with its
// compressed diffs), the three registries, and a music player's library
// (media_player/browse_media and search_media), and two phones' notify
// actions (GET /api/services). Service calls change the
// fake's states the way a real home would, and every call is recorded.
//
//   const ha = await startFakeHomeAssistant({ token: 'secret' });
//   ha.url, ha.calls, ha.setState(id, state, attributes), ha.close()
//
// Run on its own for a browser check: node fakeHomeAssistant.js 8123 secret

const http = require('node:http');
const crypto = require('node:crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PIXEL_PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6360f8cfc0f01f0005000201e2213cbc0000000049454e44ae426082', 'hex');

function defaultStates() {
  const s = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() });
  return [
    s('light.kitchen', 'on', { friendly_name: 'Kitchen lights', brightness: 128, supported_color_modes: ['brightness'], color_mode: 'brightness' }),
    s('light.desk', 'off', { friendly_name: 'Desk lamp', supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 }),
    s('switch.coffee', 'off', { friendly_name: 'Coffee maker', device_class: 'outlet' }),
    s('fan.bedroom', 'off', { friendly_name: 'Bedroom fan', supported_features: 1, percentage: 0 }),
    s('cover.living_shade', 'open', { friendly_name: 'Living room shade', current_position: 100, supported_features: 15 }),
    s('cover.garage_door', 'closed', { friendly_name: 'Garage door', device_class: 'garage', supported_features: 3 }),
    s('lock.front_door', 'locked', { friendly_name: 'Front door' }),
    s('alarm_control_panel.home', 'disarmed', { friendly_name: 'House alarm', supported_features: 3 }),
    s('scene.movie_night', 'scening', { friendly_name: 'Movie night' }),
    s('climate.hall', 'heat', { friendly_name: 'Hall thermostat', current_temperature: 68, temperature: 70, min_temp: 45, max_temp: 90, target_temp_step: 1, hvac_modes: ['off', 'heat', 'cool', 'heat_cool'], supported_features: 1 }),
    s('media_player.living', 'paused', { friendly_name: 'Living room speaker', media_title: 'Morning jazz', supported_features: 16384 | 1 | 4 | 32 | 16, volume_level: 0.3 }),
    // A Music Assistant player: browse, search, play from the library, shuffle.
    s('media_player.kitchen_music', 'paused', {
      friendly_name: 'Kitchen music', media_title: 'Harvest Moon', media_artist: 'Neil Young', media_album_name: 'Harvest Moon',
      entity_picture: '/api/media_player_proxy/media_player.kitchen_music?token=proxy-token&cache=abc',
      supported_features: 16384 | 1 | 2 | 4 | 32 | 16 | 512 | 32768 | 131072 | 2097152 | 4194304, volume_level: 0.4, shuffle: false,
      media_duration: 305, media_position: 84, media_position_updated_at: new Date().toISOString(),
    }),
    s('sensor.outside_temp', '54.3', { friendly_name: 'Outside', unit_of_measurement: '°F', device_class: 'temperature' }),
    s('binary_sensor.back_door', 'off', { friendly_name: 'Back door', device_class: 'door' }),
    s('person.sam', 'home', { friendly_name: 'Sam' }),
    s('input_select.house_mode', 'Home', { friendly_name: 'House mode', options: ['Home', 'Away', 'Night'] }),
    s('camera.porch', 'idle', { friendly_name: 'Porch camera' }),
    s('vacuum.robot', 'docked', { friendly_name: 'Robot vacuum', supported_features: 8192 | 4 | 16, battery_level: 90 }),
    s('switch.secret_hidden', 'off', { friendly_name: 'Hidden switch' }),
    s('automation.morning', 'on', { friendly_name: 'Morning routine' }),
  ];
}

// The music player's library, as Home Assistant's browse tree.
const node = (title, media_class, media_content_type, media_content_id, extra = {}) => ({
  title, media_class, media_content_type, media_content_id, can_play: false, can_expand: false, thumbnail: null, children_media_class: null, ...extra,
});
const LIBRARY = {
  '': node('Music Assistant', 'directory', 'music', '', {
    can_expand: true,
    children: [
      node('Playlists', 'directory', 'playlists', 'library://playlists', { can_expand: true }),
      node('Artists', 'directory', 'artists', 'library://artists', { can_expand: true }),
    ],
  }),
  'library://playlists': node('Playlists', 'directory', 'playlists', 'library://playlists', {
    can_expand: true,
    children: [
      node('Kitchen Mix', 'playlist', 'playlist', 'library://playlist/1', { can_play: true, can_expand: true, thumbnail: 'https://images.example/kitchen-mix.jpg' }),
      node('Dinner Jazz', 'playlist', 'playlist', 'library://playlist/2', { can_play: true, can_expand: true, thumbnail: '/api/media_player_proxy/media_player.kitchen_music/browse_media/playlist/2' }),
      node('Nothing to do', 'directory', 'folder', 'library://dead-end'),
      node('Sneaky', 'playlist', 'playlist', 'library://playlist/3', { can_play: true, thumbnail: 'javascript:alert(1)' }),
    ],
  }),
  'ytmusic://artist/ny': node('Neil Young', 'artist', 'artist', 'ytmusic://artist/ny', {
    can_play: true,
    can_expand: true,
    children: [
      node('Harvest', 'album', 'album', 'ytmusic://album/harvest', { can_play: true, can_expand: true }),
      node('Heart of Gold', 'track', 'track', 'ytmusic://track/hog', { can_play: true }),
    ],
  }),
  'library://playlist/1': node('Kitchen Mix', 'playlist', 'playlist', 'library://playlist/1', {
    can_play: true,
    can_expand: true,
    children: [node('Harvest Moon', 'track', 'track', 'ytmusic://track/hm', { can_play: true })],
  }),
};
const SEARCH = [
  node('Heart of Gold', 'track', 'track', 'ytmusic://track/hog', { can_play: true, thumbnail: 'https://images.example/hog.jpg' }),
  node('Neil Young', 'artist', 'artist', 'ytmusic://artist/ny', { can_play: true, can_expand: true }),
];

const AREAS = [{ area_id: 'kitchen', name: 'Kitchen' }, { area_id: 'living_room', name: 'Living room' }, { area_id: 'outside', name: 'Outside' }];
const DEVICES = [
  { id: 'dev-shade', area_id: 'living_room' },
  { id: 'dev-speaker', area_id: 'living_room' },
  // Two Companion app phones: their notify actions are below.
  { id: 'dev-pixel', name: "Sam's Pixel", manufacturer: 'Google', model: 'Pixel 8', sw_version: '15', identifiers: [['mobile_app', 'pixel-1']] },
  { id: 'dev-iphone', name: "Alex's iPhone", manufacturer: 'Apple', model: 'iPhone16,1', sw_version: '18.1', identifiers: [['mobile_app', 'iphone-1']] },
];
// What GET /api/services lists: the phones' notify actions beside other ones.
const SERVICES = [
  { domain: 'light', services: { turn_on: {}, turn_off: {}, toggle: {} } },
  { domain: 'notify', services: { notify: {}, persistent_notification: {}, send_message: {}, mobile_app_sam_s_pixel: {}, mobile_app_alex_s_iphone: {} } },
];
const ENTITY_REGISTRY = [
  { entity_id: 'light.kitchen', area_id: 'kitchen' },
  { entity_id: 'switch.coffee', area_id: 'kitchen' },
  { entity_id: 'cover.living_shade', device_id: 'dev-shade' },
  { entity_id: 'media_player.living', device_id: 'dev-speaker' },
  { entity_id: 'sensor.outside_temp', area_id: 'outside' },
  { entity_id: 'switch.secret_hidden', hidden_by: 'user' },
];

// --- A minimal WebSocket server (text frames, ping, close) -------------------

function acceptWebSocket(req, socket, onMessage) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  let buffer = Buffer.alloc(0);
  const connection = {
    open: true,
    send(text) {
      if (!connection.open) return;
      const payload = Buffer.from(text);
      let header;
      if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
      else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
      }
      socket.write(Buffer.concat([header, payload]));
    },
    close() {
      if (!connection.open) return;
      connection.open = false;
      try { socket.write(Buffer.from([0x88, 0])); } catch { /* gone */ }
      socket.end();
    },
  };
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      const maskOffset = offset;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;
      let payload = buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = buffer.subarray(maskOffset, maskOffset + 4);
        payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
      }
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x8) { connection.close(); return; }
      if (opcode === 0x9) { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (opcode === 0x1) onMessage(payload.toString('utf8'));
    }
  });
  socket.on('close', () => { connection.open = false; });
  socket.on('error', () => { connection.open = false; });
  return connection;
}

// --- The fake --------------------------------------------------------------------

async function startFakeHomeAssistant({ token = 'secret-token', port = 0, wsEnabled = true } = {}) {
  const states = new Map(defaultStates().map((state) => [state.entity_id, state]));
  const calls = [];
  const sockets = new Set();
  const subscriptions = []; // { connection, id, entityIds }
  let serviceDelayMs = 0;    // a slow speaker: service calls answer (and act) this late
  let proxyBroken = false;  // the media player proxy can't fetch a picture
  const registry = ENTITY_REGISTRY.map((entry) => ({ ...entry }));
  const proxyFetches = [];

  const compress = (state) => ({ s: state.state, a: state.attributes, lc: Date.parse(state.last_changed) / 1000 });

  function setState(entityId, nextState, attributes) {
    const previous = states.get(entityId);
    const now = new Date().toISOString();
    const next = {
      entity_id: entityId,
      state: nextState,
      attributes: attributes ? { ...(previous?.attributes || {}), ...attributes } : (previous?.attributes || {}),
      last_changed: previous && previous.state === nextState ? previous.last_changed : now,
      last_updated: now,
    };
    states.set(entityId, next);
    for (const sub of subscriptions) {
      if (!sub.connection.open || !sub.entityIds.includes(entityId)) continue;
      const plus = { s: next.state, a: next.attributes, lc: Date.parse(next.last_changed) / 1000 };
      sub.connection.send(JSON.stringify({ id: sub.id, type: 'event', event: { c: { [entityId]: { '+': plus } } } }));
    }
    return next;
  }

  // Media services and the features a player must report for each, as
  // Home Assistant checks them (media_play_pause needs both play and pause).
  const MEDIA_SERVICE_NEEDS = {
    media_play_pause: 16384 | 1, media_play: 16384, media_pause: 1, media_stop: 4096,
    media_next_track: 32, media_previous_track: 16, media_seek: 2, volume_set: 4, shuffle_set: 32768, play_media: 512,
    join: 524288, unjoin: 524288,
  };
  const refusedMedia = (domain, service, data) => {
    const needs = domain === 'media_player' ? MEDIA_SERVICE_NEEDS[service] : undefined;
    const state = states.get(data.entity_id);
    if (!needs || !state) return null;
    return (Number(state.attributes.supported_features) & needs) === needs
      ? null
      : `Entity ${data.entity_id} does not support action media_player.${service}`;
  };

  // Service calls, as a home would carry them out.
  function runService(domain, service, data) {
    const id = data.entity_id;
    const state = states.get(id);
    if (!state) return [];
    const a = state.attributes;
    const on = (attrs) => setState(id, 'on', attrs);
    switch (`${domain}.${service}`) {
      case 'light.turn_on': return [on(data.brightness_pct !== undefined ? { brightness: Math.round(data.brightness_pct * 2.55) } : data.color_temp_kelvin ? { color_temp_kelvin: data.color_temp_kelvin } : {})];
      case 'light.turn_off': case 'switch.turn_off': case 'fan.turn_off': case 'input_boolean.turn_off': return [setState(id, 'off')];
      case 'switch.turn_on': case 'fan.turn_on': case 'input_boolean.turn_on': return [on()];
      case 'light.toggle': case 'switch.toggle': case 'fan.toggle': case 'input_boolean.toggle': return [setState(id, state.state === 'on' ? 'off' : 'on')];
      case 'fan.set_percentage': return [setState(id, data.percentage > 0 ? 'on' : 'off', { percentage: data.percentage })];
      case 'cover.open_cover': return [setState(id, 'open', a.current_position !== undefined ? { current_position: 100 } : {})];
      case 'cover.close_cover': return [setState(id, 'closed', a.current_position !== undefined ? { current_position: 0 } : {})];
      case 'cover.toggle': return [setState(id, state.state === 'closed' ? 'open' : 'closed')];
      case 'cover.stop_cover': return [setState(id, state.state)];
      case 'cover.set_cover_position': return [setState(id, data.position > 0 ? 'open' : 'closed', { current_position: data.position })];
      case 'lock.lock': return [setState(id, 'locked')];
      case 'lock.unlock': return [setState(id, 'unlocked')];
      case 'alarm_control_panel.alarm_arm_home': return [setState(id, 'armed_home')];
      case 'alarm_control_panel.alarm_arm_away': return [setState(id, 'armed_away')];
      case 'alarm_control_panel.alarm_disarm': return [setState(id, 'disarmed')];
      case 'climate.set_temperature': return [setState(id, state.state, { temperature: data.temperature })];
      case 'climate.set_hvac_mode': return [setState(id, data.hvac_mode)];
      case 'media_player.media_play_pause': return [setState(id, state.state === 'playing' ? 'paused' : 'playing', { media_position_updated_at: new Date().toISOString() })];
      case 'media_player.media_play': return [setState(id, 'playing', { media_position_updated_at: new Date().toISOString() })];
      case 'media_player.media_pause': return [setState(id, 'paused', { media_position_updated_at: new Date().toISOString() })];
      case 'media_player.media_stop': return [setState(id, 'idle')];
      // A group: every member lists the leader first, then the others.
      case 'media_player.join': {
        const group = [id, ...new Set([...(a.group_members || []).filter((m) => m !== id), ...data.group_members])];
        return group.map((member) => setState(member, states.get(member)?.state || 'idle', { group_members: group }));
      }
      case 'media_player.unjoin': {
        const rest = (a.group_members || []).filter((m) => m !== id);
        return [setState(id, state.state, { group_members: [id] }),
          ...rest.map((member) => setState(member, states.get(member).state, { group_members: rest.length > 1 ? rest : [member] }))];
      }
      case 'media_player.media_seek': return [setState(id, state.state, { media_position: data.seek_position, media_position_updated_at: new Date().toISOString() })];
      case 'media_player.media_next_track': return [setState(id, state.state, { media_title: 'Heart of Gold', media_album_name: 'Harvest', media_position: 0, media_position_updated_at: new Date().toISOString() })];
      case 'media_player.media_previous_track': return [setState(id, state.state, { media_position: 0, media_position_updated_at: new Date().toISOString() })];
      case 'media_player.volume_set': return [setState(id, state.state, { volume_level: data.volume_level })];
      case 'media_player.shuffle_set': return [setState(id, state.state, { shuffle: data.shuffle })];
      case 'media_player.play_media': return [setState(id, 'playing', { media_title: data.media_content_id, entity_picture: `/api/media_player_proxy/${id}?token=proxy-token&cache=${Date.now()}` })];
      case 'input_select.select_option': return [setState(id, data.option)];
      case 'vacuum.start': return [setState(id, 'cleaning')];
      case 'vacuum.return_to_base': return [setState(id, 'returning')];
      default: return [];
    }
  }

  const server = http.createServer((req, res) => {
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { message: 'Unauthorized' });
    const url = new URL(req.url, 'http://fake');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.method === 'GET' && url.pathname === '/api/') return send(200, { message: 'API running.' });
      if (req.method === 'GET' && url.pathname === '/api/config') return send(200, { location_name: 'Fake Home', version: '2026.10.0', unit_system: { temperature: '°F' } });
      if (req.method === 'GET' && url.pathname === '/api/states') return send(200, [...states.values()]);
      if (req.method === 'GET' && url.pathname === '/api/services') return send(200, SERVICES);
      const stateMatch = url.pathname.match(/^\/api\/states\/(.+)$/);
      if (req.method === 'GET' && stateMatch) {
        const state = states.get(decodeURIComponent(stateMatch[1]));
        return state ? send(200, state) : send(404, { message: 'Entity not found.' });
      }
      const serviceMatch = url.pathname.match(/^\/api\/services\/([a-z_]+)\/([a-z_]+)$/);
      if (req.method === 'POST' && serviceMatch) {
        const data = body ? JSON.parse(body) : {};
        calls.push({ domain: serviceMatch[1], service: serviceMatch[2], data });
        if (serviceMatch[1] === 'notify' && !SERVICES.find((s) => s.domain === 'notify').services[serviceMatch[2]]) {
          return send(400, { message: `Action notify.${serviceMatch[2]} not found.` });
        }
        const refused = refusedMedia(serviceMatch[1], serviceMatch[2], data);
        if (refused) return send(400, { message: refused });
        if (serviceDelayMs) {
          setTimeout(() => send(200, runService(serviceMatch[1], serviceMatch[2], data)), serviceDelayMs);
          return undefined;
        }
        return send(200, runService(serviceMatch[1], serviceMatch[2], data));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/media_player_proxy/')) {
        proxyFetches.push(url.pathname);
        return proxyBroken ? send(500, { message: 'Error fetching image' }) : send(200, PIXEL_PNG, 'image/png');
      }
      const cameraMatch = url.pathname.match(/^\/api\/camera_proxy\/(.+)$/);
      if (req.method === 'GET' && cameraMatch) {
        return states.has(decodeURIComponent(cameraMatch[1])) ? send(200, PIXEL_PNG, 'image/png') : send(404, { message: 'Not found' });
      }
      return send(404, { message: 'Not found' });
    });
  });

  server.on('upgrade', (req, socket) => {
    if (!wsEnabled || !req.url.startsWith('/api/websocket')) {
      socket.destroy();
      return;
    }
    let authed = false;
    const connection = acceptWebSocket(req, socket, (text) => {
      let message;
      try { message = JSON.parse(text); } catch { return; }
      const reply = (result, success = true) => connection.send(JSON.stringify({ id: message.id, type: 'result', success, result }));
      if (message.type === 'auth') {
        if (message.access_token === token) {
          authed = true;
          connection.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.10.0' }));
        } else {
          connection.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token or password' }));
          connection.close();
        }
        return;
      }
      if (!authed) return;
      switch (message.type) {
        case 'subscribe_entities': {
          const ids = message.entity_ids || [...states.keys()];
          subscriptions.push({ connection, id: message.id, entityIds: ids });
          reply(null);
          const a = {};
          for (const id of ids) if (states.has(id)) a[id] = compress(states.get(id));
          connection.send(JSON.stringify({ id: message.id, type: 'event', event: { a } }));
          return;
        }
        case 'unsubscribe_events': {
          const index = subscriptions.findIndex((sub) => sub.connection === connection && sub.id === message.subscription);
          if (index !== -1) subscriptions.splice(index, 1);
          reply(null);
          return;
        }
        case 'config/area_registry/list': reply(AREAS); return;
        case 'config/entity_registry/list': reply(registry); return;
        case 'config/device_registry/list': reply(DEVICES); return;
        case 'media_player/browse_media': {
          const player = states.get(message.entity_id);
          if (!player) { connection.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code: 'entity_not_found', message: 'Entity not found' } })); return; }
          if (!(player.attributes.supported_features & 131072)) { connection.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code: 'not_supported', message: 'Player does not support browsing media' } })); return; }
          calls.push({ ws: 'browse_media', data: message });
          const found = LIBRARY[message.media_content_id || ''];
          if (!found) { connection.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code: 'not_found', message: 'Media not found' } })); return; }
          reply(found);
          return;
        }
        case 'media_player/search_media': {
          calls.push({ ws: 'search_media', data: message });
          reply({ result: SEARCH.filter((item) => item.title.toLowerCase().includes(String(message.search_query).toLowerCase().split(' ')[0])) });
          return;
        }
        default: reply(null, false);
      }
    });
    sockets.add(connection);
    connection.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.10.0' }));
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actualPort } = server.address();
  return {
    url: `http://127.0.0.1:${actualPort}`,
    token,
    calls,
    states,
    setState,
    /** Make service calls take this long, like a speaker finding a song online. */
    setServiceDelay: (ms) => { serviceDelayMs = ms; },
    /** Add or change an entity's registry entry ({ platform, device_id, hidden_by, ... }). */
    setRegistryEntry: (entityId, fields) => {
      const entry = registry.find((e) => e.entity_id === entityId);
      if (entry) Object.assign(entry, fields);
      else registry.push({ entity_id: entityId, ...fields });
    },
    /** Make the media player proxy fail, as when a picture's server is down. */
    setProxyBroken: (broken) => { proxyBroken = broken; },
    /** The pictures asked of the media player proxy, by path. */
    proxyFetches,
    /** How many live subscriptions are open (one per HomeGlow link). */
    subscriptionCount: () => subscriptions.filter((sub) => sub.connection.open).length,
    dropConnections: () => { for (const c of sockets) c.close(); },
    close: () => new Promise((resolve) => {
      for (const c of sockets) c.close();
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

module.exports = { startFakeHomeAssistant };

if (require.main === module) {
  const port = Number(process.argv[2] || 8123);
  startFakeHomeAssistant({ port, token: process.argv[3] || 'secret-token' }).then((ha) => {
    console.log(`Fake Home Assistant at ${ha.url}`);
    // Something changes now and then, as in a real home.
    setInterval(() => {
      const temp = (50 + Math.random() * 10).toFixed(1);
      ha.setState('sensor.outside_temp', temp);
    }, 15000);
  });
}
