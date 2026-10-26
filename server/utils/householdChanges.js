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
// Counters live in memory and start from a random base at boot, so after a
// restart every counter differs from what any display last saw, and every
// display reloads everything once.
const crypto = require('crypto');

const DOMAINS = Object.freeze(['chores', 'users', 'prizes', 'settings', 'calendar']);

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
 * A set of counters. `onBump(domains, revisions)` is called once per burst
 * of bumps, after `coalesceMs`, so a write touching several kinds, or a
 * nightly job touching many rows, goes out as one message.
 */
function createHouseholdChanges({ onBump = () => {}, coalesceMs = 100, base = crypto.randomInt(1e6, 1e9) } = {}) {
  const revisions = Object.fromEntries(DOMAINS.map((domain) => [domain, base]));
  let pending = new Set();
  let timer = null;

  const snapshot = () => ({ ...revisions });
  const etag = () => `"${DOMAINS.map((domain) => revisions[domain]).join('-')}"`;

  function flush() {
    timer = null;
    const domains = DOMAINS.filter((domain) => pending.has(domain));
    pending = new Set();
    if (domains.length) onBump(domains, snapshot());
  }

  function bump(...domains) {
    let moved = false;
    for (const domain of domains.flat()) {
      if (!Object.prototype.hasOwnProperty.call(revisions, domain)) continue;
      revisions[domain] += 1;
      pending.add(domain);
      moved = true;
    }
    if (moved && !timer) {
      timer = setTimeout(flush, coalesceMs);
      timer.unref?.();
    }
  }

  return { bump, snapshot, etag, flush };
}

module.exports = { DOMAINS, ROUTE_DOMAINS, domainsForRequest, createHouseholdChanges };
