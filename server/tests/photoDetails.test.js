// The date, people and place a photo carries (screensaver photo details).
const test = require('node:test');
const assert = require('node:assert/strict');
const { immichPhotoDetails, takenOnFromInstant } = require('../utils/photoDetails');
const { fetchAlbumAssets, postWithDetails } = require('../services/immichPhotos');

test('an Immich photo gives its date, named people and place', () => {
  const details = immichPhotoDetails({
    localDateTime: '2019-06-14T19:42:00.000Z',
    exifInfo: { dateTimeOriginal: '2019-06-15T02:42:00.000Z', city: 'South Lake Tahoe', state: 'California', country: 'United States of America' },
    people: [
      { name: 'Emma', isHidden: false },
      { name: '', isHidden: false },
      { name: 'Grandpa', isHidden: true },
      { name: ' Liam ' },
      { name: 'Emma' },
    ],
  });
  assert.deepEqual(details, { takenOn: '2019-06-14', people: ['Emma', 'Liam'], place: 'South Lake Tahoe, California' });
});

test('the camera\'s own date wins over the UTC instant', () => {
  // 7:42 pm in California is already the 15th in UTC.
  assert.equal(immichPhotoDetails({ localDateTime: '2019-06-14T19:42:00.000Z', exifInfo: { dateTimeOriginal: '2019-06-15T02:42:00Z' } }).takenOn, '2019-06-14');
});

test('outside the US the country stands in for the state, and nothing is guessed', () => {
  assert.equal(immichPhotoDetails({ exifInfo: { city: 'Lyon', country: 'France' } }).place, 'Lyon, France');
  assert.equal(immichPhotoDetails({ exifInfo: { country: 'Iceland' } }).place, 'Iceland');
  assert.deepEqual(immichPhotoDetails({ id: 'x' }), {});
  assert.deepEqual(immichPhotoDetails(null), {});
});

test('a Google photo\'s instant becomes the household\'s date', () => {
  const original = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    assert.equal(takenOnFromInstant('2019-06-15T02:42:00Z'), '2019-06-14');
    assert.equal(takenOnFromInstant('not a date'), null);
    assert.equal(takenOnFromInstant(undefined), null);
  } finally {
    process.env.TZ = original;
  }
});

test('Immich is asked for the details, and an old one that refuses is asked again without', async () => {
  const bodies = [];
  const modern = async (url, body) => { bodies.push(body); return { data: { assets: { items: [{ id: 'a' }], nextPage: null } } }; };
  await fetchAlbumAssets({ post: modern, apiBase: 'x', headers: {}, albumId: 'alb' });
  assert.equal(bodies[0].withExif, true);
  assert.equal(bodies[0].withPeople, true);

  const sent = [];
  const old = async (url, body) => {
    sent.push(body);
    if (body.withPeople) {
      const error = new Error('Bad Request');
      error.response = { status: 400 };
      throw error;
    }
    return { data: [{ id: 'b' }] };
  };
  const response = await postWithDetails(old, 'x/search/random', { size: 100 }, {});
  assert.deepEqual(response.data, [{ id: 'b' }]);
  assert.deepEqual(sent[1], { size: 100 });

  const down = async () => { const error = new Error('down'); error.response = { status: 503 }; throw error; };
  await assert.rejects(postWithDetails(down, 'x', {}, {}), /down/);
});
