const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchAlbumAssets, PAGE_SIZE, MAX_PAGES } = require('../services/immichPhotos');

// A stand-in for axios.post against Immich's paged metadata search.
function fakeImmich(total, { nextPageForever = false } = {}) {
  const calls = [];
  const post = async (url, body) => {
    calls.push({ url, body });
    const start = (body.page - 1) * body.size;
    const items = Array.from({ length: Math.max(0, Math.min(body.size, total - start)) }, (_, i) => ({ id: `a${start + i + 1}` }));
    const more = nextPageForever || start + body.size < total;
    return { data: { assets: { items, nextPage: more ? String(body.page + 1) : null } } };
  };
  return { post, calls };
}

test('every page of the album is read, not just the first 1,000', async () => {
  const immich = fakeImmich(2700);
  const assets = await fetchAlbumAssets({ post: immich.post, apiBase: 'http://immich/api', headers: {}, albumId: 'alb' });
  assert.equal(assets.length, 2700);
  assert.equal(assets[2699].id, 'a2700');
  assert.deepEqual(immich.calls.map((c) => c.body.page), [1, 2, 3]);
  assert.ok(immich.calls.every((c) => c.url === 'http://immich/api/search/metadata' && c.body.size === PAGE_SIZE && c.body.albumIds[0] === 'alb'));
});

test('a small album is one request', async () => {
  const immich = fakeImmich(40);
  assert.equal((await fetchAlbumAssets({ post: immich.post, apiBase: 'x', headers: {}, albumId: 'alb' })).length, 40);
  assert.equal(immich.calls.length, 1);
});

test('an empty page ends it, and a runaway nextPage stops at the safety limit', async () => {
  const empty = fakeImmich(1000, { nextPageForever: true });
  assert.equal((await fetchAlbumAssets({ post: empty.post, apiBase: 'x', headers: {}, albumId: 'alb' })).length, 1000);
  assert.equal(empty.calls.length, 2, 'the second page came back empty');

  const huge = fakeImmich(10 ** 6);
  await fetchAlbumAssets({ post: huge.post, apiBase: 'x', headers: {}, albumId: 'alb' });
  assert.equal(huge.calls.length, MAX_PAGES);
});
