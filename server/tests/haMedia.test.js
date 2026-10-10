// Home Assistant panels: music (services/haMedia.js). What a panel is shown
// of a player's library, and the rule behind playing it: a panel may only
// play what HomeGlow showed it.
const test = require('node:test');
const assert = require('node:assert/strict');
const media = require('../services/haMedia');

const node = (title, extra = {}) => ({
  title,
  media_class: 'playlist',
  media_content_type: 'playlist',
  media_content_id: `library://playlist/${title}`,
  can_play: true,
  can_expand: true,
  thumbnail: null,
  ...extra,
});

const context = (catalog = new media.MediaCatalog()) => ({
  catalog,
  pluginId: 'ha-kitchen',
  imageUrl: (key) => `/img/${key}`,
});

test('a level of the library becomes items with keys, never content ids', () => {
  const ctx = context();
  const level = media.browseResult({
    title: 'Playlists',
    media_class: 'directory',
    media_content_type: 'playlists',
    media_content_id: 'library://playlists',
    can_expand: true,
    children: [node('Kitchen Mix'), node('Dinner Jazz', { can_expand: false })],
  }, ctx);
  assert.equal(level.title, 'Playlists');
  assert.equal(level.items.length, 2);
  const [mix, jazz] = level.items;
  assert.equal(mix.title, 'Kitchen Mix');
  assert.equal(mix.canPlay, true);
  assert.equal(mix.canOpen, true);
  assert.equal(jazz.canOpen, false);
  assert.ok(!JSON.stringify(level).includes('library://'), 'no content id reaches the panel');
  assert.deepEqual(ctx.catalog.item('ha-kitchen', mix.key), { kind: 'item', id: 'library://playlist/Kitchen Mix', type: 'playlist', title: 'Kitchen Mix' });
});

test('the same item always gets the same key; another panel cannot use it', () => {
  const catalog = new media.MediaCatalog();
  const first = media.toItem(node('Kitchen Mix'), context(catalog));
  const again = media.toItem(node('Kitchen Mix'), context(catalog));
  assert.equal(first.key, again.key);
  assert.equal(catalog.item('ha-other', first.key), null);
  assert.equal(catalog.item('ha-kitchen', 'made-up'), null);
  assert.equal(catalog.item('ha-kitchen', { toString: () => first.key }), null, 'only a string key');
});

test('the catalog forgets the oldest items past its limit', () => {
  const catalog = new media.MediaCatalog({ limit: 3 });
  const keys = ['a', 'b', 'c', 'd'].map((title) => media.toItem(node(title), context(catalog)).key);
  assert.equal(catalog.item('ha-kitchen', keys[0]), null);
  assert.ok(catalog.item('ha-kitchen', keys[3]));
  catalog.forget('ha-kitchen');
  assert.equal(catalog.item('ha-kitchen', keys[3]), null);
});

test('nodes that can be neither played nor opened, or are malformed, are left out', () => {
  const ctx = context();
  assert.equal(media.toItem(node('Dead end', { can_play: false, can_expand: false }), ctx), null);
  assert.equal(media.toItem(node('No id', { media_content_id: 42 }), ctx), null);
  assert.equal(media.toItem(node('No type', { media_content_type: '' }), ctx), null);
  assert.equal(media.toItem(node('Huge id', { media_content_id: 'x'.repeat(5000) }), ctx), null);
  assert.equal(media.toItem(null, ctx), null);
  const untitled = media.toItem(node('', { media_content_id: 'library://track/7' }), ctx);
  assert.equal(untitled.title, 'library://track/7', 'an untitled item shows its id rather than nothing');
});

test('pictures: web addresses pass through, Home Assistant paths go by key, anything else is dropped', () => {
  const ctx = context();
  const web = media.toItem(node('Web', { thumbnail: 'https://images.example/a.jpg' }), ctx);
  assert.equal(web.thumb, 'https://images.example/a.jpg');
  const signed = media.toItem(node('Signed', { thumbnail: '/api/media_player_proxy/media_player.m/browse_media/playlist/2' }), ctx);
  assert.match(signed.thumb, /^\/img\/[\w-]{22}$/);
  assert.equal(ctx.catalog.image('ha-kitchen', signed.thumb.slice(5)), '/api/media_player_proxy/media_player.m/browse_media/playlist/2');
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/api/../etc/passwd', '//evil.example/a.png', '/static/a.png', 'https://a.example/"><script>']) {
    assert.equal(media.toItem(node('Bad', { thumbnail: bad }), ctx).thumb, null, bad);
  }
});

test('search results come as { result: [...] } or a plain list, capped', () => {
  const ctx = context();
  assert.equal(media.searchResult({ result: [node('a'), node('b')] }, ctx).items.length, 2);
  assert.equal(media.searchResult([node('a')], ctx).items.length, 1);
  assert.deepEqual(media.searchResult({}, ctx), { items: [], more: false });
  const many = media.searchResult({ result: Array.from({ length: 250 }, (_, i) => node(`n${i}`)) }, ctx);
  assert.equal(many.items.length, 200);
  assert.equal(many.more, true);
});

test('recent searches: newest first, no repeats, at most eight', () => {
  let list = [];
  for (const q of ['neil young', 'jazz', '  Neil   Young ', '', 'a', 'b', 'c', 'd', 'e', 'f']) list = media.addRecent(list, q);
  assert.deepEqual(list, ['f', 'e', 'd', 'c', 'b', 'a', 'Neil Young', 'jazz']);
  assert.deepEqual(media.addRecent(['x', 3, null, ''], null), ['x']);
  assert.equal(media.normalizeQuery('   '), null);
  assert.equal(media.normalizeQuery('a'.repeat(300)).length, media.MAX_QUERY);
});

test('the playing picture: where it is, and a tag that changes with it', () => {
  const st = (picture) => ({ attributes: { entity_picture: picture } });
  assert.deepEqual(media.artSource(st('https://images.example/now.jpg')), { web: 'https://images.example/now.jpg' });
  assert.deepEqual(media.artSource(st('/api/media_player_proxy/media_player.m?token=t&cache=1')), { path: '/api/media_player_proxy/media_player.m?token=t&cache=1' });
  assert.equal(media.artSource(st('ftp://x')), null);
  assert.equal(media.artSource({ attributes: {} }), null);
  const a = media.artVersion(st('/api/media_player_proxy/m?token=t&cache=1'));
  const b = media.artVersion(st('/api/media_player_proxy/m?token=t&cache=2'));
  assert.match(a, /^[\w-]{12}$/);
  assert.notEqual(a, b);
  assert.ok(!a.includes('token'));
  assert.equal(media.artVersion({ attributes: {} }), null);
});

test('what a player can do, from its supported features', () => {
  const player = (features) => ({ attributes: { supported_features: features } });
  assert.equal(media.canBrowse(player(media.FEATURE.BROWSE_MEDIA)), true);
  assert.equal(media.canBrowse(player(1)), false);
  assert.equal(media.canSearch(player(media.FEATURE.SEARCH_MEDIA | 1)), true);
  assert.equal(media.canSearch(player(media.FEATURE.BROWSE_MEDIA)), false);
});
