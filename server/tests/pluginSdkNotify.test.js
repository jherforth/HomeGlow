const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// HomeGlow.notify.phones, send and clear: what each one asks the server,
// for a plugin whose manifest declares "notify": true.
const sdkSource = fs.readFileSync(path.resolve(__dirname, '..', 'plugin-sdk', 'v1.js'), 'utf8');

function loadSdk() {
  const requests = [];
  const window = {
    parent: {},
    __HOMEGLOW_PLUGIN__: { id: 'grill-card', apiVersion: 'v1' },
    location: { search: '?device=Kitchen%20wall', href: 'https://hg.example/widgets/Grill.html?device=Kitchen%20wall', origin: 'https://hg.example' },
    addEventListener() {},
  };
  const document = { documentElement: { style: { setProperty() {} }, setAttribute() {} }, fonts: { add() {} } };
  const fetch = (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}'), json: () => Promise.resolve({ ok: true }) });
  };
  vm.runInNewContext(sdkSource, { window, document, URLSearchParams, URL, console, fetch });
  return { HomeGlow: window.HomeGlow, requests };
}

test('phones() lists the household\'s phones', async () => {
  const { HomeGlow, requests } = loadSdk();
  await HomeGlow.notify.phones();
  assert.equal(requests[0].method, 'GET');
  assert.match(requests[0].url, /\/api\/plugin\/v1\/notify\/grill-card\/phones$/);
});

test('send() sends the phones, the text, urgent and tag, and the display', async () => {
  const { HomeGlow, requests } = loadSdk();
  await HomeGlow.notify.send(['mobile_app_sams_pixel'], { title: 'Grill', message: 'Brisket is 198°.', urgent: true, tag: 'food' });
  assert.match(requests[0].url, /\/api\/plugin\/v1\/notify\/grill-card$/);
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(requests[0].body, { phones: ['mobile_app_sams_pixel'], title: 'Grill', message: 'Brisket is 198°.', urgent: true, tag: 'food', device: 'Kitchen wall' });
  await HomeGlow.notify.send(['mobile_app_sams_pixel'], { message: 'Timer done' });
  assert.deepEqual(requests[1].body, { phones: ['mobile_app_sams_pixel'], message: 'Timer done', device: 'Kitchen wall' });
});

test('clear() takes back a tag', async () => {
  const { HomeGlow, requests } = loadSdk();
  await HomeGlow.notify.clear(['mobile_app_sams_pixel'], 'food');
  assert.match(requests[0].url, /\/api\/plugin\/v1\/notify\/grill-card\/clear$/);
  assert.deepEqual(requests[0].body, { phones: ['mobile_app_sams_pixel'], tag: 'food', device: 'Kitchen wall' });
});
