// Home Assistant panels (issue #252): the routes.
//
// Admin (the builder):
//   GET    /api/ha-panels                 panels, connection, settings
//   GET    /api/ha-panels/entities        what the picker offers, with areas
//   GET    /api/ha-panels/preview-state   states for the builder's live preview
//   GET    /api/ha-panels/history         what panels did, newest first
//   PUT    /api/ha-panels/settings        { pinProtection }
//   POST   /api/ha-panels                 { recipe } -> a new panel
//   POST   /api/ha-panels/import          { recipe, replacements } -> a new panel
//   PUT    /api/ha-panels/:id             { recipe }
//   POST   /api/ha-panels/:id/duplicate
//   DELETE /api/ha-panels/:id
//   GET    /ha-panels/preview             the template, for the builder's preview
//
// Panels (and hand-written plugins that declare `homeAssistant` in their
// manifest), under the v1 plugin contract:
//   GET  /api/plugin/v1/ha/:pluginId/state
//   POST /api/plugin/v1/ha/:pluginId/action   { entity | entities, action, value, pin, device }
//   GET  /api/plugin/v1/ha/:pluginId/camera/:entityId
//
// Every one of these is checked against the panel's own recipe (or the
// plugin's manifest): a panel reads and operates only its own entities, with
// only the actions that fit each one. The Home Assistant token never leaves
// the server.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rules = require('../services/haPanels');

const TEMPLATE_PATH = path.join(__dirname, '..', 'ha-panels', 'template.html');
const TEMPLATE_VERSION = 1;
const PIN_PROTECTION_KEY = 'HA_PANEL_PIN_PROTECTION';
const HISTORY_KEEP = 1000;
const RATE_WINDOW_MS = 1000;
const RATE_LIMIT = 10;

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const parseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

// JSON inside a <script>: nothing in it may close the tag or open a comment,
// and U+2028 and U+2029, which end a line in older script parsers, are
// escaped too. Each becomes its JSON escape (backslash, u, four hex digits).
const UNSAFE_IN_SCRIPT = new RegExp('[<' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
const escapeForScript = (c) => String.fromCharCode(92) + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0');
const scriptJson = (value) => JSON.stringify(value).replace(UNSAFE_IN_SCRIPT, escapeForScript);

/**
 * The database, looked up on each use. Routes are registered when index.js
 * loads, before the database is opened, so a handle captured then would be
 * undefined; this forwards to whatever getDb() returns at call time.
 */
function lazyDb(getDb) {
  return new Proxy({}, {
    get(_, prop) {
      const real = getDb();
      const value = real[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
}

function registerHaPanelRoutes(fastify, { db, live, ha, demoMode, installPluginRow }) {
  let templateCache = null;
  const template = () => {
    if (!templateCache || process.env.NODE_ENV === 'development') templateCache = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    return templateCache;
  };

  const demoBlocked = (reply) => {
    if (!demoMode) return false;
    reply.status(403).send({ error: 'Home Assistant is not available in the demo.' });
    return true;
  };

  const pinProtection = () => db.prepare('SELECT value FROM settings WHERE key = ?').get(PIN_PROTECTION_KEY)?.value !== 'off';

  // --- Panels in the database ------------------------------------------------

  const panelRows = () => db.prepare(`
    SELECT ha_panels.id, ha_panels.recipe_json, ha_panels.updated_at, plugins.id AS plugin_row_id,
           plugins.plugin_id, plugins.filename, plugins.name
    FROM ha_panels JOIN plugins ON plugins.id = ha_panels.plugin_row_id
    ORDER BY plugins.name COLLATE NOCASE
  `).all();

  const toPanel = (row) => ({
    id: row.id,
    pluginId: row.plugin_id,
    filename: row.filename,
    name: row.name,
    recipe: parseJson(row.recipe_json, { name: row.name, tiles: [] }),
    updatedAt: row.updated_at,
  });

  /** What a plugin may read and operate, or null for one with no access. */
  function accessFor(pluginId) {
    const row = db.prepare('SELECT id, source, manifest_json FROM plugins WHERE plugin_id = ?').get(pluginId);
    if (!row) return null;
    if (row.source === 'builder') {
      const panel = db.prepare('SELECT recipe_json FROM ha_panels WHERE plugin_row_id = ?').get(row.id);
      return panel ? rules.accessFromRecipe(parseJson(panel.recipe_json, {})) : null;
    }
    const manifest = parseJson(row.manifest_json || 'null', null);
    if (manifest?.homeAssistant && rules.validateManifestAccess(manifest.homeAssistant).length === 0) {
      return rules.accessFromManifest(manifest.homeAssistant);
    }
    return null;
  }

  /** Every entity any panel or plugin reads, so the live link watches them. */
  function watchedEntities() {
    const ids = new Set();
    for (const row of db.prepare('SELECT recipe_json FROM ha_panels').all()) {
      rules.accessFromRecipe(parseJson(row.recipe_json, {})).read.forEach((id) => ids.add(id));
    }
    for (const row of db.prepare("SELECT manifest_json FROM plugins WHERE source != 'builder' AND manifest_json LIKE '%homeAssistant%'").all()) {
      const manifest = parseJson(row.manifest_json, null);
      if (manifest?.homeAssistant && rules.validateManifestAccess(manifest.homeAssistant).length === 0) {
        rules.accessFromManifest(manifest.homeAssistant).read.forEach((id) => ids.add(id));
      }
    }
    return ids;
  }

  const refreshWatched = () => {
    if (!ha.isConfigured(db) || demoMode) {
      live.setWatched([]);
      return;
    }
    live.setWatched(watchedEntities());
  };

  // The stub a panel's plugin row stores: its manifest, for everything that
  // reads plugin rows. What is served is the template (see renderPanel).
  const stubContent = (manifest) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${manifest.name.replace(/[<&>"]/g, '')}</title>
<script type="application/json" id="homeglow-manifest">${scriptJson(manifest)}</script></head><body></body></html>`;

  function savePanel({ id, recipe }) {
    const normalized = rules.normalizeRecipe(recipe);
    return db.transaction(() => {
      if (id) {
        const existing = db.prepare('SELECT ha_panels.id, plugins.plugin_id, plugins.filename FROM ha_panels JOIN plugins ON plugins.id = ha_panels.plugin_row_id WHERE ha_panels.id = ?').get(id);
        if (!existing) return { error: 'No such panel.', status: 404 };
        // The plugin id and file stay as they were: every display's settings
        // name them, so a rename must not orphan them.
        const manifest = rules.panelManifest(existing.plugin_id, normalized);
        const installed = installPluginRow({ filename: existing.filename, fallbackName: normalized.name, content: stubContent(manifest), source: 'builder' });
        if (installed.error) return installed;
        db.prepare('UPDATE ha_panels SET recipe_json = ?, template_ver = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(JSON.stringify(normalized), TEMPLATE_VERSION, id);
        return { id };
      }
      const taken = new Set(db.prepare('SELECT plugin_id FROM plugins WHERE plugin_id IS NOT NULL').all().map((row) => row.plugin_id));
      const takenFiles = new Set(db.prepare('SELECT filename FROM plugins').all().map((row) => row.filename));
      let pluginId = rules.panelPluginId(normalized.name, taken);
      while (takenFiles.has(`${pluginId}.html`)) {
        taken.add(pluginId);
        pluginId = rules.panelPluginId(normalized.name, taken);
      }
      const filename = `${pluginId}.html`;
      const manifest = rules.panelManifest(pluginId, normalized);
      const installed = installPluginRow({ filename, fallbackName: normalized.name, content: stubContent(manifest), source: 'builder' });
      if (installed.error) return installed;
      const pluginRow = db.prepare('SELECT id FROM plugins WHERE filename = ?').get(filename);
      const result = db.prepare('INSERT INTO ha_panels (plugin_row_id, recipe_json, template_ver) VALUES (?, ?, ?)')
        .run(pluginRow.id, JSON.stringify(normalized), TEMPLATE_VERSION);
      return { id: Number(result.lastInsertRowid) };
    })();
  }

  const getPanel = (id) => {
    const row = panelRows().find((entry) => entry.id === Number(id));
    return row ? toPanel(row) : null;
  };

  /** The page a panel's plugin is served as: the template and its recipe. */
  function renderPanel(pluginRowId, pluginId) {
    const panel = db.prepare('SELECT recipe_json FROM ha_panels WHERE plugin_row_id = ?').get(pluginRowId);
    const recipe = panel ? parseJson(panel.recipe_json, null) : null;
    return renderTemplate({ recipe, pluginId, preview: false });
  }

  function renderTemplate(config) {
    const injection = `<script>window.__HA_PANEL__=${scriptJson(config)};</script>`;
    return template().replace('<!-- HA_PANEL_CONFIG -->', injection);
  }

  // --- The builder -------------------------------------------------------------

  fastify.get('/api/ha-panels', async (request, reply) => {
    try {
      return {
        panels: panelRows().map(toPanel),
        configured: ha.isConfigured(db),
        demo: !!demoMode,
        settings: { pinProtection: pinProtection() },
        pinExists: !!db.prepare('SELECT 1 FROM admin_pin WHERE id = 1').get(),
        live: live.describe(),
        icons: rules.ICON_NAMES,
      };
    } catch (error) {
      console.error('Error listing Home Assistant panels:', error);
      return reply.status(500).send({ error: 'Failed to list Home Assistant panels.' });
    }
  });

  fastify.get('/api/ha-panels/entities', async (request, reply) => {
    if (demoBlocked(reply)) return;
    try {
      const states = await ha.homeAssistantFetch(db, 'GET', '/api/states');
      const [areaList, entityList, deviceList] = await live.commands([
        { type: 'config/area_registry/list' },
        { type: 'config/entity_registry/list' },
        { type: 'config/device_registry/list' },
      ]);
      const areas = Array.isArray(areaList) ? areaList.map((area) => ({ id: area.area_id, name: area.name })) : [];
      const areaName = new Map(areas.map((area) => [area.id, area.name]));
      const deviceArea = new Map((Array.isArray(deviceList) ? deviceList : []).map((device) => [device.id, device.area_id]));
      const registry = new Map((Array.isArray(entityList) ? entityList : []).map((entry) => [entry.entity_id, entry]));
      const entities = (Array.isArray(states) ? states : [])
        .filter((state) => rules.isSupportedEntity(state?.entity_id))
        .filter((state) => {
          const entry = registry.get(state.entity_id);
          return !entry || (!entry.hidden_by && !entry.disabled_by);
        })
        .map((state) => {
          const entry = registry.get(state.entity_id);
          const areaId = entry?.area_id || (entry?.device_id ? deviceArea.get(entry.device_id) : null) || null;
          return {
            entity_id: state.entity_id,
            name: state.attributes?.friendly_name || state.entity_id,
            domain: rules.domainOf(state.entity_id),
            state: state.state,
            areaId,
            area: areaId ? areaName.get(areaId) || null : null,
            deviceClass: state.attributes?.device_class || null,
            sensitive: rules.isSensitive(state.entity_id, state),
            control: rules.defaultControl(state.entity_id, state).kind,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return { entities, areas: areas.sort((a, b) => a.name.localeCompare(b.name)), registries: Array.isArray(areaList) };
    } catch (error) {
      console.error('Error listing Home Assistant entities:', error.message);
      return reply.status(error.status && error.status < 600 ? error.status : 502).send({ error: error.message || 'Could not read Home Assistant.' });
    }
  });

  // States for the builder's preview, before a panel is saved: read only,
  // and only the attributes a panel would see.
  fastify.get('/api/ha-panels/preview-state', async (request, reply) => {
    if (demoBlocked(reply)) return;
    const ids = String(request.query?.entities || '').split(',').filter(rules.isSupportedEntity).slice(0, 64);
    try {
      const { states, live: isLive, error } = await live.getStates(ids);
      return {
        entities: Object.fromEntries(ids.map((id) => [id, rules.filterState(states[id])])),
        live: isLive,
        unit: await live.temperatureUnit(),
        ...(error ? { error: error.message } : {}),
      };
    } catch (error) {
      return reply.status(502).send({ error: error.message });
    }
  });

  fastify.get('/api/ha-panels/history', async (request) => {
    const limit = Math.min(200, Math.max(1, Number(request.query?.limit) || 50));
    const rows = db.prepare(`
      SELECT ha_actions.*, plugins.name AS panel
      FROM ha_actions LEFT JOIN plugins ON plugins.plugin_id = ha_actions.plugin_id
      ORDER BY ha_actions.id DESC LIMIT ?
    `).all(limit);
    return {
      actions: rows.map((row) => ({
        at: row.at, panel: row.panel || row.plugin_id, pluginId: row.plugin_id, device: row.device_name,
        entity: row.entity_id, action: row.action, ok: !!row.ok, error: row.error,
      })),
    };
  });

  fastify.put('/api/ha-panels/settings', async (request, reply) => {
    if (demoBlocked(reply)) return;
    const { pinProtection: on } = request.body || {};
    if (typeof on !== 'boolean') return reply.status(400).send({ error: 'pinProtection must be true or false.' });
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(PIN_PROTECTION_KEY, on ? 'on' : 'off');
    return { settings: { pinProtection: on } };
  });

  const writePanel = async (request, reply, id) => {
    if (demoBlocked(reply)) return undefined;
    const recipe = request.body?.recipe;
    const errors = rules.validateRecipe(recipe);
    if (errors.length) return reply.status(400).send({ error: errors.join(' '), errors });
    const saved = savePanel({ id, recipe });
    if (saved.error) return reply.status(saved.status || 400).send({ error: saved.error });
    refreshWatched();
    return { panel: getPanel(saved.id) };
  };

  fastify.post('/api/ha-panels', async (request, reply) => writePanel(request, reply, null));
  fastify.put('/api/ha-panels/:id', async (request, reply) => writePanel(request, reply, Number(request.params.id)));

  fastify.post('/api/ha-panels/:id/duplicate', async (request, reply) => {
    if (demoBlocked(reply)) return;
    const panel = getPanel(request.params.id);
    if (!panel) return reply.status(404).send({ error: 'No such panel.' });
    const copyName = `${panel.recipe.name} copy`.slice(0, 40);
    const saved = savePanel({ id: null, recipe: { ...panel.recipe, name: copyName } });
    if (saved.error) return reply.status(saved.status || 400).send({ error: saved.error });
    return { panel: getPanel(saved.id) };
  });

  // A recipe from another HomeGlow: entity ids that differ here are swapped
  // through `replacements` ({ old: new }); ones still unknown are reported so
  // the builder can ask about them.
  fastify.post('/api/ha-panels/import', async (request, reply) => {
    if (demoBlocked(reply)) return;
    const { recipe, replacements = {} } = request.body || {};
    if (!isObject(recipe) || !Array.isArray(recipe.tiles)) return reply.status(400).send({ error: 'That is not a panel recipe.' });
    const swap = (entityId) => (isObject(replacements) && typeof replacements[entityId] === 'string' ? replacements[entityId] : entityId);
    const mapped = {
      ...recipe,
      tiles: recipe.tiles.map((tile) => ({
        ...tile,
        entities: Array.isArray(tile?.entities) ? tile.entities.map(swap) : tile?.entities,
        ...(tile?.when ? { when: { ...tile.when, entity: swap(tile.when.entity) } } : {}),
      })),
    };
    const errors = rules.validateRecipe(mapped);
    if (errors.length) return reply.status(400).send({ error: errors.join(' '), errors });
    const saved = savePanel({ id: null, recipe: mapped });
    if (saved.error) return reply.status(saved.status || 400).send({ error: saved.error });
    refreshWatched();
    let missing = [];
    try {
      const { states } = await live.getStates([...rules.accessFromRecipe(mapped).read]);
      missing = Object.keys(states).filter((id) => states[id] === null);
    } catch { /* checked again when the panel is opened */ }
    return { panel: getPanel(saved.id), missing };
  });

  fastify.delete('/api/ha-panels/:id', async (request, reply) => {
    if (demoBlocked(reply)) return;
    const row = db.prepare('SELECT plugin_row_id FROM ha_panels WHERE id = ?').get(Number(request.params.id));
    if (!row) return reply.status(404).send({ error: 'No such panel.' });
    db.prepare('DELETE FROM plugins WHERE id = ?').run(row.plugin_row_id);
    refreshWatched();
    return { success: true };
  });

  // The template on its own, for the builder's preview: the recipe arrives by
  // postMessage, and states come from preview-state. Nothing can be operated.
  fastify.get('/ha-panels/preview', async (request, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return renderTemplate({ recipe: null, pluginId: null, preview: true });
  });

  // --- What panels call ----------------------------------------------------------

  const rate = new Map();
  const overLimit = (pluginId) => {
    const now = Date.now();
    const recent = (rate.get(pluginId) || []).filter((at) => now - at < RATE_WINDOW_MS);
    recent.push(now);
    rate.set(pluginId, recent);
    return recent.length > RATE_LIMIT;
  };

  const pinHash = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex');

  // A display that remembers the admin PIN is trusted with what the PIN
  // guards: the household chose to unlock it.
  const displayRemembersPin = (deviceName) => {
    if (!deviceName || typeof deviceName !== 'string') return false;
    if (!db.prepare('SELECT 1 FROM admin_pin WHERE id = 1').get()) return false;
    const row = db.prepare('SELECT device_settings_json FROM devices WHERE name = ?').get(deviceName);
    return parseJson(row?.device_settings_json || '{}', {})?.adminPinRemembered === true;
  };

  const logAction = (entry) => {
    try {
      db.prepare('INSERT INTO ha_actions (plugin_id, device_name, entity_id, action, ok, error) VALUES (?, ?, ?, ?, ?, ?)')
        .run(entry.pluginId, entry.device || null, entry.entity, entry.action, entry.ok ? 1 : 0, entry.error || null);
      db.prepare('DELETE FROM ha_actions WHERE id <= (SELECT MAX(id) FROM ha_actions) - ?').run(HISTORY_KEEP);
    } catch (error) {
      console.error('Could not record a Home Assistant action:', error.message);
    }
  };

  const unavailable = (reply) => reply.status(503).send({ error: demoMode ? 'Home Assistant is not available in the demo.' : 'Home Assistant is not connected. Set it up in Admin → System → Connections.', notConnected: true });

  fastify.get('/api/plugin/v1/ha/:pluginId/state', async (request, reply) => {
    const access = accessFor(request.params.pluginId);
    if (!access) return reply.status(404).send({ error: 'This plugin has no Home Assistant access.' });
    if (demoMode || !ha.isConfigured(db)) return unavailable(reply);
    const ids = [...access.read];
    // A panel or plugin added since: start watching its entities.
    if (ids.some((id) => !live.watched.has(id))) refreshWatched();
    const { states, live: isLive, error } = await live.getStates(ids);
    return {
      entities: Object.fromEntries(ids.map((id) => [id, states[id] === undefined ? undefined : rules.filterState(states[id])])),
      control: [...access.control],
      live: isLive,
      unit: await live.temperatureUnit(),
      pinProtection: pinProtection(),
      ...(error ? { error: error.message, status: error.status || 503 } : {}),
      ...(live.describe().authError ? { error: live.describe().authError, status: 401 } : {}),
    };
  });

  fastify.post('/api/plugin/v1/ha/:pluginId/action', async (request, reply) => {
    const { pluginId } = request.params;
    const access = accessFor(pluginId);
    if (!access) return reply.status(404).send({ error: 'This plugin has no Home Assistant access.' });
    if (demoMode || !ha.isConfigured(db)) return unavailable(reply);
    const { entity, entities, action, value, pin, device } = request.body || {};
    const targets = Array.isArray(entities) ? entities.slice(0, 8) : [entity];
    if (!targets.length || targets.some((id) => typeof id !== 'string')) return reply.status(400).send({ error: 'Name the entity to act on.' });
    if (typeof action !== 'string') return reply.status(400).send({ error: 'Name the action.' });
    if (overLimit(pluginId)) return reply.status(429).send({ error: 'Too many presses at once; try again.' });

    const { states } = await live.getStates(targets);
    let calls;
    try {
      calls = targets.map((entityId) => ({
        entityId,
        ...rules.resolveAction({ access, entityId, action, value, state: states[entityId] }),
      }));
    } catch (error) {
      logAction({ pluginId, device, entity: targets.join(','), action, ok: false, error: error.message });
      return reply.status(error.status || 400).send({ error: error.message });
    }

    // Unlocking, disarming and opening a garage door need the household PIN
    // when PIN protection is on, unless this display remembers it.
    if (calls.some((call) => call.opens) && pinProtection() && !displayRemembersPin(device)) {
      const stored = db.prepare('SELECT pin_hash FROM admin_pin WHERE id = 1').get();
      if (stored && (typeof pin !== 'string' || pinHash(pin) !== stored.pin_hash)) {
        logAction({ pluginId, device, entity: targets.join(','), action, ok: false, error: pin ? 'wrong PIN' : 'PIN needed' });
        return reply.status(401).send({ error: pin ? 'That PIN is not right.' : 'Enter the household PIN.', needsPin: true });
      }
    }

    const results = {};
    for (const call of calls) {
      try {
        await live.callService(call.domain, call.service, call.data);
        logAction({ pluginId, device, entity: call.entityId, action, ok: true });
      } catch (error) {
        logAction({ pluginId, device, entity: call.entityId, action, ok: false, error: error.message });
        return reply.status(error.status && error.status < 600 ? error.status : 502).send({ error: error.message });
      }
    }
    const after = await live.getStates(targets);
    for (const id of targets) results[id] = rules.filterState(after.states[id]);
    return { ok: true, entities: results };
  });

  fastify.get('/api/plugin/v1/ha/:pluginId/camera/:entityId', async (request, reply) => {
    const { pluginId, entityId } = request.params;
    const access = accessFor(pluginId);
    if (!access || !access.read.has(entityId) || rules.domainOf(entityId) !== 'camera') {
      return reply.status(404).send({ error: 'No such camera on this panel.' });
    }
    if (demoMode || !ha.isConfigured(db)) return unavailable(reply);
    try {
      const { buffer, contentType } = await ha.homeAssistantFetchImage(db, `/api/camera_proxy/${encodeURIComponent(entityId)}`);
      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'no-store');
      return reply.send(buffer);
    } catch (error) {
      return reply.status(error.status && error.status < 600 ? error.status : 502).send({ error: error.message });
    }
  });

  return { renderPanel, refreshWatched };
}

module.exports = { registerHaPanelRoutes, lazyDb, TEMPLATE_VERSION };
