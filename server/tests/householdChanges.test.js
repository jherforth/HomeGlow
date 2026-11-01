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

// Plugin storage counters (issue #347): one per plugin, in the same map.
const { pluginStorageWrite } = require('../utils/householdChanges');

test('pluginStorageWrite routes only successful storage writes, by plugin id', () => {
  const params = { pluginId: 'lists' };
  assert.equal(pluginStorageWrite('PUT', '/api/plugin/v1/storage/:pluginId/:key', 200, params), 'lists');
  assert.equal(pluginStorageWrite('DELETE', '/api/plugin/v1/storage/:pluginId/:key', 204, params), 'lists');
  assert.equal(pluginStorageWrite('POST', '/api/plugin/v1/storage/:pluginId/:key/increment', 200, params), 'lists');
  assert.equal(pluginStorageWrite('GET', '/api/plugin/v1/storage/:pluginId/:key', 200, params), null, 'reads move nothing');
  assert.equal(pluginStorageWrite('PUT', '/api/plugin/v1/storage/:pluginId/:key', 400, params), null, 'failed writes move nothing');
  assert.equal(pluginStorageWrite('PUT', '/api/plugin/v1/settings/:pluginId', 200, params), null, 'settings are not storage');
  assert.equal(pluginStorageWrite('POST', '/api/plugin/v1/storage/:pluginId/:key', 200, params), null, 'POST on a key is not a write path');
  assert.equal(pluginStorageWrite('PUT', '/api/plugin/v1/storage/:pluginId/:key', 200, {}), null, 'no plugin id, no counter');
  assert.equal(pluginStorageWrite('PUT', undefined, 200, params), null, 'no route, no counter');
});

test('a plugin write moves only that plugin counter, in its own message', async () => {
  const household = [];
  const plugins = [];
  const changes = createHouseholdChanges({
    base: 100,
    coalesceMs: 20,
    onBump: (domains, revisions) => household.push({ domains, revisions }),
    onPluginStorage: (pluginId, revision) => plugins.push({ pluginId, revision }),
  });
  assert.deepEqual(Object.keys(changes.snapshot()).sort(), [...DOMAINS].sort(), 'no plugin counters before any plugin write');

  changes.bumpPlugin('lists');
  changes.bumpPlugin('lists');
  changes.bumpPlugin('other');
  changes.bump('chores');
  assert.equal(changes.snapshot()['plugin:lists'], 102);
  assert.equal(changes.snapshot()['plugin:other'], 103, 'every plugin bump takes the next server-wide sequence value');
  assert.equal(changes.snapshot().chores, 101);
  assert.equal(changes.snapshot().users, 100, 'a plugin write moves no household kind');

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(household.length, 1);
  assert.deepEqual(household[0].domains, ['chores']);
  assert.deepEqual(Object.keys(household[0].revisions).sort(), [...DOMAINS].sort(), 'a household message carries household kinds only');
  assert.deepEqual(plugins, [
    { pluginId: 'lists', revision: 102 },
    { pluginId: 'other', revision: 103 },
  ]);
});

test('removing a plugin drops its counter, and the etag stays deterministic', async () => {
  const plugins = [];
  const changes = createHouseholdChanges({ base: 100, coalesceMs: 20, onPluginStorage: (pluginId) => plugins.push(pluginId) });
  changes.bumpPlugin('lists');
  changes.bumpPlugin('other');
  assert.equal(changes.snapshot()['plugin:lists'], 101);

  changes.removePlugin('lists');
  assert.equal(changes.snapshot()['plugin:lists'], undefined);
  assert.equal(changes.snapshot()['plugin:other'], 102);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(plugins, ['other'], 'a removed plugin sends no event, even for a pending bump');

  // The same sequence of operations builds the same etag. (Different
  // insertion orders no longer do: a new counter starts from the
  // server-wide sequence, so its value depends on what came before it.)
  const a = createHouseholdChanges({ base: 100 });
  a.bumpPlugin('zeta');
  a.bumpPlugin('alpha');
  const b = createHouseholdChanges({ base: 100 });
  b.bumpPlugin('zeta');
  b.bumpPlugin('alpha');
  assert.equal(a.etag(), b.etag());
  assert.equal(a.snapshot()['plugin:alpha'], b.snapshot()['plugin:alpha']);
});

test('a reinstalled plugin never reuses its old counter, so its first write reads as changed', () => {
  const changes = createHouseholdChanges({ base: 100 });
  // Two writes before the purge: with a create-only sequence, the
  // reinstall's first write would climb back onto 102 and repeat both the
  // counter and the ETag. An intervening write to another plugin must not
  // be what saves this test.
  changes.bumpPlugin('lists');
  changes.bumpPlugin('lists');
  const oldValue = changes.snapshot()['plugin:lists'];
  const oldEtag = changes.etag();
  assert.equal(oldValue, 102);

  changes.removePlugin('lists');
  changes.bumpPlugin('lists');
  assert.equal(changes.snapshot()['plugin:lists'], 103);
  assert.notEqual(changes.snapshot()['plugin:lists'], oldValue, 'purge + reinstall must not repeat the counter');
  assert.notEqual(changes.etag(), oldEtag, 'purge + reinstall must not repeat the etag');
});

test('bumpPlugin returns the new revision, so a write route can answer with it', () => {
  const changes = createHouseholdChanges({ base: 100 });
  assert.equal(changes.bumpPlugin('lists'), 101);
  assert.equal(changes.bumpPlugin('lists'), 102);
  assert.equal(changes.bumpPlugin('other'), 103);
  assert.equal(changes.bumpPlugin(''), undefined, 'no plugin id, no revision');
});

test('seeding at boot makes plugin frames read as moved after a restart', async () => {
  const before = createHouseholdChanges({ base: 100 });
  before.bumpPlugin('lists');
  before.bumpPlugin('lists');
  const knownValue = before.snapshot()['plugin:lists'];
  assert.equal(knownValue, 102);

  // A restart: a new instance, seeded with every plugin that has stored
  // data. The seeded counter differs from what the display last saw, so
  // the frame reads as moved instead of silently pruning a vanished key
  // and showing stale data until the plugin's next write.
  const pluginEvents = [];
  const after = createHouseholdChanges({
    base: 5000,
    coalesceMs: 20,
    onPluginStorage: (pluginId, revision) => pluginEvents.push({ pluginId, revision }),
  });
  after.seedPlugins(['lists']);
  const seeded = after.snapshot()['plugin:lists'];
  assert.notEqual(seeded, knownValue);
  assert.ok(seeded !== undefined);

  // Seeding is deterministic (sorted order, sequence values) and never
  // clobbers an existing counter — and it schedules no event: nothing
  // was written, and no display is listening yet.
  const again = createHouseholdChanges({ base: 5000 });
  again.seedPlugins(['lists']);
  assert.equal(again.snapshot()['plugin:lists'], seeded, 'same ids seed the same values');
  const two = createHouseholdChanges({ base: 5000 });
  two.seedPlugins(['zeta', 'alpha']);
  assert.notEqual(two.snapshot()['plugin:zeta'], two.snapshot()['plugin:alpha'], 'seeded counters are distinct per plugin');
  after.seedPlugins(['lists']);
  assert.equal(after.snapshot()['plugin:lists'], seeded, 're-seeding leaves an existing counter alone');
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(pluginEvents, [], 'seeding sends no event');

  // The first real write after the seed takes the next sequence value,
  // never the seed itself.
  after.bumpPlugin('lists');
  assert.notEqual(after.snapshot()['plugin:lists'], seeded);
});
