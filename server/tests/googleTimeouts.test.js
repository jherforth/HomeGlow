// Calls to Google give up instead of waiting forever, and a picked photo or
// video is written to disk as it arrives rather than held in memory whole.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const googleConnection = require('../services/googleConnection');
const googlePhotosPicker = require('../services/googlePhotosPicker');

const SOURCE_ID = `test-${process.pid}`;
let originalFetch;
let originalGetValidAccessToken;
let originalTimeouts;

// A Google that accepts the request and never answers. It honors the signal,
// as fetch does, so a call without one hangs.
function hangingFetch(url, init = {}) {
    return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal.reason));
    });
}

// A response body that sends `first` and then stops, still open, until the
// request's signal ends it, as fetch does.
function stallingBody(first, signal) {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(first);
            signal.addEventListener('abort', () => controller.error(signal.reason));
        },
        pull() { return new Promise(() => {}); },
    });
}

test.beforeEach(() => {
    originalFetch = global.fetch;
    originalGetValidAccessToken = googleConnection.getValidAccessToken;
    originalTimeouts = { ...googleConnection.timeouts };
    googleConnection.getValidAccessToken = async () => 'fake-token';
    googleConnection.timeouts.requestMs = 200;
    googleConnection.timeouts.downloadMs = 200;
});

test.afterEach(() => {
    global.fetch = originalFetch;
    googleConnection.getValidAccessToken = originalGetValidAccessToken;
    Object.assign(googleConnection.timeouts, originalTimeouts);
});

test.after(() => {
    fs.rmSync(googlePhotosPicker.sourceDir(SOURCE_ID), { recursive: true, force: true });
});

test('a Google API call that never answers fails within the time limit', async () => {
    global.fetch = hangingFetch;
    const googleFetch = googleConnection.createGoogleFetch('https://example.test', 'Test API');
    const started = Date.now();
    await assert.rejects(googleFetch(null, 1, 'GET', '/x'), /Google did not answer within/);
    assert.ok(Date.now() - started < 2000, 'waited far past the limit');
});

test('the default limits are long enough for Google and bounded', () => {
    assert.equal(originalTimeouts.requestMs, 20 * 1000);
    assert.equal(originalTimeouts.downloadMs, 2 * 60 * 1000);
});

test('a picked photo is streamed to disk', async () => {
    const bytes = Buffer.alloc(256 * 1024, 9);
    global.fetch = async (url, init) => {
        assert.ok(init.signal, 'download has no time limit');
        return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    };
    const saved = await googlePhotosPicker.downloadMedia(null, 1, SOURCE_ID, {
        mediaFile: { baseUrl: 'https://example.test/photo', mimeType: 'image/jpeg' },
    });
    assert.deepEqual(fs.readFileSync(saved.localPath), bytes);
});

test('a download that stalls fails within the time limit and leaves no partial file', async () => {
    global.fetch = async (url, init) => new Response(stallingBody(new Uint8Array(1024), init.signal), { status: 200 });
    const before = fs.readdirSync(googlePhotosPicker.sourceDir(SOURCE_ID));
    await assert.rejects(
        googlePhotosPicker.downloadMedia(null, 1, SOURCE_ID, {
            mediaFile: { baseUrl: 'https://example.test/video', mimeType: 'video/mp4' },
        }),
        /did not finish sending picked media within/,
    );
    assert.deepEqual(fs.readdirSync(googlePhotosPicker.sourceDir(SOURCE_ID)), before);
});
