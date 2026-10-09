// Home Assistant panels (issue #252): the live link, against a fake Home
// Assistant speaking the real REST and WebSocket protocols.
const test = require('node:test');
const assert = require('node:assert/strict');
const { HaLive, expandCompressed, websocketUrl } = require('../services/haLive');
const { startFakeHomeAssistant } = require('./helpers/fakeHomeAssistant');

// The live link uses Node's built-in WebSocket client (Node 22 and later; the
// Docker image runs 24). Without one HomeGlow falls back to REST, which the
// REST tests below cover on any version.
const needsWebSocket = typeof globalThis.WebSocket === 'function' ? {} : { skip: 'needs Node 22 or later (built-in WebSocket)' };

// A stand-in for services/homeAssistant pointed at the fake: the same calls
// the real one makes, without the database or encryption.
function haFor(fake, token = fake.token) {
  return {
    getConfig: () => ({ baseUrl: fake.url, tokenEnc: token }),
    async homeAssistantFetch(_db, method, apiPath, body) {
      const res = await fetch(`${fake.url}${apiPath}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const error = new Error(data?.message || `HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }
      return data;
    },
  };
}

const waitFor = async (check, ms = 3000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
};

test('subscribes over the WebSocket and answers from its live copy', needsWebSocket, async () => {
  const fake = await startFakeHomeAssistant();
  const changes = [];
  const live = new HaLive({ db: {}, ha: haFor(fake), decryptToken: (t) => t, onChange: (ids) => changes.push(...ids) });
  try {
    live.setWatched(['light.kitchen', 'lock.front_door']);
    assert.ok(await waitFor(() => live.describe().live && live.cache.has('light.kitchen')), 'link up');
    assert.equal(fake.subscriptionCount(), 1);

    const before = await live.getStates(['light.kitchen']);
    assert.equal(before.states['light.kitchen'].state, 'on');
    assert.equal(before.live, true);

    // A change in the home arrives without anyone asking.
    fake.setState('light.kitchen', 'off');
    assert.ok(await waitFor(() => live.cache.get('light.kitchen')?.state.state === 'off'), 'pushed change');
    assert.ok(changes.includes('light.kitchen'));
    // Brightness was in the full state and stays (the diff only carries what changed).
    assert.equal(live.cache.get('light.kitchen').state.attributes.friendly_name, 'Kitchen lights');

    // Watching another set resubscribes on the same link.
    live.setWatched(['switch.coffee']);
    assert.ok(await waitFor(() => live.cache.has('switch.coffee')));
    assert.equal(fake.subscriptionCount(), 1, 'the old subscription was dropped');

    // Nothing to watch, no link.
    live.setWatched([]);
    assert.equal(live.describe().live, false);
  } finally {
    live.close();
    await fake.close();
  }
});

test('falls back to REST when there is no WebSocket, reusing answers briefly', async () => {
  const fake = await startFakeHomeAssistant({ wsEnabled: false });
  let now = 1000;
  const live = new HaLive({ db: {}, ha: haFor(fake), decryptToken: (t) => t, now: () => now });
  try {
    live.setWatched(['light.kitchen']);
    const first = await live.getStates(['light.kitchen', 'light.nowhere']);
    assert.equal(first.states['light.kitchen'].state, 'on');
    assert.equal(first.states['light.nowhere'], null, 'missing in Home Assistant');
    assert.equal(first.live, false);

    fake.setState('light.kitchen', 'off');
    now += 500;
    assert.equal((await live.getStates(['light.kitchen'])).states['light.kitchen'].state, 'on', 'reused within 2 seconds');
    now += 2000;
    assert.equal((await live.getStates(['light.kitchen'])).states['light.kitchen'].state, 'off', 'read again after');
  } finally {
    live.close();
    await fake.close();
  }
});

test('a service call updates the copy at once from Home Assistant\'s reply', async () => {
  const fake = await startFakeHomeAssistant({ wsEnabled: false });
  const live = new HaLive({ db: {}, ha: haFor(fake), decryptToken: (t) => t });
  try {
    await live.callService('lock', 'unlock', { entity_id: 'lock.front_door' });
    assert.deepEqual(fake.calls.at(-1), { domain: 'lock', service: 'unlock', data: { entity_id: 'lock.front_door' } });
    assert.equal(live.cache.get('lock.front_door').state.state, 'unlocked');
  } finally {
    live.close();
    await fake.close();
  }
});

test('a rejected token is reported, and states still come over REST when they can', needsWebSocket, async () => {
  const fake = await startFakeHomeAssistant();
  const live = new HaLive({ db: {}, ha: haFor(fake, 'wrong'), decryptToken: (t) => t });
  try {
    live.setWatched(['light.kitchen']);
    assert.ok(await waitFor(() => !!live.describe().authError), 'auth error noticed');
    const answer = await live.getStates(['light.kitchen']);
    assert.equal(answer.error.status, 401);
  } finally {
    live.close();
    await fake.close();
  }
});

test('reconnects after the link drops', needsWebSocket, async () => {
  const fake = await startFakeHomeAssistant();
  const live = new HaLive({ db: {}, ha: haFor(fake), decryptToken: (t) => t });
  try {
    live.setWatched(['light.kitchen']);
    assert.ok(await waitFor(() => live.describe().live));
    fake.dropConnections();
    assert.ok(await waitFor(() => !live.describe().live), 'noticed the drop');
    assert.ok(await waitFor(() => live.describe().live, 4000), 'back after the first retry');
  } finally {
    live.close();
    await fake.close();
  }
});

test('reads the registries on a short connection of its own', needsWebSocket, async () => {
  const fake = await startFakeHomeAssistant();
  const live = new HaLive({ db: {}, ha: haFor(fake), decryptToken: (t) => t });
  try {
    const [areas, entities, unknown] = await live.commands([
      { type: 'config/area_registry/list' },
      { type: 'config/entity_registry/list' },
      { type: 'config/nothing_here' },
    ]);
    assert.ok(areas.some((area) => area.name === 'Kitchen'));
    assert.ok(entities.some((entry) => entry.entity_id === 'light.kitchen'));
    assert.equal(unknown, null, 'a refused command is null, not an error');
  } finally {
    live.close();
    await fake.close();
  }
});

test('the compressed state format and the WebSocket address', () => {
  const state = expandCompressed('light.a', { s: 'on', a: { brightness: 10 }, lc: 1760000000 });
  assert.equal(state.state, 'on');
  assert.equal(state.last_changed, new Date(1760000000 * 1000).toISOString());
  assert.equal(websocketUrl('https://ha.local:8123'), 'wss://ha.local:8123/api/websocket');
  assert.equal(websocketUrl('http://10.0.0.5:8123'), 'ws://10.0.0.5:8123/api/websocket');
});
