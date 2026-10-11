// Home Assistant panels (issue #252): the live link.
//
// One WebSocket to Home Assistant for the whole house, subscribed to the
// entities any panel uses (`subscribe_entities`), holding their latest state
// in memory. Panels poll HomeGlow every 2 seconds and are answered from here,
// so polling costs Home Assistant nothing.
//
// When the link is down (Home Assistant restarting, a certificate the
// WebSocket won't accept), states come from the REST API instead, each
// answer reused for 2 seconds, so panels keep working, a little less live.
// With no panels there is no link at all.
//
// Actions go over REST (POST /api/services/...), whose reply carries the
// states that changed; they land in the cache at once.

const homeAssistant = require('./homeAssistant');
const { decrypt } = require('../utils/encryption');

const REST_TTL_MS = 2000;
const ENTITY_LIST_TTL_MS = 30000;
const COMMAND_TIMEOUT_MS = 10000;
const RETRY_SECONDS = [1, 2, 5, 10, 30, 60];

const toIso = (seconds) => (Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null);

/** A state from subscribe_entities' compressed form, in the REST shape. */
function expandCompressed(entityId, compressed) {
  return {
    entity_id: entityId,
    state: compressed.s,
    attributes: compressed.a || {},
    last_changed: toIso(compressed.lc),
    last_updated: toIso(compressed.lu ?? compressed.lc),
  };
}

/** The WebSocket address for a Home Assistant base URL. */
function websocketUrl(baseUrl) {
  return `${baseUrl.replace(/^http/i, 'ws')}/api/websocket`;
}

class HaLive {
  constructor({
    db,
    ha = homeAssistant,
    decryptToken = decrypt,
    WebSocketImpl = globalThis.WebSocket,
    onChange = () => {},
    now = Date.now,
  } = {}) {
    this.db = db;
    this.ha = ha;
    this.decryptToken = decryptToken;
    this.WebSocketImpl = WebSocketImpl;
    this.onChange = onChange;
    this.now = now;
    this.cache = new Map(); // entity_id -> { state, at }
    this.watched = new Set();
    this.subscribed = new Set();
    this.ws = null;
    this.status = 'idle'; // idle | connecting | live | down
    this.authError = null;
    this.nextId = 1;
    this.subscriptionId = null;
    this.pending = new Map();
    this.retry = 0;
    this.retryTimer = null;
    this.units = null;
    this.allIds = null;
  }

  /** Watch these entities (every panel's, together). */
  setWatched(entityIds) {
    const next = new Set(entityIds);
    const same = next.size === this.watched.size && [...next].every((id) => this.watched.has(id));
    if (same && (this.ws || next.size === 0)) return;
    this.watched = next;
    if (next.size === 0) {
      this.close();
      return;
    }
    if (this.status === 'live') this.subscribe();
    else this.connect();
  }

  /** Drop the link and start again: the URL or token changed. */
  reset() {
    this.close();
    this.cache.clear();
    this.units = null;
    this.allIds = null;
    this.registry = null;
    this.authError = null;
    this.retry = 0;
    if (this.watched.size) this.connect();
  }

  close() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.subscribed = new Set();
    this.subscriptionId = null;
    this.status = 'idle';
    for (const { reject } of this.pending.values()) reject(new Error('The Home Assistant link closed.'));
    this.pending.clear();
    if (ws) {
      try { ws.close(); } catch { /* already closed */ }
    }
  }

  connect() {
    if (this.ws || !this.WebSocketImpl || !this.watched.size) return;
    const { baseUrl, tokenEnc } = this.ha.getConfig(this.db);
    if (!baseUrl || !tokenEnc) return;
    let ws;
    try {
      ws = new this.WebSocketImpl(websocketUrl(baseUrl));
    } catch (error) {
      console.warn('Home Assistant panels: could not open the live link:', error.message);
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    this.status = 'connecting';
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch {
        return;
      }
      if (ws === this.ws) this.handle(message);
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      this.subscribed = new Set();
      this.subscriptionId = null;
      this.status = 'down';
      for (const { reject } of this.pending.values()) reject(new Error('The Home Assistant link closed.'));
      this.pending.clear();
      this.scheduleRetry();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (!this.watched.size) return;
    // A rejected token won't fix itself; try again rarely.
    const seconds = this.authError ? 300 : RETRY_SECONDS[Math.min(this.retry, RETRY_SECONDS.length - 1)];
    this.retry += 1;
    this.retryTimer = setTimeout(() => this.connect(), seconds * 1000);
    this.retryTimer.unref?.();
  }

  send(message) {
    try {
      this.ws?.send(JSON.stringify(message));
    } catch (error) {
      console.warn('Home Assistant panels: could not send on the live link:', error.message);
    }
  }

  handle(message) {
    switch (message.type) {
      case 'auth_required': {
        const { tokenEnc } = this.ha.getConfig(this.db);
        this.send({ type: 'auth', access_token: this.decryptToken(tokenEnc) });
        return;
      }
      case 'auth_ok':
        this.status = 'live';
        this.authError = null;
        this.retry = 0;
        this.subscribe();
        return;
      case 'auth_invalid':
        this.authError = message.message || 'Home Assistant rejected the access token.';
        console.warn(`Home Assistant panels: ${this.authError}`);
        try { this.ws?.close(); } catch { /* closing */ }
        return;
      case 'result': {
        const waiting = this.pending.get(message.id);
        if (!waiting) return;
        this.pending.delete(message.id);
        if (message.success) waiting.resolve(message.result);
        else waiting.reject(new Error(message.error?.message || 'Home Assistant refused the request.'));
        return;
      }
      case 'event':
        if (message.id === this.subscriptionId) this.applyCompressed(message.event || {});
        return;
      default:
    }
  }

  subscribe() {
    if (this.subscriptionId !== null) {
      this.send({ id: this.nextId++, type: 'unsubscribe_events', subscription: this.subscriptionId });
    }
    const ids = [...this.watched];
    this.subscriptionId = this.nextId++;
    this.subscribed = new Set(ids);
    this.send({ id: this.subscriptionId, type: 'subscribe_entities', entity_ids: ids });
  }

  /** subscribe_entities sends whole states (a), changes (c) and removals (r). */
  applyCompressed(event) {
    const changed = [];
    const at = this.now();
    for (const [entityId, compressed] of Object.entries(event.a || {})) {
      this.cache.set(entityId, { state: expandCompressed(entityId, compressed), at });
      changed.push(entityId);
    }
    for (const [entityId, diff] of Object.entries(event.c || {})) {
      const previous = this.cache.get(entityId)?.state;
      if (!previous) continue;
      const next = { ...previous, attributes: { ...previous.attributes } };
      const plus = diff['+'] || {};
      if (plus.s !== undefined) next.state = plus.s;
      if (plus.a) Object.assign(next.attributes, plus.a);
      if (plus.lc !== undefined) next.last_changed = toIso(plus.lc);
      if (plus.lu !== undefined || plus.lc !== undefined) next.last_updated = toIso(plus.lu ?? plus.lc);
      for (const key of diff['-']?.a || []) delete next.attributes[key];
      this.cache.set(entityId, { state: next, at });
      changed.push(entityId);
    }
    for (const entityId of event.r || []) {
      this.cache.set(entityId, { state: null, at });
      changed.push(entityId);
    }
    if (changed.length) {
      try {
        this.onChange(changed);
      } catch (error) {
        console.error('Home Assistant panels: change listener failed:', error);
      }
    }
  }

  isLive(entityId) {
    return this.status === 'live' && this.subscribed.has(entityId);
  }

  /**
   * The current state of each entity (null for one Home Assistant doesn't
   * have): { states, live, error }. `error` is set when Home Assistant could
   * not be asked; whatever is known is still returned.
   */
  async getStates(entityIds) {
    const states = {};
    const missing = [];
    const now = this.now();
    for (const entityId of entityIds) {
      const entry = this.cache.get(entityId);
      if (entry && (this.isLive(entityId) || now - entry.at < REST_TTL_MS)) states[entityId] = entry.state;
      else missing.push(entityId);
    }
    let error = null;
    await Promise.all(missing.map(async (entityId) => {
      try {
        const state = await this.ha.homeAssistantFetch(this.db, 'GET', `/api/states/${encodeURIComponent(entityId)}`);
        this.cache.set(entityId, { state, at: this.now() });
        states[entityId] = state;
      } catch (err) {
        if (err.status === 404) {
          this.cache.set(entityId, { state: null, at: this.now() });
          states[entityId] = null;
        } else {
          error = error || err;
          const stale = this.cache.get(entityId);
          if (stale) states[entityId] = stale.state;
        }
      }
    }));
    return { states, live: this.status === 'live', error };
  }

  /** Call a service; the states it changed go straight into the cache. */
  async callService(domain, service, data, options) {
    const changed = await this.ha.homeAssistantFetch(this.db, 'POST', `/api/services/${domain}/${service}`, data, options);
    if (Array.isArray(changed)) {
      const at = this.now();
      const ids = [];
      for (const state of changed) {
        if (state?.entity_id) {
          this.cache.set(state.entity_id, { state, at });
          ids.push(state.entity_id);
        }
      }
      if (ids.length) {
        try { this.onChange(ids); } catch { /* listener errors are not the caller's */ }
      }
    }
    return changed;
  }

  /**
   * Every entity id in these domains, for a plugin granted a domain whole
   * (all the house's media players, say). Read from /api/states at most
   * every 30 seconds; the last list stands if Home Assistant can't be asked.
   */
  async entityIdsIn(domains) {
    const wanted = new Set(domains);
    if (wanted.size === 0) return [];
    if (!this.allIds || this.now() - this.allIds.at > ENTITY_LIST_TTL_MS) {
      try {
        const states = await this.ha.homeAssistantFetch(this.db, 'GET', '/api/states');
        if (Array.isArray(states)) {
          const at = this.now();
          this.allIds = { ids: states.map((state) => state?.entity_id).filter((id) => typeof id === 'string'), at };
          // The list came with every state: keep them, as a REST read would.
          for (const state of states) {
            if (state?.entity_id && !this.isLive(state.entity_id)) this.cache.set(state.entity_id, { state, at });
          }
        }
      } catch (error) {
        if (!this.allIds) throw error;
      }
    }
    return this.allIds.ids.filter((id) => wanted.has(id.split('.')[0]));
  }

  /** The ids last listed in these domains, without asking (for the watch list). */
  knownIdsIn(domains) {
    const wanted = new Set(domains);
    return (this.allIds?.ids || []).filter((id) => wanted.has(id.split('.')[0]));
  }

  /** Home Assistant's temperature unit (°C or °F), asked once. */
  async temperatureUnit() {
    if (this.units) return this.units.temperature;
    try {
      const config = await this.ha.homeAssistantFetch(this.db, 'GET', '/api/config');
      this.units = { temperature: config?.unit_system?.temperature || '°C' };
    } catch {
      return '°C';
    }
    return this.units.temperature;
  }

  /**
   * Run WebSocket commands on a short-lived connection of their own (the
   * registries, for the builder): [{ type }] -> [result | null]. Null for a
   * command Home Assistant refused, so the builder can do without areas.
   */
  /**
   * Home Assistant's entity registry, by entity id ({ platform, device_id,
   * hidden_by, disabled_by, ... }), read at most every 30 seconds; null
   * when it can't be read (no WebSocket).
   */
  async entityRegistry() {
    if (!this.registry || this.now() - this.registry.at > ENTITY_LIST_TTL_MS) {
      try {
        const [list] = await this.commands([{ type: 'config/entity_registry/list' }]);
        if (Array.isArray(list)) this.registry = { byId: new Map(list.map((entry) => [entry.entity_id, entry])), at: this.now() };
      } catch {
        // Keep the last copy, if there is one.
      }
    }
    return this.registry ? this.registry.byId : null;
  }

  async commands(list) {
    const outcomes = await this.run(list);
    return outcomes.map((outcome) => (outcome.ok ? outcome.result : null));
  }

  /**
   * One WebSocket command whose answer matters (a player's library): its
   * result, or an Error carrying Home Assistant's own message and a status.
   */
  async command(message, options) {
    const [outcome] = await this.run([message], options);
    if (outcome.ok) return outcome.result;
    const error = new Error(outcome.error || 'Home Assistant did not answer.');
    error.status = outcome.status;
    error.code = outcome.code;
    throw error;
  }

  /** [{ type, ... }] -> [{ ok, result } | { ok: false, error, status, code }]. */
  async run(list, { timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
    const fail = (error, status, code) => list.map(() => ({ ok: false, error, status, code }));
    const { baseUrl, tokenEnc } = this.ha.getConfig(this.db);
    if (!baseUrl || !tokenEnc) return fail('Home Assistant is not connected.', 503);
    if (!this.WebSocketImpl) return fail('This server cannot open a WebSocket to Home Assistant.', 503);
    return await new Promise((resolve) => {
      let ws;
      const results = list.map(() => null);
      let remaining = list.length;
      let failure = { error: 'Home Assistant did not answer in time.', status: 504 };
      const finish = () => {
        clearTimeout(timer);
        try { ws?.close(); } catch { /* closing */ }
        resolve(results.map((outcome) => outcome || { ok: false, ...failure }));
      };
      const timer = setTimeout(finish, timeoutMs);
      timer.unref?.();
      try {
        ws = new this.WebSocketImpl(websocketUrl(baseUrl));
      } catch {
        failure = { error: `Could not reach Home Assistant at ${baseUrl}.`, status: 503 };
        finish();
        return;
      }
      ws.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
        } catch {
          return;
        }
        if (message.type === 'auth_required') {
          ws.send(JSON.stringify({ type: 'auth', access_token: this.decryptToken(tokenEnc) }));
        } else if (message.type === 'auth_ok') {
          list.forEach((command, index) => ws.send(JSON.stringify({ ...command, id: index + 1 })));
        } else if (message.type === 'auth_invalid') {
          failure = { error: 'Home Assistant rejected the access token.', status: 401 };
          finish();
        } else if (message.type === 'result') {
          const index = message.id - 1;
          if (index >= 0 && index < list.length && !results[index]) {
            results[index] = message.success
              ? { ok: true, result: message.result }
              : {
                ok: false,
                error: (message.error && message.error.message) || 'Home Assistant refused that.',
                code: message.error && message.error.code,
                status: message.error && message.error.code === 'not_found' ? 404 : 400,
              };
            remaining -= 1;
            if (remaining === 0) finish();
          }
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (remaining > 0 && failure.status === 504) failure = { error: 'Home Assistant closed the connection.', status: 502 };
        finish();
      };
    });
  }

  describe() {
    return { live: this.status === 'live', watching: this.watched.size, authError: this.authError };
  }
}

module.exports = { HaLive, expandCompressed, websocketUrl, REST_TTL_MS };
