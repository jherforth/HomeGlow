// What changed, so every display can catch up (issue #325).
//
// The server keeps a revision counter for each kind of household data. A
// write moves its counter; a display that sees a counter move reloads that
// kind of data. Coarse on purpose: a display never needs to know what
// changed, only that something did, so no write can be missed by a widget
// asking the wrong question.
//
// Counters move in one place for requests: an onResponse hook in index.js
// asks domainsForRequest() which kinds a successful write touched. Work that
// writes without a request (the nightly job, calendar sync, calendar
// routines, the demo reset) calls bump() itself. Things that change with the
// clock alone (a snooze ending, midnight, an expiry) aren't writes: displays
// work those out from their own clock.
//
// Plugin storage has counters in the same map (issue #347): one per plugin,
// under `plugin:<pluginId>`. A plugin's counter is created on its first
// storage write and dropped when its data is purged, so the set grows and
// shrinks with installed plugins; the ETag is built from the five fixed
// kinds plus the plugin kinds in sorted order, so it stays deterministic.
// A plugin's storage write moves only that plugin's counter, never a
// household kind, and goes out as its own event (see pluginEvents) carrying
// the plugin id only — never a key.
//
// Counters live in memory and start from a random base at boot, so after a
// restart every counter differs from what any display last saw, and every
// display reloads everything once.
const crypto = require('crypto');

const DOMAINS = Object.freeze(['chores', 'users', 'prizes', 'settings', 'calendar']);

const PLUGIN_DOMAIN_PREFIX = 'plugin:';

// The counter kind for a plugin's storage, and the plugin id behind one.
function pluginDomain(pluginId) {
  return `${PLUGIN_DOMAIN_PREFIX}${pluginId}`;
}

function isPluginDomain(domain) {
  return typeof domain === 'string' && domain.startsWith(PLUGIN_DOMAIN_PREFIX);
}

function pluginIdOfDomain(domain) {
  return domain.slice(PLUGIN_DOMAIN_PREFIX.length);
}

// Which kinds of data a write under each route changes. A chore completion
// and a prize redemption both move clam totals, which are user data.
const ROUTE_DOMAINS = [
  [/^\/api\/(chores|chore-schedules|chore-history|routines|routine-steps)(\/|$)/, ['chores', 'users']],
  [/^\/api\/users(\/|$)/, ['users']],
  [/^\/api\/(prizes|prize-offers)(\/|$)/, ['prizes', 'users']],
  [/^\/api\/(settings|timezone|themes|appearance|sounds)(\/|$)/, ['settings']],
  [/^\/api\/(calendar|calendar-sources|calendar-sync)(\/|$)/, ['calendar']],
];
// POSTs that only read.
const READ_ONLY_POSTS = new Set(['/api/settings/search', '/api/calendar-sources/:id/test']);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The kinds of data a finished request changed: none for a read, a failed
 * write or a route outside household data. `route` is the matched route
 * pattern (request.routeOptions.url), so ids in the path don't matter.
 */
function domainsForRequest(method, route, statusCode) {
  if (READ_METHODS.has(String(method).toUpperCase())) return [];
  if (!route || statusCode >= 400 || READ_ONLY_POSTS.has(route)) return [];
  const match = ROUTE_DOMAINS.find(([pattern]) => pattern.test(route));
  return match ? match[1] : [];
}

/**
 * The plugin whose storage a finished request wrote, if any (issue #347):
 * PUT or DELETE on a storage key, or POST on a key's /increment — and only
 * on success, like domainsForRequest. Reads, failed writes, other plugin
 * routes (settings, notify, ha) and other routes return null. `params` is
 * the request's route params, so the id comes from the path, not the body.
 */
function pluginStorageWrite(method, route, statusCode, params) {
  if (!route || statusCode >= 400) return null;
  const pluginId = params?.pluginId;
  if (typeof pluginId !== 'string' || pluginId.length === 0) return null;
  switch (String(method).toUpperCase()) {
    case 'PUT':
    case 'DELETE':
      return route === '/api/plugin/v1/storage/:pluginId/:key' ? pluginId : null;
    case 'POST':
      return route === '/api/plugin/v1/storage/:pluginId/:key/increment' ? pluginId : null;
    default:
      return null;
  }
}

/**
 * A set of counters. `onBump(domains, revisions)` is called once per burst
 * of bumps, after `coalesceMs`, so a write touching several kinds, or a
 * nightly job touching many rows, goes out as one message. `onPluginStorage`
 * is called once per plugin whose storage counter moved in the burst, with
 * that plugin's id and its new revision. Household revisions handed to
 * onBump never include plugin counters: a display may see every plugin's
 * counter through the changes check, but a household event carries only
 * household kinds.
 */
function createHouseholdChanges({ onBump = () => {}, onPluginStorage = () => {}, coalesceMs = 100, base = crypto.randomInt(1e6, 1e9) } = {}) {
  const revisions = Object.fromEntries(DOMAINS.map((domain) => [domain, base]));
  // One server-wide sequence for plugin counters: every plugin bump takes
  // the next value, so a value is never reused within a boot — even after
  // uninstall-with-purge and a reinstall. Taking the sequence only when a
  // counter is created is not enough: a plugin's own count could climb
  // back onto a value it had before the purge (two writes, purge,
  // reinstall, one write repeats the old counter and ETag).
  let pluginSeq = base;
  let pending = new Set();
  let timer = null;

  const snapshot = () => ({ ...revisions });
  const householdSnapshot = () => Object.fromEntries(DOMAINS.map((domain) => [domain, revisions[domain]]));
  const etag = () => {
    const pluginKeys = Object.keys(revisions).filter(isPluginDomain).sort();
    return `"${[...DOMAINS, ...pluginKeys].map((domain) => revisions[domain]).join('-')}"`;
  };

  function flush() {
    timer = null;
    const householdMoved = DOMAINS.filter((domain) => pending.has(domain));
    const pluginMoved = [...pending].filter(isPluginDomain).sort();
    pending = new Set();
    if (householdMoved.length) onBump(householdMoved, householdSnapshot());
    for (const domain of pluginMoved) onPluginStorage(pluginIdOfDomain(domain), revisions[domain]);
  }

  function scheduleFlush() {
    if (!timer) {
      timer = setTimeout(flush, coalesceMs);
      timer.unref?.();
    }
  }

  function bump(...domains) {
    let moved = false;
    for (const domain of domains.flat()) {
      if (!Object.prototype.hasOwnProperty.call(revisions, domain)) continue;
      revisions[domain] += 1;
      pending.add(domain);
      moved = true;
    }
    if (moved) scheduleFlush();
  }

  // A plugin's storage write moves only that plugin's counter, creating it
  // on first use: a display that has never seen the plugin reads the new
  // key as a change, and one that has sees the moved counter. Household
  // kinds never move here. Every bump takes the next server-wide sequence
  // value, not +1 on the plugin's own counter: after uninstall-with-purge
  // and a reinstall, the first write must not repeat the old value, or a
  // display holding the old ETag would read a 304 and miss it.
  function bumpPlugin(pluginId) {
    if (typeof pluginId !== 'string' || pluginId.length === 0) return;
    const domain = pluginDomain(pluginId);
    revisions[domain] = ++pluginSeq;
    pending.add(domain);
    scheduleFlush();
  }

  // The plugin's data is gone (uninstall with purge): its counter goes
  // with it, so the set shrinks. No event — there is no frame left to tell,
  // and the next changes check shows the key gone.
  function removePlugin(pluginId) {
    if (typeof pluginId !== 'string' || pluginId.length === 0) return;
    const domain = pluginDomain(pluginId);
    delete revisions[domain];
    pending.delete(domain);
  }

  return { bump, bumpPlugin, removePlugin, snapshot, etag, flush };
}

module.exports = {
  DOMAINS,
  ROUTE_DOMAINS,
  PLUGIN_DOMAIN_PREFIX,
  pluginDomain,
  domainsForRequest,
  pluginStorageWrite,
  createHouseholdChanges,
};
