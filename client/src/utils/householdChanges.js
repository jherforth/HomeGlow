import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';
import { subscribePluginEvents } from './pluginEventBridge.js';

// Keeping every display in step (issue #325). The server keeps a revision
// counter for each kind of household data (server/utils/householdChanges.js)
// and moves it on every write. This page learns the counters two ways, and
// tells whoever subscribed which kinds moved, so they reload them:
//
//   - GET /api/changes, a few bytes and 304 when nothing changed. A display
//     checks every 15 seconds while it's visible, and right away when it
//     becomes visible again. A phone checks only when it becomes visible:
//     it's opened, glanced at and put away, so a timer would mostly spend
//     its battery while nobody looks.
//   - The event stream, where it reaches the browser: the same counters
//     arrive within a second of the write. Where it doesn't (some proxies
//     and tunnels), the check above still catches up.
//
// Coarse on purpose: a subscriber learns that a kind of data changed, never
// what, and reloads all of it. No write can be missed by a widget asking
// the wrong question.
//
// Plugin storage rides the same two paths (issue #347): the server keeps
// one counter per plugin under `plugin:<pluginId>` in the same snapshot,
// created on a plugin's first storage write and dropped when its data is
// purged. A plugin's frame hears only its own plugin's counter move, never
// another plugin's — the per-plugin subscription below is where that
// scoping lives, and the frame itself gets the plugin id only, never a key.

export const HOUSEHOLD_DOMAINS = Object.freeze(['chores', 'users', 'prizes', 'settings', 'calendar']);
export const CHECK_INTERVAL_MS = 15 * 1000;

const PLUGIN_DOMAIN_PREFIX = 'plugin:';
const pluginDomain = (pluginId) => `${PLUGIN_DOMAIN_PREFIX}${pluginId}`;

/** The kinds whose counters differ between two snapshots; none before the first. Pure. */
export function changedDomains(known, next) {
  if (!known || !next) return [];
  return HOUSEHOLD_DOMAINS.filter((domain) => next[domain] !== undefined && next[domain] !== known[domain]);
}

/** The plugin ids whose storage counters differ, or that newly appeared; none before the first. Pure. */
export function changedPluginIds(known, next) {
  if (!known || !next) return [];
  return Object.keys(next)
    .filter((key) => key.startsWith(PLUGIN_DOMAIN_PREFIX))
    .map((key) => key.slice(PLUGIN_DOMAIN_PREFIX.length))
    .filter((pluginId) => next[pluginDomain(pluginId)] !== known[pluginDomain(pluginId)]);
}

const subscribers = new Set();
const pluginSubscribers = new Set();
let known = null;
let etag = null;
let mode = 'interval';
let running = false;
let checking = false;
let timer = null;
let stopEvents = null;

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

function notifyHousehold(moved) {
  for (const { domains, handler } of subscribers) {
    const theirs = moved.filter((domain) => domains.has(domain));
    if (!theirs.length) continue;
    try {
      handler(theirs);
    } catch (error) {
      console.error('Household change subscriber failed:', error);
    }
  }
}

function notifyPlugins(movedPluginIds) {
  if (!movedPluginIds.length) return;
  for (const { pluginId, handler } of pluginSubscribers) {
    if (!movedPluginIds.includes(pluginId)) continue;
    try {
      handler(pluginId);
    } catch (error) {
      console.error('Plugin storage change subscriber failed:', error);
    }
  }
}

// A full snapshot, from GET /api/changes only: household kinds plus plugin
// counters. Plugin keys that vanished (uninstall with purge) drop out of
// what this page knows, so they can't linger as stale counters.
function applySnapshot(next) {
  if (!next || typeof next !== 'object') return;
  if (!known) {
    known = { ...next };
    return;
  }
  const moved = changedDomains(known, next);
  const movedPlugins = changedPluginIds(known, next);
  if (!moved.length && !movedPlugins.length) return;
  const pruned = { ...known, ...next };
  for (const key of Object.keys(pruned)) {
    if (key.startsWith(PLUGIN_DOMAIN_PREFIX) && !(key in next)) delete pruned[key];
  }
  known = pruned;
  notifyHousehold(moved);
  notifyPlugins(movedPlugins);
}

// Event-stream household revisions: household kinds only, merged into what
// this page knows without pruning and without establishing the baseline —
// the GET baseline follows right behind, and the stream is only a fast
// path, so a message that arrives before it is safely dropped.
function applyRevisions(revisions) {
  if (!revisions || typeof revisions !== 'object' || !known) return;
  const moved = changedDomains(known, revisions);
  if (!moved.length) return;
  known = { ...known, ...revisions };
  notifyHousehold(moved);
}

// One plugin's counter from the event stream. Same baseline rule as above:
// before the first GET answer, there is nothing to compare against.
function applyPluginRevision(pluginId, revision) {
  if (!known || typeof pluginId !== 'string' || typeof revision !== 'number') return;
  const domain = pluginDomain(pluginId);
  if (known[domain] === revision) return;
  known = { ...known, [domain]: revision };
  notifyPlugins([pluginId]);
}

/** Ask the server now. Resolves when the answer has been applied. */
export async function checkHouseholdChanges() {
  if (checking) return;
  checking = true;
  try {
    const response = await axios.get(`${API_BASE_URL}/api/changes`, {
      headers: etag ? { 'If-None-Match': etag } : {},
      validateStatus: (status) => status === 200 || status === 304,
    });
    if (response.status === 200) {
      etag = response.headers?.etag || null;
      applySnapshot(response.data);
    }
  } catch {
    // Offline or restarting: the next check, or the next visibility, retries.
  } finally {
    checking = false;
  }
}

function onVisibilityChange() {
  if (isVisible()) void checkHouseholdChanges();
}

function startTimer() {
  clearInterval(timer);
  timer = null;
  if (mode !== 'interval') return;
  timer = setInterval(() => {
    if (isVisible()) void checkHouseholdChanges();
  }, CHECK_INTERVAL_MS);
}

function start() {
  if (running) return;
  running = true;
  void checkHouseholdChanges();
  startTimer();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  // The fast path. Without EventSource (tests, very old browsers) the
  // checks alone keep up.
  if (typeof EventSource !== 'undefined') {
    stopEvents = subscribePluginEvents((message) => {
      if (message?.event === 'household.changed') applyRevisions(message.payload?.revisions);
      else if (message?.event === 'plugin.storage.changed') {
        applyPluginRevision(message.payload?.pluginId, message.payload?.revision);
      }
    });
  }
}

function stop() {
  if (!running) return;
  running = false;
  clearInterval(timer);
  timer = null;
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
  stopEvents?.();
  stopEvents = null;
}

/**
 * 'interval' (a wall display, a desktop): every 15 seconds while visible.
 * 'visible' (a phone): only when it becomes visible.
 */
export function setHouseholdChangesMode(next) {
  if (next !== 'interval' && next !== 'visible') return;
  if (next === mode) return;
  mode = next;
  if (running) startTimer();
}

/**
 * Call `handler(movedDomains)` whenever any of `domains` changes on the
 * server. Returns an unsubscribe function, so it drops into a useEffect.
 * The checks run while anything is subscribed.
 */
export function subscribeHouseholdChanges(domains, handler) {
  const entry = { domains: new Set(domains), handler };
  subscribers.add(entry);
  start();
  return () => {
    subscribers.delete(entry);
    if (!subscribers.size && !pluginSubscribers.size) stop();
  };
}

/**
 * Call `handler(pluginId)` whenever that plugin's storage counter moves on
 * the server — from the event stream within a second, or from the 15-second
 * check where the stream doesn't reach. A subscriber hears only its own
 * plugin: another plugin's writes never reach it, which is what keeps one
 * plugin's frames from learning about another plugin's storage (issue
 * #347). Returns an unsubscribe function. The checks run while anything is
 * subscribed.
 */
export function subscribePluginStorageChanges(pluginId, handler) {
  const entry = { pluginId, handler };
  pluginSubscribers.add(entry);
  start();
  return () => {
    pluginSubscribers.delete(entry);
    if (!subscribers.size && !pluginSubscribers.size) stop();
  };
}

/** The household counters this page last saw, or null before the first answer. Plugin counters are never included: a frame that declared household.changed must not learn about plugins' storage through it. */
export const knownHouseholdRevisions = () => {
  if (!known) return null;
  return Object.fromEntries(HOUSEHOLD_DOMAINS.map((domain) => [domain, known[domain]]));
};

/** Tests only: forget everything. */
export function resetHouseholdChangesForTests() {
  stop();
  subscribers.clear();
  pluginSubscribers.clear();
  known = null;
  etag = null;
  mode = 'interval';
  checking = false;
}
