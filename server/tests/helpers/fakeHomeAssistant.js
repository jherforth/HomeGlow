// A stand-in Home Assistant for the panel tests (issue #252): the REST API
// HomeGlow calls, and the WebSocket API's auth, subscribe_entities (with its
// compressed diffs) and the three registries. Service calls change the fake's
// states the way a real home would, and every call is recorded.
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

const AREAS = [{ area_id: 'kitchen', name: 'Kitchen' }, { area_id: 'living_room', name: 'Living room' }, { area_id: 'outside', name: 'Outside' }];
const DEVICES = [{ id: 'dev-shade', area_id: 'living_room' }, { id: 'dev-speaker', area_id: 'living_room' }];
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
      case 'media_player.media_play_pause': return [setState(id, state.state === 'playing' ? 'paused' : 'playing')];
      case 'media_player.volume_set': return [setState(id, state.state, { volume_level: data.volume_level })];
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
      const stateMatch = url.pathname.match(/^\/api\/states\/(.+)$/);
      if (req.method === 'GET' && stateMatch) {
        const state = states.get(decodeURIComponent(stateMatch[1]));
        return state ? send(200, state) : send(404, { message: 'Entity not found.' });
      }
      const serviceMatch = url.pathname.match(/^\/api\/services\/([a-z_]+)\/([a-z_]+)$/);
      if (req.method === 'POST' && serviceMatch) {
        const data = body ? JSON.parse(body) : {};
        calls.push({ domain: serviceMatch[1], service: serviceMatch[2], data });
        return send(200, runService(serviceMatch[1], serviceMatch[2], data));
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
        case 'config/entity_registry/list': reply(ENTITY_REGISTRY); return;
        case 'config/device_registry/list': reply(DEVICES); return;
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
