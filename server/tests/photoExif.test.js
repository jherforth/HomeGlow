// The day an uploaded photo was taken and where, read from its EXIF.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readPhotoDetails, dateKeyFromExif } = require('../services/photoExif');
const { exifJpeg } = require('./helpers/exifJpeg');

test('a photo with a date and GPS gives both', async () => {
    const details = await readPhotoDetails(exifJpeg({ takenAt: '2019:09:14 09:53:34', latitude: 40.7484, longitude: -73.9857 }));
    assert.equal(details.takenOn, '2019-09-14');
    assert.ok(Math.abs(details.latitude - 40.7484) < 0.0001);
    assert.ok(Math.abs(details.longitude - -73.9857) < 0.0001);
});

test('south and west come back negative', async () => {
    const details = await readPhotoDetails(exifJpeg({ latitude: -33.8568, longitude: -70.6483 }));
    assert.ok(details.latitude < 0);
    assert.ok(details.longitude < 0);
    assert.equal(details.takenOn, null);
});

test('a photo with only a date has no position', async () => {
    assert.deepEqual(await readPhotoDetails(exifJpeg({ takenAt: '2021:06:01 10:00:00' })),
        { takenOn: '2021-06-01', latitude: null, longitude: null });
});

test('no EXIF, a missing file and garbage give nothing, and never throw', async () => {
    const none = { takenOn: null, latitude: null, longitude: null };
    assert.deepEqual(await readPhotoDetails(exifJpeg()), none);
    assert.deepEqual(await readPhotoDetails('/nonexistent/photo.jpg'), none);
    assert.deepEqual(await readPhotoDetails(Buffer.from('not a photo')), none);
});

test('0,0 is a camera with no fix, not a place', async () => {
    const details = await readPhotoDetails(exifJpeg({ takenAt: '2020:01:02 03:04:05', latitude: 0, longitude: 0 }));
    assert.equal(details.latitude, null);
    assert.equal(details.takenOn, '2020-01-02');
});

test('a camera clock that was never set is no date', () => {
    assert.equal(dateKeyFromExif('0000:00:00 00:00:00'), null);
    assert.equal(dateKeyFromExif('1970:01:01 00:00:00'), null);
    assert.equal(dateKeyFromExif('2019:13:01 00:00:00'), null);
    assert.equal(dateKeyFromExif(''), null);
    assert.equal(dateKeyFromExif(undefined), null);
    assert.equal(dateKeyFromExif('2019-09-14T09:53:34'), '2019-09-14');
});
