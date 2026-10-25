// Writes sent by another website are refused (mrramam/HomeGlow#62).
const test = require('node:test');
const assert = require('node:assert/strict');
const { isCrossSiteWrite } = require('../utils/crossSiteWrites');

const allowed = (origin) => origin === 'http://localhost:3012';
const write = (headers, method = 'POST') => isCrossSiteWrite({ method, headers }, allowed);

test('a write from another site is refused', () => {
  assert.equal(write({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', host: 'homeglow.local' }), true);
  // Same site, another origin: a different service on the same box.
  assert.equal(write({ origin: 'http://homeglow.local:8080', 'sec-fetch-site': 'same-site', host: 'homeglow.local' }), true);
  assert.equal(write({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, 'DELETE'), true);
});

test("the dashboard's own writes go through, behind any proxy", () => {
  // The browser says same-origin, whatever Host the proxy passed on.
  assert.equal(write({ origin: 'https://home.example.com', 'sec-fetch-site': 'same-origin', host: 'homeglow-backend:5000' }), false);
});

test('an older browser with no Sec-Fetch-Site is judged by host', () => {
  // nginx passes Host $host, without the port.
  assert.equal(write({ origin: 'http://192.168.1.20:3000', host: '192.168.1.20' }), false);
  assert.equal(write({ origin: 'https://home.example.com', host: 'backend', 'x-forwarded-host': 'home.example.com' }), false);
  assert.equal(write({ origin: 'https://evil.example', host: '192.168.1.20' }), true);
  assert.equal(write({ origin: 'not a url', host: '192.168.1.20' }), true);
});

test('reads, plugins, scripts and allowed origins are untouched', () => {
  assert.equal(write({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, 'GET'), false);
  assert.equal(write({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, 'OPTIONS'), false);
  assert.equal(write({ origin: 'null', 'sec-fetch-site': 'cross-site' }), false, 'pluginRequestPolicy decides');
  assert.equal(write({}), false, 'curl, Home Assistant, other servers');
  assert.equal(write({ origin: 'http://localhost:3012', 'sec-fetch-site': 'same-site' }), false, 'the Vite dev server');
});
