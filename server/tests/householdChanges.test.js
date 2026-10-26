// Revision counters for household data (issue #325).
const test = require('node:test');
const assert = require('node:assert/strict');
const { DOMAINS, domainsForRequest, createHouseholdChanges } = require('../utils/householdChanges');

test('a successful write moves the kinds of data its route touches', () => {
  assert.deepEqual(domainsForRequest('POST', '/api/chores/complete', 200), ['chores', 'users']);
  assert.deepEqual(domainsForRequest('PATCH', '/api/chore-schedules/:id', 200), ['chores', 'users']);
  assert.deepEqual(domainsForRequest('POST', '/api/routines/:id/steps/:stepId', 200), ['chores', 'users']);
  assert.deepEqual(domainsForRequest('POST', '/api/users/:id/clams/add', 200), ['users']);
  assert.deepEqual(domainsForRequest('POST', '/api/prize-offers/:id/approve', 200), ['prizes', 'users']);
  assert.deepEqual(domainsForRequest('POST', '/api/settings', 200), ['settings']);
  assert.deepEqual(domainsForRequest('PUT', '/api/timezone', 200), ['settings']);
  assert.deepEqual(domainsForRequest('DELETE', '/api/calendar-sources/:id/events/:eventId', 204), ['calendar']);
});

test('reads, failed writes and other routes move nothing', () => {
  assert.deepEqual(domainsForRequest('GET', '/api/chores', 200), []);
  assert.deepEqual(domainsForRequest('HEAD', '/api/users', 200), []);
  assert.deepEqual(domainsForRequest('POST', '/api/chores/complete', 409), []);
  assert.deepEqual(domainsForRequest('POST', '/api/settings/search', 200), []);
  assert.deepEqual(domainsForRequest('POST', '/api/calendar-sources/:id/test', 200), []);
  assert.deepEqual(domainsForRequest('PATCH', '/api/devices/:deviceName/settings', 200), []);
  assert.deepEqual(domainsForRequest('POST', '/api/plugin/v1/storage/:pluginId/:key', 200), []);
  assert.deepEqual(domainsForRequest('POST', undefined, 200), [], 'a 404 has no route');
  // A route that only starts with a known prefix isn't that route.
  assert.deepEqual(domainsForRequest('POST', '/api/usersettings', 200), []);
});

test('bumps move counters, and a burst goes out as one message', async () => {
  const messages = [];
  const changes = createHouseholdChanges({ base: 100, coalesceMs: 20, onBump: (domains, revisions) => messages.push({ domains, revisions }) });
  assert.deepEqual(changes.snapshot(), Object.fromEntries(DOMAINS.map((d) => [d, 100])));
  const before = changes.etag();

  changes.bump(['chores', 'users']);
  changes.bump('chores');
  changes.bump('not-a-domain');
  assert.equal(changes.snapshot().chores, 102);
  assert.equal(changes.snapshot().users, 101);
  assert.notEqual(changes.etag(), before);
  assert.equal(messages.length, 0, 'not yet: coalescing');

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].domains, ['chores', 'users']);
  assert.equal(messages[0].revisions.chores, 102);

  changes.bump('not-a-domain');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(messages.length, 1, 'an unknown kind sends nothing');
});

test('every server starts from its own base, so a restart reads as "everything changed"', () => {
  const a = createHouseholdChanges().snapshot().chores;
  const b = createHouseholdChanges().snapshot().chores;
  assert.notEqual(a, b);
});
